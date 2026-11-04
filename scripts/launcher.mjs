#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  AgriQNet one-command launcher
//    npm start                  set up (first run only) and start every service
//    npm start -- --skip=rag    start everything except the Farmer Library (AgriRAG)
//    npm start -- --only=mongo,api,web
//    npm start -- --open        also open the web app in your browser
//    npm run setup              install everything, start nothing
//    npm run reseed             wipe MongoDB, reseed demo data, then start
//    npm run demo               like reseed, but with NO pest alerts (clean map for a live demo)
//  No global installs needed beyond Node.js ≥ 18.17 and Python 3.10–3.13.
// ─────────────────────────────────────────────────────────────────────────────
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IS_WIN = process.platform === 'win32';
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const listArg = (name) => (args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] || '').split(',').filter(Boolean);

// ---------- pretty output ----------
const C = { reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m' };
const paint = (c, s) => `${C[c]}${s}${C.reset}`;
const log = (msg) => console.log(`${paint('green', '[agriqnet]')} ${msg}`);
const warn = (msg) => console.log(`${paint('yellow', '[agriqnet]')} ${msg}`);
const fail = (msg) => { console.error(`${paint('red', '[agriqnet] ✖')} ${msg}`); process.exit(1); };

// ---------- .env ----------
function parseEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}
const envFile = path.join(ROOT, '.env');
if (!fs.existsSync(envFile)) {
  fs.copyFileSync(path.join(ROOT, '.env.example'), envFile);
  warn('Created .env from .env.example — add your GEMINI_API_KEY / GROQ_API_KEY / OpenWeather key there.');
}
const fileEnv = parseEnv(envFile);
const E = { ...fileEnv, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k in fileEnv || k.startsWith('AGRIQNET'))) };
const val = (k, d) => (E[k] !== undefined && E[k] !== '' ? E[k] : d);

const HOME = val('AGRIQNET_HOME', IS_WIN
  ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'AgriQNet')
  : path.join(os.homedir(), '.agriqnet'));
const LOG_DIR = path.join(HOME, 'logs');
const VENV = path.join(HOME, 'venv');
const VENV_PY = IS_WIN ? path.join(VENV, 'Scripts', 'python.exe') : path.join(VENV, 'bin', 'python');
fs.mkdirSync(LOG_DIR, { recursive: true });

const PORTS = {
  mongo: Number(val('MONGO_PORT', 27017)),
  api: Number(val('API_PORT', 5000)),
  web: Number(val('WEB_PORT', 3000)),
  weather: Number(val('WEATHER_PORT', 5175)),
  'pest-detector': Number(val('PEST_DETECTOR_PORT', 8001)),
  recommender: Number(val('RECOMMENDER_PORT', 8002)),
  rag: Number(val('RAG_PORT', 8003)),
};
const externalMongo = Boolean(E.MONGO_URI) && !/127\.0\.0\.1|localhost/.test(E.MONGO_URI);

// ---------- helpers ----------
const hashFiles = (...files) => {
  const h = crypto.createHash('sha1');
  for (const f of files) if (fs.existsSync(f)) h.update(fs.readFileSync(f));
  return h.digest('hex');
};
const stampOk = (name, hash) => fs.existsSync(path.join(HOME, `.${name}.stamp`)) && fs.readFileSync(path.join(HOME, `.${name}.stamp`), 'utf8') === hash;
const writeStamp = (name, hash) => fs.writeFileSync(path.join(HOME, `.${name}.stamp`), hash);

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: IS_WIN && /npm|npx/.test(cmd), ...opts });
  return r.status === 0;
}

function portOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const s = net.connect({ port, host });
    s.setTimeout(800);
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('timeout', () => { s.destroy(); resolve(false); });
    s.on('error', () => resolve(false));
  });
}

