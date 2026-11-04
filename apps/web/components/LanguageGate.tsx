import React from 'react';
import { motion } from 'motion/react';
import { Plant, SpeakerHigh } from './ui/Icons';
import { Language } from '../types';
import { TRANSLATIONS } from '../utils/translations';
import { SpeakButton } from './ui/Kit';

const NATIVE: Record<Language, { name: string; letter: string }> = {
  kn: { name: 'ಕನ್ನಡ', letter: 'ಕ' },
  hi: { name: 'हिंदी', letter: 'हि' },
  te: { name: 'తెలుగు', letter: 'తె' },
  en: { name: 'English', letter: 'A' },
};

/** First screen: pick your language before anything else (each button is written and spoken in its own language). */
const LanguageGate: React.FC<{ onPick: (l: Language) => void }> = ({ onPick }) => {
  const order: Language[] = ['kn', 'hi', 'te', 'en'];
  return (
    <div className="relative min-h-screen bg-agri-700 overflow-hidden flex flex-col items-center justify-center p-5">
      <div className="furrows absolute inset-0" aria-hidden />
      <div className="absolute -top-32 -right-24 w-[28rem] h-[28rem] rounded-full bg-gold-500/15 blur-3xl" aria-hidden />
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex items-center gap-3 text-white mb-2">
        <span className="w-14 h-14 rounded-[18px] bg-paper/10 ring-1 ring-white/20 flex items-center justify-center"><Plant size={34} weight="duotone" color="#E2C766" /></span>
        <span className="font-display text-4xl font-semibold tracking-tight">AgriQNet</span>
      </motion.div>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.6 }} className="relative text-agri-100 text-lg mb-8 text-center">
        ಭಾಷೆ ಆಯ್ಕೆಮಾಡಿ · भाषा चुनें · భాష ఎంచుకోండి · Choose language
      </motion.p>
      <div className="relative w-full max-w-md space-y-3">
        {order.map((code, i) => {
          const tt = TRANSLATIONS[code] as any;
          return (
            <motion.div key={code} className="flex items-center gap-2"
              initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
              <motion.button whileTap={{ scale: 0.97 }} whileHover={{ y: -2 }} onClick={() => onPick(code)}
                className="flex-1 flex items-center gap-4 bg-paper rounded-3xl p-4 shadow-lift text-left">
                <span className="w-16 h-16 rounded-2xl bg-agri-50 ring-1 ring-agri-200 text-agri-800 flex items-center justify-center font-display text-3xl font-semibold shrink-0">{NATIVE[code].letter}</span>
                <span className="min-w-0">
                  <span className="block font-display text-2xl font-semibold text-ink">{NATIVE[code].name}</span>
                  <span className="block text-base text-gray-600">{tt.langContinue}</span>
                </span>
              </motion.button>
              <SpeakButton text={`${NATIVE[code].name}. ${tt.langContinue}`} lang={code} size="lg" tone="dark" />
            </motion.div>
          );
        })}
      </div>
      <p className="relative text-agri-100 text-sm mt-8 text-center flex items-center gap-2"><SpeakerHigh size={18} weight="duotone" /> {TRANSLATIONS.kn.langHint} · {TRANSLATIONS.en.langHint}</p>
    </div>
  );
};

export default LanguageGate;
