// Honest waiting for AI / network work: plain-language stages that advance on a timer,
// a progress bar that eases toward 90% (it never fakes 100%), and after `slowAfter` a
// "taking longer than usual" notice with Keep waiting / Try again.
// Also: <InlineError> — the one error card every screen uses (role="alert" + Retry).
import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Icon as PhIcon } from '@phosphor-icons/react';
import { ArrowClockwise, Hourglass, WarningCircle } from '@phosphor-icons/react';
import { Language } from '../../types';
import { getTranslation } from '../../utils/translations';
import { Progress } from './progress';
import { cn } from '../../lib/utils';

export interface WorkStage { icon: PhIcon; text: string }

/** Elapsed ms since `active` turned true (0 when inactive). */
function useElapsed(active: boolean, tick = 250) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!active) { setMs(0); return; }
    const start = Date.now();
    setMs(0);
    const id = window.setInterval(() => setMs(Date.now() - start), tick);
    return () => window.clearInterval(id);
  }, [active, tick]);
  return ms;
}

export const WorkingOn: React.FC<{
  lang: Language;
  stages: WorkStage[];
  /** roughly how long the whole job usually takes (sets the stage pace and the bar curve) */
  expectedMs?: number;
  slowAfter?: number;
  onRetry?: () => void;
  className?: string;
  /** skeleton shaped like the result, shown under the progress card */
  skeleton?: React.ReactNode;
}> = ({ lang, stages, expectedMs = 15000, slowAfter = 25000, onRetry, className, skeleton }) => {
  const t = getTranslation(lang);
  const ms = useElapsed(true);
  const [keepWaiting, setKeepWaiting] = useState(false);
  const per = expectedMs / Math.max(1, stages.length);
  const idx = Math.min(stages.length - 1, Math.floor(ms / per));
  const pct = 90 * (1 - Math.exp(-ms / (expectedMs * 0.55)));
  const slow = ms > slowAfter && !keepWaiting;
  const S = stages[idx];

  return (
    <div className={cn('space-y-4', className)}>
      <div className="bg-paper border border-agri-200 rounded-[20px] p-5 shadow-soft">
        <div className="flex items-center gap-3 min-h-[48px]" aria-live="polite" aria-atomic="true">
          <span className="w-12 h-12 shrink-0 rounded-2xl bg-agri-50 text-agri-700 flex items-center justify-center">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={idx} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.2 }}>
                <S.icon size={26} weight="duotone" aria-hidden />
              </motion.span>
            </AnimatePresence>
          </span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p key={idx} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}
              className="text-lg font-semibold text-ink leading-snug">{S.text}</motion.p>
          </AnimatePresence>
        </div>
        <Progress value={pct} className="mt-4" label={S.text} />
        <ol className="mt-3 flex gap-1.5" aria-hidden>
          {stages.map((_, i) => <li key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= idx ? 'bg-agri-600' : 'bg-gray-200')} />)}
        </ol>
        {slow && (
          <div role="status" className="mt-4 p-3 rounded-2xl bg-gold-100 border border-gold-300 flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="flex-1 flex items-center gap-2 font-semibold text-ink"><Hourglass size={22} weight="duotone" aria-hidden />{t.workSlow}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setKeepWaiting(true)} className="min-h-[48px] px-4 rounded-2xl bg-paper border-2 border-agri-700 text-agri-800 font-bold">{t.keepWaiting}</button>
              {onRetry && <button type="button" onClick={onRetry} className="min-h-[48px] px-4 rounded-2xl bg-agri-700 text-white font-bold">{t.retry}</button>}
            </div>
          </div>
        )}
      </div>
      {skeleton}
    </div>
  );
};

export const InlineError: React.FC<{ message: string; onRetry?: () => void; retryLabel: string; className?: string }> = ({ message, onRetry, retryLabel, className }) => (
  <div role="alert" className={cn('flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-[20px] bg-clay-50 border border-clay-600/30', className)}>
    <p className="flex-1 flex items-start gap-2 font-semibold text-clay-700">
      <WarningCircle size={24} weight="duotone" className="shrink-0" aria-hidden />{message}
    </p>
    {onRetry && (
      <button type="button" onClick={onRetry} className="shrink-0 min-h-[48px] px-5 rounded-2xl bg-agri-700 hover:bg-agri-800 text-white font-bold flex items-center justify-center gap-2">
        <ArrowClockwise size={20} weight="bold" aria-hidden />{retryLabel}
      </button>
    )}
  </div>
);

/** Skeleton shaped like a list of result cards (picture + two lines). */
export const CardSkeletons: React.FC<{ count?: number; cols?: string }> = ({ count = 2, cols = 'grid-cols-1 lg:grid-cols-2' }) => (
  <div className={cn('grid gap-4', cols)} aria-hidden>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="bg-paper border border-gray-200 rounded-[20px] overflow-hidden">
        <div className="shimmer h-36 rounded-none" />
        <div className="p-4 space-y-2.5"><div className="shimmer h-5 w-2/3 rounded-lg" /><div className="shimmer h-4 w-full rounded-lg" /><div className="shimmer h-4 w-5/6 rounded-lg" /></div>
      </div>
    ))}
  </div>
);