async function httpOk(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

// ---------- prerequisites ----------
function checkNode() {
  const [maj, min] = process.versions.node.split('.').map(Number);
  if (maj < 18 || (maj === 18 && min < 17)) fail(`Node.js ≥ 18.17 required (found ${process.versions.node}). Install the LTS from https://nodejs.org`);
}

function findPython() {
  const candidates = IS_WIN
    ? [['py', ['-3.12']], ['py', ['-3.11']], ['py', ['-3.13']], ['py', ['-3.10']], ['py', ['-3']], ['python', []], ['python3', []]]
    : [['python3.12', []], ['python3.11', []], ['python3.13', []], ['python3.10', []], ['python3', []], ['python', []]];
  if (E.PYTHON) candidates.unshift([E.PYTHON, []]);
  for (const [cmd, pre] of candidates) {
    const r = spawnSync(cmd, [...pre, '-c', 'import sys; print("%d.%d" % sys.version_info[:2])'], { encoding: 'utf8' });
    if (r.status === 0) {
      const [maj, min] = r.stdout.trim().split('.').map(Number);
      if (maj === 3 && min >= 10 && min <= 13) return { cmd, pre, version: `${maj}.${min}` };
    }
  }
  return null;
}

// ---------- setup ----------
const NODE_PACKAGES = ['services/api', 'apps/web', 'apps/weather'];

function setupNode(selected) {
  for (const rel of NODE_PACKAGES) {
    const name = rel.split('/')[1];
    const needed = { api: ['api', 'mongo'], web: ['web'], weather: ['weather'] }[name];
    if (!needed.some((s) => selected.has(s))) continue;
    const dir = path.join(ROOT, rel);
    const hash = hashFiles(path.join(dir, 'package.json'), path.join(dir, 'package-lock.json'));
    if (fs.existsSync(path.join(dir, 'node_modules')) && stampOk(`npm-${name}`, hash)) continue;
    log(`Installing npm packages for ${paint('bold', rel)} …`);
    if (!run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir })) fail(`npm install failed in ${rel}`);
    writeStamp(`npm-${name}`, hash);
  }
}

function setupPython() {
  const req = path.join(ROOT, 'services', 'requirements.txt');
  const hash = hashFiles(req);
  if (fs.existsSync(VENV_PY) && stampOk('venv', hash)) return true;

  const py = findPython();
  if (!py) {
    warn('Python 3.10–3.13 not found → YOLO, recommender and AgriRAG will be skipped.');
    warn('Install Python 3.12 from https://www.python.org/downloads/ (tick "Add to PATH"), then run npm start again.');
    return false;
  }
  if (!fs.existsSync(VENV_PY)) {
    log(`Creating Python ${py.version} virtual environment in ${VENV}`);
    if (!run(py.cmd, [...py.pre, '-m', 'venv', VENV])) fail('Could not create the Python virtual environment');
  }
  log('Installing Python packages (first run downloads ~1.5 GB: PyTorch CPU, YOLO, sentence-transformers) …');
  run(VENV_PY, ['-m', 'pip', 'install', '--upgrade', 'pip', '--quiet']);
  // CPU-only PyTorch keeps the download small and works on every machine
  if (!run(VENV_PY, ['-m', 'pip', 'install', 'torch', 'torchvision', '--index-url', 'https://download.pytorch.org/whl/cpu'])) fail('Installing PyTorch failed');
  if (!run(VENV_PY, ['-m', 'pip', 'install', '-r', req])) fail('pip install -r services/requirements.txt failed');
  writeStamp('venv', hash);
  return true;
}

// ---------- services ----------
const node = process.execPath;
const vite = (app) => [node, [path.join(ROOT, 'apps', app, 'node_modules', 'vite', 'bin', 'vite.js')]];

