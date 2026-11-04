import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { Language } from '../types';
import { getTranslation, fmt } from '../utils/translations';
import { SpeakButton } from './ui/Kit';

export interface TourStep {
  /** Element id to highlight. "a|b" = the first of these that is visible (e.g. sidebar on desktop, bottom bar on phone). */
  targetId: string;
  titleKey: string;
  descKey: string;
}

interface TourGuideProps {
  steps: TourStep[];
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  onStepChange?: (index: number) => void;
}

const PAD = 6;      // space between the element and the highlight ring
const GAP = 14;     // space between the highlight and the card
const EDGE = 12;    // keep the card this far from the screen edges

type Box = { top: number; left: number; width: number; height: number };

/** The first visible element among "a|b|c". */
const findTarget = (ids: string): HTMLElement | null => {
  for (const id of ids.split('|')) {
    const el = document.getElementById(id);
    if (el) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) return el; }
  }
  return null;
};

/**
 * Guided tour. The highlight follows its element every frame (smooth scrolling, sticky headers,
 * images loading, rotating the phone), and the card is placed below, above or beside it —
 * whichever fits — and never leaves the screen.
 */
const TourGuide: React.FC<TourGuideProps> = ({ steps, isOpen, onClose, lang, onStepChange }) => {
  const t = getTranslation(lang);
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [card, setCard] = useState<{ top: number; left: number; place: 'below' | 'above' | 'over' | 'center' } | null>(null);
  const [missing, setMissing] = useState(false); // nothing to highlight: show the card in the middle
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (isOpen) setI(0); }, [isOpen]);
  useEffect(() => { if (isOpen) onStepChange?.(i); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [i, isOpen]);

  // Bring the element into view, then track its position every animation frame.
  useEffect(() => {
    if (!isOpen) return;
    let raf = 0;
    let scrolled = false;
    let misses = 0;
    setMissing(false);
    const tick = () => {
      const el = findTarget(steps[i].targetId);
      if (!el) {
        // not on screen (yet): after ~half a second, explain it without a highlight
        if (++misses === 30) { setBox(null); setMissing(true); }
      } else {
        if (misses >= 30) setMissing(false);
        misses = 0;
        if (!scrolled) {
          scrolled = true;
          // Scroll so the element AND the card both fit: if there is no room for the card below
          // or above, bring the element up to just under the sticky header.
          const r = el.getBoundingClientRect();
          const header = 76, bottomBar = window.innerWidth < 1024 ? 76 : 0, vh = window.innerHeight;
          const cardH = cardRef.current?.offsetHeight || 260;
          const roomBelow = vh - bottomBar - (r.bottom + PAD + GAP) - EDGE;
          const roomAbove = r.top - PAD - GAP - header;
          const visible = r.top >= header && r.bottom <= vh - bottomBar;
          if (!visible || (roomBelow < cardH && roomAbove < cardH)) {
            window.scrollBy({ top: r.top - header - PAD - 6, behavior: 'smooth' });
          }
        }
        const r = el.getBoundingClientRect();
        setBox((b) => (b && b.top === r.top && b.left === r.left && b.width === r.width && b.height === r.height ? b : { top: r.top, left: r.left, width: r.width, height: r.height }));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [i, isOpen, steps]);

  // Place the card where it fits.
  useLayoutEffect(() => {
    if (!cardRef.current) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!box) {
      if (!missing) return;
      const top = Math.max(EDGE, (vh - cardRef.current.offsetHeight) / 2), left = Math.max(EDGE, (vw - cardRef.current.offsetWidth) / 2);
      setCard({ top, left, place: 'center' });
      return;
    }
    const cw = cardRef.current.offsetWidth, ch = cardRef.current.offsetHeight;
    const bottomBar = vw < 1024 ? 76 : 0;
    const below = box.top + box.height + PAD + GAP;
    const above = box.top - PAD - GAP - ch;
    let place: 'below' | 'above' | 'over' = 'below';
    let top = below;
    if (below + ch > vh - bottomBar - EDGE) {
      if (above >= EDGE) { place = 'above'; top = above; }
      else { place = 'over'; top = Math.max(EDGE, vh - bottomBar - EDGE - ch); } // tall element: card sits over its lower part
    }
    const centred = box.left + box.width / 2 - cw / 2;
    const left = Math.max(EDGE, Math.min(vw - cw - EDGE, centred));
    setCard((c) => (c && c.top === top && c.left === left && c.place === place ? c : { top, left, place }));
  }, [box, i, missing]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!isOpen) return null;
  const step = steps[i];
  const title = (t as any)[step.titleKey];
  const desc = (t as any)[step.descKey];
  const last = i === steps.length - 1;
  function next() { if (last) onClose(); else setI((x) => x + 1); }

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={title}>
      {/* click-catcher; the dimming comes from the ring's large shadow, so the element stays bright */}
      <div className="absolute inset-0" onClick={onClose} />
      {missing && <div className="absolute inset-0 bg-[rgba(17,28,22,.62)] pointer-events-none" />}
      {box && !missing && (
        <motion.div
          className="absolute rounded-[22px] pointer-events-none ring-[3px] ring-gold-500"
          style={{ boxShadow: '0 0 0 9999px rgba(17,28,22,.62)' }}
          initial={false}
          animate={{ top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 }}
          transition={{ type: 'spring', stiffness: 420, damping: 40, mass: 0.8 }}
          data-tour-ring
        />
      )}
        <motion.div
          key={i}
          ref={cardRef}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}
          className="absolute w-[min(22rem,calc(100vw-24px))] bg-paper rounded-2xl shadow-lift border border-gray-200 p-5 [@media(max-height:700px)]:p-3.5"
          style={{ top: card?.top ?? -9999, left: card?.left ?? 0, visibility: card ? 'visible' : 'hidden' }}
          data-tour-card
        >
          <div className="flex items-center gap-2 mb-2 [@media(max-height:700px)]:mb-1 pr-8">
            <span className="text-agri-800 bg-agri-50 border border-agri-200 text-xs font-semibold px-2 py-1 rounded-md">{fmt(t.tourStepOf, { n: i + 1, total: steps.length })}</span>
            <SpeakButton text={`${title}. ${desc}`} lang={lang} size="sm" className="ml-auto" />
          </div>
          <button onClick={onClose} aria-label={t.close} className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"><X size={18} /></button>
          <h3 className="text-xl [@media(max-height:700px)]:text-lg font-semibold text-ink mb-1.5">{title}</h3>
          <p className="text-[0.95rem] [@media(max-height:700px)]:text-sm text-gray-700 mb-5 [@media(max-height:700px)]:mb-3 leading-relaxed">{desc}</p>
          <div className="flex justify-between items-center">
            <button onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0}
              className="text-gray-600 hover:text-agri-800 font-medium flex items-center gap-1 disabled:opacity-30 px-2 py-2">
              <ChevronLeft size={18} /> {t.tourBack}
            </button>
            <button onClick={next} className="bg-agri-700 hover:bg-agri-800 text-white px-5 py-2.5 rounded-xl font-semibold flex items-center gap-1 active:scale-95 transition-transform">
              {last ? t.tourFinish : t.tourNext}{!last && <ChevronRight size={18} />}
            </button>
          </div>
        </motion.div>
    </div>,
    document.body,
  );
};

export default TourGuide;
