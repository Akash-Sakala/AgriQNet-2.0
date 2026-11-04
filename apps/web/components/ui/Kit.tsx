// Shared farmer-friendly building blocks: big picture buttons, read-aloud, voice input,
// screen titles with a Back button. Every choice shows an icon/picture + short text + a tick
// when selected — never colour alone.
import React, { useEffect, useRef, useState } from 'react';
import { Volume2, Square, Mic, MicOff, ArrowLeft, Check, Loader2 } from 'lucide-react';
import { Language } from '../../types';
import { getTranslation } from '../../utils/translations';
import { motion } from 'motion/react';
import type { Icon as PhIcon } from '@phosphor-icons/react';
import { IconChip, SCREEN, Tone } from './Icons';
import { speak, stopSpeaking, onSpeechChange, currentSpeech, listen, canListen } from '../../utils/speech';

let uid = 0;

/** Round speaker button. Reads `text` in the farmer's language (device voice, else Sarvam). */
export const SpeakButton: React.FC<{ text: string | (() => string); lang: Language; size?: 'sm' | 'md' | 'lg'; label?: boolean; className?: string; tone?: 'light' | 'dark' }> = ({ text, lang, size = 'md', label = false, className = '', tone = 'light' }) => {
  const t = getTranslation(lang);
  const id = useRef(`sp${++uid}`).current;
  const [playing, setPlaying] = useState(currentSpeech() === id);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState(false);
  useEffect(() => onSpeechChange((p) => { setPlaying(p === id); if (p !== id) setLoading(false); }), [id]);
  useEffect(() => () => { if (currentSpeech() === id) stopSpeaking(); }, [id]);

  const dim = size === 'lg' ? 'w-14 h-14' : size === 'sm' ? 'w-9 h-9' : 'w-11 h-11';
  const icon = size === 'lg' ? 26 : size === 'sm' ? 16 : 20;
  const colors = tone === 'dark' ? 'bg-white/20 text-white hover:bg-white/30' : playing ? 'bg-agri-700 text-white' : 'bg-paper text-agri-700 hover:bg-agri-50 border border-agri-200';

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (playing) return stopSpeaking();
    setLoading(true);
    const ok = await speak(typeof text === 'function' ? text() : text, lang, id);
    setLoading(false);
    if (!ok) { setHint(true); setTimeout(() => setHint(false), 4000); }
  };

  return (
    <span className={`${/\b(absolute|fixed)\b/.test(className) ? '' : 'relative '}inline-flex items-center ${className}`}>
      <button type="button" onClick={onClick} aria-label={playing ? t.stopReading : t.readAloud} title={playing ? t.stopReading : t.readAloud}
        className={`${label ? 'px-4 gap-2 rounded-full h-11' : `${dim} rounded-full justify-center`} inline-flex items-center shrink-0 font-bold transition-colors ${colors}`}>
        {loading ? <Loader2 size={icon} className="animate-spin" /> : playing ? <Square size={icon - 4} fill="currentColor" /> : <Volume2 size={icon} />}
        {label && <span className="text-sm">{playing ? t.stopReading : t.listen}</span>}
      </button>
      {hint && <span className="absolute top-full mt-1 right-0 z-30 w-56 bg-gray-900 text-white text-xs rounded-lg p-2 shadow-lg">{t.noVoice}</span>}
    </span>
  );
};

/** Microphone button: speech → text in the farmer's language. */
export const MicButton: React.FC<{ lang: Language; onText: (text: string, final: boolean) => void; size?: 'md' | 'lg'; className?: string }> = ({ lang, onText, size = 'md', className = '' }) => {
  const t = getTranslation(lang);
  const [on, setOn] = useState(false);
  const [err, setErr] = useState('');
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);
  if (!canListen()) return null;
  const toggle = () => {
    if (on) { stop.current(); setOn(false); return; }
    setErr('');
    setOn(true);
    stop.current = listen(lang, onText, (e) => {
      setOn(false);
      if (e && e !== 'no-speech' && e !== 'aborted') setErr(e === 'not-allowed' ? t.micBlocked : t.micFailed);
    });
  };
  const dim = size === 'lg' ? 'w-14 h-14' : 'w-11 h-11';
  return (
    <span className={`relative inline-flex ${className}`}>
      <button type="button" onClick={toggle} aria-label={on ? t.stop : t.speakNow} title={on ? t.stop : t.speakNow}
        className={`${dim} rounded-full flex items-center justify-center shrink-0 transition-all ${on ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-200' : 'bg-paper text-gray-600 border border-gray-200 hover:text-agri-700 hover:border-agri-300'}`}>
        {on ? <MicOff size={size === 'lg' ? 24 : 20} /> : <Mic size={size === 'lg' ? 24 : 20} />}
      </button>
      {on && <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-red-600 text-white text-xs font-semibold px-2 py-1 rounded-lg">{t.speakNow}</span>}
      {err && <span className="absolute top-full mt-1 left-0 z-30 w-52 bg-gray-900 text-white text-xs rounded-lg p-2 shadow-lg">{err}</span>}
    </span>
  );
};

/** Text input with a microphone on the right. */
export const VoiceField: React.FC<{ lang: Language; value: string; onChange: (v: string) => void; placeholder?: string; icon?: React.ReactNode; type?: string }> = ({ lang, value, onChange, placeholder, icon, type = 'text' }) => (
  <div className="flex items-center gap-2 bg-paper border border-gray-200 rounded-2xl pl-4 pr-1.5 py-1.5 focus-within:ring-2 focus-within:ring-agri-400">
    {icon && <span className="text-gray-400 shrink-0">{icon}</span>}
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="flex-1 min-w-0 bg-transparent outline-none text-lg text-gray-900 placeholder-gray-400 py-2" />
    <MicButton lang={lang} onText={(txt) => onChange(txt)} />
  </div>
);