function serviceDefs() {
  return [
    { name: 'mongo', color: 'gray', ipc: true, cwd: 'services/api', cmd: node, args: ['src/mongo-server.js'], ready: () => portOpen(PORTS.mongo), timeout: 240, skipIf: externalMongo && 'MONGO_URI points to an external database' },
    { name: 'api', color: 'green', cwd: 'services/api', cmd: node, args: ['src/index.js'], after: ['mongo'], ready: () => httpOk(`http://127.0.0.1:${PORTS.api}/api/health`), timeout: 120, url: `http://localhost:${PORTS.api}/api/health` },
    { name: 'pest-detector', color: 'magenta', python: true, cwd: 'services/pest-detector', args: ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(PORTS['pest-detector'])], ready: () => httpOk(`http://127.0.0.1:${PORTS['pest-detector']}/health`), timeout: 300, url: `http://localhost:${PORTS['pest-detector']}/docs` },
    { name: 'recommender', color: 'yellow', python: true, cwd: 'services/recommender', args: ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(PORTS.recommender)], ready: () => httpOk(`http://127.0.0.1:${PORTS.recommender}/health`), timeout: 180, url: `http://localhost:${PORTS.recommender}/docs` },
    { name: 'rag', color: 'blue', python: true, cwd: 'services/agri-rag', args: ['app.py'], ready: () => httpOk(`http://127.0.0.1:${PORTS.rag}/health`), timeout: 420, url: `http://localhost:${PORTS.rag}` },
    { name: 'web', color: 'cyan', cwd: 'apps/web', cmd: vite('web')[0], args: vite('web')[1], ready: () => portOpen(PORTS.web), timeout: 90, url: `http://localhost:${PORTS.web}` },
    { name: 'weather', color: 'blue', cwd: 'apps/weather', cmd: vite('weather')[0], args: vite('weather')[1], ready: () => portOpen(PORTS.weather), timeout: 90, url: `http://localhost:${PORTS.weather}` },
  ];
}

const children = new Map();
let shuttingDown = false;

function prefixStream(stream, name, color, logFile) {
  let buf = '';
  stream.on('data', (chunk) => {
    logFile.write(chunk);
    buf += chunk.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (const l of lines) if (l.trim()) process.stdout.write(`${paint(color, `[${name.padEnd(14)}]`)} ${l}\n`);
  });
}

