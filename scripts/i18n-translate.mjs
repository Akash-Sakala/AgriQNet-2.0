#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Fills missing Hindi / Kannada / Telugu strings with Gemini.
//   npm run i18n          → translate keys that are missing in hi/kn/te
//   npm run i18n -- --check   → only report missing keys (exit 1 if any)
//
// English (en.json) is the single source of truth. Existing translations are never
// overwritten, so you can hand-correct any string and it will stay.
// Rules given to the model: simple everyday words a Karnataka farmer would use,
// keep {placeholders}, brand names and units unchanged.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = { hi: 'Hindi', kn: 'Kannada', te: 'Telugu' };
// Unicode block of each target script – used to reject answers in the wrong language/script
const SCRIPT = { hi: [0x0900, 0x097f], kn: [0x0c80, 0x0cff], te: [0x0c00, 0x0c7f] };
const OTHER_SCRIPTS = /[\u0980-\u0bff\u0d00-\u0dff]/; // Bengali…Tamil, Malayalam…Sinhala
function wrongScript(value, lang) {
  const [lo, hi] = SCRIPT[lang];
  const text = Array.isArray(value) ? value.join(' ') : String(value);
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c < 0x0900 || (c >= 0x2000 && c <= 0x2bff) || c >= 0x1f000 || c === 0xfe0f) continue; // ASCII, punctuation, symbols, emoji
    if (c === 0x200c || c === 0x200d) continue;
    if (c < lo || c > hi) return true;
  }
  return OTHER_SCRIPTS.test(text) && lang !== 'te' && lang !== 'kn';
}
const hasTargetScript = (value, lang) => {
  const [lo, hi] = SCRIPT[lang];
  return [...(Array.isArray(value) ? value.join(' ') : String(value))].some((ch) => ch.codePointAt(0) >= lo && ch.codePointAt(0) <= hi);
};

// [english source file, output pattern]
const BUNDLES = [
  ['apps/web/utils/i18n/en.json', 'apps/web/utils/i18n/{lang}.json', 'AgriQNet farmer app user interface'],
  ['apps/weather/src/i18n/en.json', 'apps/weather/src/i18n/{lang}.json', 'farm weather station user interface'],
  ['services/api/src/i18n/en.json', 'services/api/src/i18n/{lang}.json', 'SMS alerts and agro-weather advisories sent to farmers'],
  ['services/api/src/i18n/pests.en.json', 'services/api/src/i18n/pests.{lang}.json', 'insect pest names (IP102 dataset) and pest-management tips. For scientific Latin names use the common local name if one exists, otherwise transliterate the name into the script'],
];

function readEnv() {
  const f = path.join(ROOT, '.env');
  const out = {};
  if (!fs.existsSync(f)) return out;
  for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = { ...readEnv(), ...process.env };
const KEY = env.GEMINI_API_KEY;
const MODEL = env.GEMINI_I18N_MODEL || 'gemini-3.5-flash';
const checkOnly = process.argv.includes('--check');

const placeholders = (s) => (typeof s === 'string' ? (s.match(/\{\w+\}/g) || []).sort().join(',') : '');

async function translateBatch(entries, lang, context) {
  const prompt = `Translate the values of this JSON object from English into ${LANGS[lang]} (${LANGS[lang]} script only) for a ${context}.
OUTPUT LANGUAGE: ${LANGS[lang]}. Every value must be written in ${LANGS[lang]}${lang === 'kn' ? '' : ' — do NOT answer in Kannada'}.
Audience: small farmers in South India. Use simple, everyday ${LANGS[lang]} words a farmer understands (not formal/Sanskritised words), short sentences.
Rules:
- Return a JSON object with exactly the same keys.
- Keep {placeholders} like {crop} or {n} exactly as they are.
- Keep these unchanged: AgriQNet, SMS, OTP, AI, GPS, NPK, DAP, YOLOv8, Gemini, km/h, mm, °C, numbers, emoji.
- Values that are arrays must stay arrays of the same length.
- Crop and place names: use the name farmers use locally, in ${LANGS[lang]} script.

${JSON.stringify(Object.fromEntries(entries), null, 1)}`;
  // Providers: Gemini models first, then Groq (free-tier Gemini keys allow only ~20 requests/day/model)
  const providers = [
    ...(KEY ? [...new Set([MODEL, 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite'])].map((m) => ({ kind: 'gemini', model: m })) : []),
    ...(env.GROQ_API_KEY ? [{ kind: 'groq', model: env.GROQ_I18N_MODEL || 'openai/gpt-oss-120b' }] : []),
  ];
  for (const p of providers) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      let r, data, text;
      if (p.kind === 'gemini') {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${p.model}:generateContent?key=${KEY}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } }),
        });
        data = await r.json();
        text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      } else {
        r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GROQ_API_KEY}` },
          body: JSON.stringify({ model: p.model, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
        });
        data = await r.json();
        text = data?.choices?.[0]?.message?.content;
      }
      if (r.ok && text) {
        try { return JSON.parse(text); } catch { /* retry */ }
      }
      const msg = String(data?.error?.message || 'bad JSON').split('\n')[0].slice(0, 120);
      console.warn(`  retry [${p.kind}:${p.model}] (${r.status} ${msg})`);
      if (r.status === 429 || r.status === 404) break; // quota / retired → next provider
      await new Promise((res) => setTimeout(res, 2500 * attempt));
    }
  }
  throw new Error('All translation providers failed');
}

let missingTotal = 0;
for (const [srcRel, outPattern, context] of BUNDLES) {
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, srcRel), 'utf8'));
  for (const lang of Object.keys(LANGS)) {
    const outFile = path.join(ROOT, outPattern.replace('{lang}', lang));
    const cur = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
    // drop keys no longer in English
    for (const k of Object.keys(cur)) if (!(k in en) || wrongScript(cur[k], lang)) delete cur[k];
    const missing = Object.entries(en).filter(([k]) => cur[k] === undefined || cur[k] === '');
    missingTotal += missing.length;
    if (!missing.length) continue;
    console.log(`${srcRel} → ${lang}: ${missing.length} missing`);
    if (checkOnly) continue;
    if (!KEY) { console.error('GEMINI_API_KEY not set'); process.exit(1); }
    for (let i = 0; i < missing.length; i += 60) {
      const batch = missing.slice(i, i + 60);
      const out = await translateBatch(batch, lang, context);
      for (const [k, v] of batch) {
        const tv = out[k];
        if (tv === undefined || placeholders(tv) !== placeholders(v) || Array.isArray(tv) !== Array.isArray(v)) {
          console.warn(`  ! skipped "${k}" (placeholder/shape mismatch)`);
          continue;
        }
        if (wrongScript(tv, lang) || (!hasTargetScript(tv, lang) && /[a-z]{4}/i.test(String(v)) && !/^(pest_|fert_)/.test(k))) {
          console.warn(`  ! skipped "${k}" (not in ${LANGS[lang]} script)`);
          continue;
        }
        cur[k] = tv;
      }
      process.stdout.write(`  ${Math.min(i + 60, missing.length)}/${missing.length}\n`);
      // save after every batch (keeps key order identical to English)
      const ordered = Object.fromEntries(Object.keys(en).filter((k) => k in cur).map((k) => [k, cur[k]]));
      fs.writeFileSync(outFile, JSON.stringify(ordered, null, 2) + '\n');
    }
  }
}
if (checkOnly) {
  console.log(missingTotal ? `${missingTotal} missing translations` : 'All translations complete ✔');
  process.exit(missingTotal ? 1 : 0);
}
console.log('Done.');
