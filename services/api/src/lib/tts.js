// Read-aloud backup voice: Sarvam "Bulbul" text-to-speech (natural Kannada/Telugu/Hindi).
// The browser's own voice is used first (free, offline); this is only called when the
// device has no voice for the language. Needs SARVAM_API_KEY in .env.
import crypto from 'node:crypto';

const KEY = () => process.env.SARVAM_API_KEY || '';
const MODEL = () => process.env.SARVAM_TTS_MODEL || 'bulbul:v2';
const SPEAKER = () => process.env.SARVAM_TTS_SPEAKER || 'anushka';
const LOCALE = { en: 'en-IN', hi: 'hi-IN', kn: 'kn-IN', te: 'te-IN' };

const cache = new Map(); // small in-memory cache: same advice read twice costs nothing
const MAX_CACHE = 100;

export const ttsStatus = () => ({ provider: KEY() ? 'sarvam' : 'browser-only', model: KEY() ? MODEL() : null });

/** Strip Markdown/emoji so the voice reads plain sentences. */
export function speakable(text) {
  return String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_#>`~|]/g, ' ')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function synthesize(text, lang = 'en') {
  if (!KEY()) throw Object.assign(new Error('Read-aloud voice service is not set up (SARVAM_API_KEY missing)'), { status: 503 });
  const clean = speakable(text).slice(0, MODEL() === 'bulbul:v2' ? 1450 : 2400);
  const id = crypto.createHash('sha1').update(`${lang}|${clean}`).digest('hex');
  if (cache.has(id)) return cache.get(id);

  const r = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-subscription-key': KEY() },
    body: JSON.stringify({ text: clean, language_code: LOCALE[lang] || 'en-IN', model: MODEL(), speaker: SPEAKER(), pace: 0.9, speech_sample_rate: 22050 }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.audios?.[0]) {
    throw Object.assign(new Error(`Voice service error: ${data?.error?.message || data?.message || r.status}`), { status: 502 });
  }
  const wav = Buffer.from(data.audios[0], 'base64');
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(id, wav);
  return wav;
}