function start(def, childEnv) {
  const logFile = fs.createWriteStream(path.join(LOG_DIR, `${def.name}.log`), { flags: 'a' });
  logFile.write(`\n===== ${new Date().toISOString()} =====\n`);
  const cmd = def.python ? VENV_PY : def.cmd;
  const child = spawn(cmd, def.args, {
    cwd: path.join(ROOT, def.cwd),
    env: childEnv,
    stdio: def.ipc ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  prefixStream(child.stdout, def.name, def.color, logFile);
  prefixStream(child.stderr, def.name, def.color, logFile);
  child.on('exit', (code, sig) => {
    children.delete(def.name);
    if (!shuttingDown) warn(`${def.name} exited (${sig || `code ${code}`}). Log: ${path.join(LOG_DIR, `${def.name}.log`)}`);
  });
  children.set(def.name, child);
  return child;
}

async function waitReady(def) {
  const deadline = Date.now() + def.timeout * 1000;
  while (Date.now() < deadline) {
    if (!children.has(def.name)) return false;
    if (await def.ready()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  // async on Windows so all services are stopped at the same time (taskkill takes ~0.3 s each)
  if (IS_WIN) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', () => {});
  else try { child.kill('SIGTERM'); } catch { /* ignore */ }
}

async function shutdown() {
  if (shuttingDown) {
    log('Still stopping — MongoDB is saving your data, this takes a few seconds…');
    return;
  }
  shuttingDown = true;
  const t0 = Date.now();
  console.log('');
  log('Stopping all services …');
  // MongoDB shuts itself down cleanly (data is flushed to disk) while the other services
  // are stopped in parallel. mongo-server.js caps its own shutdown at 6 s.
  const mongo = children.get('mongo');
  if (mongo) { try { mongo.send('shutdown'); } catch { if (!IS_WIN) mongo.kill('SIGINT'); } }
  for (const [name, child] of children) if (name !== 'mongo') killTree(child);
  while (children.size && Date.now() - t0 < 7500) await new Promise((r) => setTimeout(r, 100));
  for (const child of children.values()) killTree(child); // anything left after the limit
  log(paint('green', `All services stopped in ${((Date.now() - t0) / 1000).toFixed(1)} s. Your data is saved.`));
  setTimeout(() => process.exit(0), 100);
}

function openBrowser(url) {
  if (IS_WIN) spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

// ---------- main ----------
async function main() {
  checkNode();
  console.log(paint('green', paint('bold', '\n  🌱 AgriQNet platform\n')));
  log(`Runtime folder (venv, MongoDB data, logs): ${HOME}`);

  const all = serviceDefs();
  const only = listArg('only');
  const skip = listArg('skip');
  let selected = new Set(all.map((s) => s.name).filter((n) => (only.length ? only.includes(n) : true) && !skip.includes(n)));
  if (selected.has('api') && !externalMongo) selected.add('mongo');

  // 1) setup
  if (!flag('no-install')) {
    setupNode(selected);
    const wantsPython = all.some((s) => s.python && selected.has(s.name));
    if (wantsPython && !setupPython()) selected = new Set([...selected].filter((n) => !all.find((s) => s.name === n)?.python));
  }
  if (flag('setup-only')) { log(paint('green', 'Setup complete. Run `npm start` to launch.')); return; }

  if (!E.GEMINI_API_KEY) warn('GEMINI_API_KEY is empty in .env — AI chat/advisors will be unavailable.');

  // 2) start
  const childEnv = {
    ...process.env, ...E,
    AGRIQNET_HOME: HOME,
    PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1',
    HF_HUB_DISABLE_SYMLINKS_WARNING: '1', TOKENIZERS_PARALLELISM: 'false', FORCE_COLOR: '1',
    YOLO_CONFIG_DIR: path.join(HOME, 'ultralytics'),
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  if (IS_WIN) process.on('SIGBREAK', shutdown);

  const defs = all.filter((d) => selected.has(d.name));
  const status = {};

  for (const d of defs) {
    if (d.skipIf) { status[d.name] = `skipped (${d.skipIf})`; continue; }
    if (d.name !== 'mongo' && (await portOpen(PORTS[d.name]))) {
      warn(`Port ${PORTS[d.name]} is already in use → not starting ${d.name} (another copy running?).`);
      status[d.name] = 'port busy';
      continue;
    }
    // MongoDB must be up before the API (and before an optional reseed)
    if (d.after) for (const dep of d.after) {
      const depDef = defs.find((x) => x.name === dep);
      if (depDef && children.has(dep) && !(await waitReady(depDef))) warn(`${dep} did not become ready in time`);
    }
    if (d.name === 'api' && (flag('reseed') || flag('demo'))) {
      log(flag('demo') ? 'Preparing the live demo: districts, farmers and demo accounts, with no pest alerts …' : 'Reseeding MongoDB (all data will be replaced with demo data) …');
      run(node, ['src/seed/index.js', '--reset', ...(flag('demo') ? ['--demo'] : [])], { cwd: path.join(ROOT, 'services/api'), env: childEnv });
    }
    log(`Starting ${paint(d.color, d.name)} …`);
    start(d, childEnv);
  }

  // 3) wait for readiness & print summary
  log('Waiting for services to become ready (first start of the Python services can take a few minutes) …');
  await Promise.all(defs.filter((d) => children.has(d.name)).map(async (d) => {
    status[d.name] = (await waitReady(d)) ? 'ready' : (children.has(d.name) ? 'still starting' : 'failed');
  }));

  const rows = [
    ['AgriQNet app (incl. Alert Network)', 'web'], ['Weather station', 'weather'],
    ['API gateway', 'api'], ['YOLO pest detector', 'pest-detector'], ['Crop/Fertilizer models', 'recommender'], ['Farmer Library (AgriRAG)', 'rag'], ['MongoDB', 'mongo'],
  ];
  console.log(`\n${paint('bold', '  Service                             Status            URL')}`);
  for (const [label, key] of rows) {
    if (!selected.has(key)) continue;
    const s = status[key] || 'not started';
    const color = s === 'ready' ? 'green' : s === 'still starting' ? 'yellow' : 'red';
    const def = all.find((x) => x.name === key);
    const url = key === 'mongo' ? (externalMongo ? 'external MONGO_URI' : `mongodb://127.0.0.1:${PORTS.mongo}/agriqnet`) : def?.url || '';
    console.log(`  ${label.padEnd(36)}${paint(color, s.padEnd(18))}${url}`);
  }
  console.log(`\n  ${paint('bold', 'Open:')} ${paint('cyan', `http://localhost:${PORTS.web}`)}   ·   demo login: +91 0000000000 / demo1234 (or "Try Demo Mode")`);
  console.log(`  Logs: ${LOG_DIR}   ·   Press ${paint('bold', 'Ctrl+C')} to stop everything.\n`);

  if (flag('open') && status.web === 'ready') openBrowser(`http://localhost:${PORTS.web}`);
}

main().catch((e) => { console.error(e); shutdown(); });
