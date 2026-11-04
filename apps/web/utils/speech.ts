// Read-aloud and voice input in the farmer's language.
//  • Read-aloud: the device's own voice when it has one for the language (instant, offline),
//    otherwise the AgriQNet API's Sarvam voice (good Kannada/Telugu/Hindi), cached per text.
//  • Voice input: the browser's speech recognition (Chrome/Edge) in the same language.
import { Language } from '../types';
import { LOCALES } from './translations';

let audio: HTMLAudioElement | null = null;
let listeners = new Set<(id: string | null) => void>();
let playingId: string | null = null;
const audioCache = new Map<string, string>();

const setPlaying = (id: string | null) => { playingId = id; listeners.forEach((fn) => fn(id)); };
export const onSpeechChange = (fn: (id: string | null) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const currentSpeech = () => playingId;

/** Remove markdown, emoji and links so the voice reads only words. */
export function speakable(text: string) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#>`|~]+/g, ' ')
    .replace(/\p{Extended_Pictographic}|️/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  if (!('speechSynthesis' in window)) return Promise.resolve([]);
  const v = speechSynthesis.getVoices();
  if (v.length) return Promise.resolve(v);
  return new Promise((res) => {
    const done = () => res(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 800);
  });
}

async function deviceVoice(lang: Language) {
  const prefix = LOCALES[lang].slice(0, 2);
  const voices = await voicesReady();
  return voices.find((v) => v.lang.replace('_', '-').toLowerCase() === LOCALES[lang].toLowerCase())
    || voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) || null;
}

export function stopSpeaking() {
  try { speechSynthesis.cancel(); } catch { /* ignore */ }
  if (audio) { audio.pause(); audio = null; }
  setPlaying(null);
}

/** Speak `text`; resolves false when no voice exists for this language (UI shows a hint). */
export async function speak(text: string, lang: Language, id = 'speech'): Promise<boolean> {
  stopSpeaking();
  const clean = speakable(text).slice(0, 1400);
  if (!clean) return false;
  setPlaying(id);

  const voice = await deviceVoice(lang);
  if (voice) {
    const u = new SpeechSynthesisUtterance(clean);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.92;
    u.onend = u.onerror = () => { if (playingId === id) setPlaying(null); };
    speechSynthesis.speak(u);
    return true;
  }

  try {
    const key = `${lang}|${clean}`;
    let url = audioCache.get(key);
    if (!url) {
      const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: clean, lang }) });
      if (!r.ok) throw new Error(String(r.status));
      url = URL.createObjectURL(await r.blob());
      audioCache.set(key, url);
    }
    if (playingId !== id) return true; // stopped while loading
    audio = new Audio(url);
    audio.onended = audio.onerror = () => { if (playingId === id) setPlaying(null); };
    await audio.play();
    return true;
  } catch {
    setPlaying(null);
    return false;
  }
}

// ---------------- Voice input ----------------
export const canListen = () => typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

/** Start listening; returns a stop() function. onText gets the running transcript. */
export function listen(lang: Language, onText: (text: string, final: boolean) => void, onEnd: (error?: string) => void) {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) { onEnd('unsupported'); return () => {}; }
  stopSpeaking();
  const rec = new SR();
  rec.lang = LOCALES[lang];
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e: any) => {
    const res = Array.from(e.results as ArrayLike<any>);
    onText(res.map((r: any) => r[0].transcript).join(''), res.every((r: any) => r.isFinal));
  };
  rec.onerror = (e: any) => onEnd(e.error || 'error');
  rec.onend = () => onEnd();
  try { rec.start(); } catch { onEnd('error'); }
  return () => { try { rec.stop(); } catch { /* ignore */ } };
}