export interface Choice<V extends string = string> { value: V; label: string; icon?: React.ReactNode; ph?: PhIcon; tone?: Tone; img?: string; swatch?: string; sub?: string }

/** Big picture buttons for single or multiple choice. */
export function ChoiceGrid<V extends string>({ options, value, onChange, multi = false, cols = 'grid-cols-2 sm:grid-cols-3', size = 'md' }: {
  options: Choice<V>[]; value: V | V[] | null; onChange: (v: any) => void; multi?: boolean; cols?: string; size?: 'sm' | 'md';
}) {
  const selected = (v: V) => (Array.isArray(value) ? value.includes(v) : value === v);
  const pick = (v: V) => {
    if (!multi) return onChange(v);
    const arr = Array.isArray(value) ? value : [];
    onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };
  return (
    <div className={`grid ${cols} gap-3`} role={multi ? 'group' : 'radiogroup'}>
      {options.map((o) => {
        const on = selected(o.value);
        return (
          <motion.button key={o.value} type="button" onClick={() => pick(o.value)} role={multi ? 'checkbox' : 'radio'} aria-checked={on}
            whileTap={{ scale: 0.96 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className={`relative flex flex-col items-center justify-center text-center rounded-2xl border-2 transition-colors ${size === 'sm' ? 'p-2.5 min-h-[96px]' : 'p-3 min-h-[118px]'} ${on ? 'border-agri-700 bg-agri-50 shadow-soft' : 'border-gray-200 bg-paper hover:border-agri-300'}`}>
            {on && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-agri-700 text-white flex items-center justify-center ring-2 ring-paper"><Check size={15} strokeWidth={3} /></motion.span>
            )}
            {o.img ? <img src={o.img} alt="" className={`${size === 'sm' ? 'w-12 h-12' : 'w-16 h-16'} rounded-xl object-cover mb-2 ring-1 ring-black/5`} />
              : o.swatch ? <span className={`${size === 'sm' ? 'w-11 h-11' : 'w-14 h-14'} rounded-full mb-2 ring-4 ring-paper shadow-[inset_0_-6px_10px_rgba(0,0,0,.18),0_0_0_1px_rgba(0,0,0,.08)]`} style={{ background: o.swatch }} />
              : o.ph ? <IconChip icon={o.ph} tone={o.tone || 'forest'} size={size === 'sm' ? 'md' : 'lg'} className="mb-2" />
              : <span className="mb-1.5 leading-none" aria-hidden>{o.icon}</span>}
            <span className={`font-semibold text-gray-900 leading-tight ${size === 'sm' ? 'text-sm' : 'text-base'}`}>{o.label}</span>
            {o.sub && <span className="text-xs text-gray-500 mt-0.5 leading-tight">{o.sub}</span>}
          </motion.button>
        );
      })}
    </div>
  );
}

/** Screen header: Back button, the screen's icon chip, title, short description, optional read-aloud. */
export const ScreenTitle: React.FC<{ lang: Language; icon: string; title: string; desc?: string; onBack?: () => void; speakText?: string; right?: React.ReactNode }> = ({ lang, icon, title, desc, onBack, speakText, right }) => {
  const t = getTranslation(lang);
  const sc = SCREEN[icon] || SCREEN.home;
  return (
    <div className="flex items-center gap-3 mb-6">
      {onBack && (
        <motion.button whileTap={{ scale: 0.94 }} onClick={onBack} aria-label={t.back}
          className="shrink-0 h-12 pl-3 pr-4 rounded-2xl bg-paper border border-gray-200 text-gray-700 font-semibold flex items-center gap-1.5 hover:border-agri-300 hover:text-agri-800 transition-colors">
          <ArrowLeft size={22} /> <span className="hidden sm:inline">{t.back}</span>
        </motion.button>
      )}
      <IconChip icon={sc.icon} tone={sc.tone} size="lg" />
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl md:text-[2rem] font-semibold text-ink leading-tight">{title}</h1>
        {desc && <p className="text-gray-600 text-base mt-0.5">{desc}</p>}
      </div>
      {right}
      {speakText && <SpeakButton text={`${title}. ${speakText}`} lang={lang} />}
    </div>
  );
};

/** Plain-language step label: big number circle + text. */
export const Step: React.FC<{ n: number; title: string; done?: boolean; active?: boolean }> = ({ n, title, done, active }) => (
  <div className={`flex items-center gap-2 ${active ? 'text-gray-900' : 'text-gray-400'}`}>
    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${done ? 'bg-agri-700 text-white' : active ? 'bg-gold-500 text-ink' : 'bg-gray-200 text-gray-500'}`}>{done ? <Check size={16} strokeWidth={3} /> : n}</span>
    <span className="font-semibold text-sm hidden sm:inline">{title}</span>
  </div>
);

export const Spinner: React.FC<{ text?: string }> = ({ text }) => (
  <div className="flex flex-col items-center justify-center py-10 text-gray-500 gap-3">
    <Loader2 size={40} className="animate-spin text-agri-700" />
    {text && <p className="font-medium text-center">{text}</p>}
  </div>
);
