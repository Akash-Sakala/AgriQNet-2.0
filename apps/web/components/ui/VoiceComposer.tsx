// Voice-first question box: a large mic is the main control. While listening the words appear in the
// box; when the farmer stops speaking the question is sent after a short pause (with Cancel).
// Typing and the Send button are the secondary path.
import React, { useEffect, useRef, useState } from 'react';
import { Microphone, Stop, PaperPlaneRight, X } from '@phosphor-icons/react';
import { Language } from '../../types';
import { getTranslation } from '../../utils/translations';
import { listen, canListen } from '../../utils/speech';
import { cn } from '../../lib/utils';

const AUTO_SEND_MS = 1400;

export const VoiceComposer: React.FC<{
  lang: Language; value: string; onChange: (v: string) => void; onSend: (text: string) => void; busy?: boolean; placeholder: string; className?: string;
}> = ({ lang, value, onChange, onSend, busy, placeholder, className }) => {
  const t = getTranslation(lang) as any;
  const [listening, setListening] = useState(false);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState('');
  const stopRef = useRef<() => void>(() => {});
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(value);
  latest.current = value;
  const voice = canListen();

  useEffect(() => () => { stopRef.current(); window.clearTimeout(timer.current); }, []);

  const cancelPending = () => { window.clearTimeout(timer.current); setPending(false); };
  const send = (text = latest.current) => {
    cancelPending();
    if (text.trim() && !busy) onSend(text.trim());
  };

  const toggleMic = () => {
    if (!voice) { setErr(t.micUnsupported); return; }
    if (listening) { stopRef.current(); setListening(false); return; }
    setErr(''); cancelPending(); setListening(true);
    stopRef.current = listen(lang, (text, final) => {
      onChange(text);
      if (final && text.trim()) {
        setPending(true);
        timer.current = window.setTimeout(() => send(text), AUTO_SEND_MS);
      }
    }, (e) => {
      setListening(false);
      if (e && e !== 'no-speech' && e !== 'aborted') setErr(e === 'not-allowed' ? t.micBlocked : t.micFailed);
    });
  };

  return (
    <div className={cn('bg-paper border border-gray-200 rounded-[24px] shadow-lift p-2.5', className)}>
      {(listening || pending || err) && (
        <div className="flex items-center gap-2 px-2 pb-2" aria-live="polite">
          {listening && <p className="flex-1 font-semibold text-clay-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-clay-600 animate-pulse" aria-hidden />{t.listening}</p>}
          {pending && !listening && (
            <>
              <p className="flex-1 font-semibold text-agri-800">{t.sendingSoon}</p>
              <button type="button" onClick={cancelPending} className="min-h-[44px] px-3 rounded-xl bg-gray-100 font-semibold flex items-center gap-1.5"><X size={18} aria-hidden />{t.cancel}</button>
              <button type="button" onClick={() => send()} className="min-h-[44px] px-3 rounded-xl bg-agri-700 text-white font-semibold">{t.sendNow}</button>
            </>
          )}
          {err && !listening && <p role="alert" className="flex-1 text-clay-700">{err}</p>}
        </div>
      )}
      <div className="flex items-end gap-2">
        <button type="button" onClick={toggleMic} aria-pressed={listening} aria-label={listening ? t.stop : t.tapToSpeak} title={listening ? t.stop : t.tapToSpeak}
          className={cn('relative shrink-0 w-14 h-14 rounded-full flex items-center justify-center transition-colors',
            listening ? 'bg-clay-600 text-white' : 'bg-agri-700 text-white hover:bg-agri-800')}>
          {listening && <span aria-hidden className="mic-ring absolute inset-0 rounded-full border-4 border-clay-600" />}
          {listening ? <Stop size={26} weight="fill" aria-hidden /> : <Microphone size={28} weight="fill" aria-hidden />}
        </button>
        <label className="sr-only" htmlFor="ask-input">{placeholder}</label>
        <textarea id="ask-input" rows={1} value={value} placeholder={placeholder}
          onChange={(e) => { cancelPending(); onChange(e.target.value); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          className="flex-1 min-w-0 resize-none max-h-32 bg-transparent outline-hidden text-lg text-ink py-3.5 px-1 leading-snug field-sizing-content" />
        <button type="button" onClick={() => send()} disabled={!value.trim() || busy} aria-label={t.sendNow}
          className="shrink-0 w-12 h-12 mb-1 rounded-full bg-paper border-2 border-agri-700 text-agri-800 flex items-center justify-center disabled:opacity-40">
          <PaperPlaneRight size={22} weight="fill" aria-hidden />
        </button>
      </div>
    </div>
  );
};
