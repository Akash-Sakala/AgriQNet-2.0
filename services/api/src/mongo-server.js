// Embedded, persistent MongoDB for local development — no MongoDB install or Docker needed.
// The mongod binary is downloaded once (~70–100 MB) into <AGRIQNET_HOME>/mongodb-binaries
// and data lives in <AGRIQNET_HOME>/mongo-data (outside OneDrive to avoid sync/lock issues).
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { config, runtimeHome } from './config.js';

const home = runtimeHome();
const dbPath = process.env.MONGO_DATA_DIR || path.join(home, 'mongo-data');
const binDir = path.join(home, 'mongodb-binaries');
fs.mkdirSync(dbPath, { recursive: true });
fs.mkdirSync(binDir, { recursive: true });
process.env.MONGOMS_DOWNLOAD_DIR ||= binDir;
process.env.MONGOMS_VERSION ||= process.env.MONGO_VERSION || '7.0.14';

const port = config.mongoPort;

function portInUse(p) {
  return new Promise((resolve) => {
    const s = net.connect({ port: p, host: '127.0.0.1' }, () => { s.end(); resolve(true); });
    s.on('error', () => resolve(false));
  });
}

if (await portInUse(port)) {
  console.log(`[mongo] Something is already listening on 127.0.0.1:${port} — assuming it is MongoDB and reusing it.`);
  // stay alive so the launcher treats this service as running
  setInterval(() => {}, 1 << 30);
} else {
  const { MongoMemoryServer } = await import('mongodb-memory-server-core');
  console.log(`[mongo] Starting embedded MongoDB ${process.env.MONGOMS_VERSION} on port ${port}`);
  console.log(`[mongo] Data directory: ${dbPath}`);
  console.log('[mongo] (first run downloads the mongod binary — this can take a minute)');

  // A crashed previous run can leave a lock file behind.
  const lock = path.join(dbPath, 'mongod.lock');
  if (fs.existsSync(lock) && fs.statSync(lock).size > 0) {
    console.log('[mongo] Removing stale mongod.lock from a previous unclean shutdown');
    try { fs.writeFileSync(lock, ''); } catch { /* ignore */ }
  }

  const server = await MongoMemoryServer.create({
    instance: { port, ip: '127.0.0.1', dbPath, storageEngine: 'wiredTiger', launchTimeout: 60000 },
    binary: { downloadDir: binDir },
  });
  console.log(`[mongo] Ready: ${server.getUri()}`);

  // Quick but clean shutdown: ask mongod itself to shut down (it flushes data to disk and exits,
  // normally in about a second). Ctrl+C reaches this process twice on Windows (console + launcher),
  // so only the first request counts, and a hard limit makes sure the terminal is never kept waiting.
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    const t0 = Date.now();
    console.log('[mongo] Stopping MongoDB (your data is kept)…');
    setTimeout(() => { console.log('[mongo] Stopped (forced after 6 s).'); process.exit(0); }, 6000);
    try {
      const { default: mongoose } = await import('mongoose');
      const client = await mongoose.mongo.MongoClient.connect(`mongodb://127.0.0.1:${port}/admin`, { serverSelectionTimeoutMS: 1500, connectTimeoutMS: 1500, directConnection: true });
      // mongod closes the connection as it exits, so an error here is the normal outcome
      await client.db('admin').command({ shutdown: 1, force: true, timeoutSecs: 1 }).catch(() => {});
      await client.close(true).catch(() => {});
    } catch { /* mongod may already be stopping (Windows sends it Ctrl+C too) */ }
    // Let mongod finish writing to disk on its own (on Windows it also got Ctrl+C directly);
    // only then tidy up the helper processes, so it is never cut off mid-write.
    const pid = server.instanceInfo?.instance?.mongodProcess?.pid;
    const alive = () => { try { return pid ? (process.kill(pid, 0), true) : false; } catch { return false; } };
    for (let i = 0; i < 45 && alive(); i++) await new Promise((r) => setTimeout(r, 100));
    try { await server.stop({ doCleanup: false, force: false }); } catch { /* already stopped */ }
    console.log(`[mongo] Stopped cleanly in ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
    process.exit(0);
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) process.on(sig, shutdown);
  process.on('message', (m) => { if (m === 'shutdown') shutdown(); });
}
