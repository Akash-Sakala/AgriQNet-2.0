// The farm questions shared by the crop and fertilizer advisors.
// When the profile is filled in it shows a one-line summary ("Your farm") with Change.
// Editing on phones: one question per step with a labelled step count; a tap on a single-choice
// answer moves on by itself after a short pause (so the tick is seen). Desktop: all questions at once.
import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Check, MapPin, Mountains, Drop, Ruler, PencilSimple } from '@phosphor-icons/react';
import { Language } from '../types';
import { getTranslation, districtName, fmt } from '../utils/translations';
import { soilChoices, waterChoices, sizeChoices } from '../utils/farmOptions';
import { ChoiceGrid } from './ui/Kit';
import DistrictPicker from './DistrictPicker';
import { FarmProfile } from '../utils/farmProfile';
import { useMediaQuery } from '../lib/utils';

export type FarmField = keyof FarmProfile;

export const FarmQuestions: React.FC<{
  lang: Language; profile: FarmProfile; fields: FarmField[]; onChange: (c: Partial<FarmProfile>) => void;
  editing: boolean; onEditingChange: (e: boolean) => void;
}> = ({ lang, profile, fields, onChange, editing, onEditingChange }) => {
  const t = getTranslation(lang) as any;
  const wide = useMediaQuery('(min-width: 1024px)');
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);

  const meta: Record<FarmField, { q: string; icon: typeof MapPin; label: (v: string) => string }> = {
    districtId: { q: t.districtQ, icon: MapPin, label: (v) => districtName(t, v) },
    soilType: { q: t.qSoil, icon: Mountains, label: (v) => soilChoices(t).find((c) => c.value === v)?.label || v },
    waterSource: { q: t.qWater, icon: Drop, label: (v) => waterChoices(t).find((c) => c.value === v)?.label || v },
    fieldSize: { q: t.qSize, icon: Ruler, label: (v) => sizeChoices(t).find((c) => c.value === v)?.label || v },
  };

  const field = (f: FarmField, auto: boolean) => {
    const pick = (v: string) => {
      onChange({ [f]: v });
      if (auto && !wide) window.setTimeout(() => next(), 320);
    };
    if (f === 'districtId') return <DistrictPicker lang={lang} value={profile.districtId} onChange={pick} />;
    const opts = f === 'soilType' ? soilChoices(t) : f === 'waterSource' ? waterChoices(t) : sizeChoices(t);
    return <ChoiceGrid options={opts} value={profile[f] || null} onChange={pick} cols={f === 'fieldSize' ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'} size="sm" />;
  };

  // read the current step from a ref so the parent update happens outside a state updater
  const stepRef = React.useRef(step);
  stepRef.current = step;
  const next = () => {
    setDir(1);
    if (stepRef.current >= fields.length - 1) { setStep(0); onEditingChange(false); }
    else setStep(stepRef.current + 1);
  };
  const back = () => { setDir(-1); setStep((s) => Math.max(0, s - 1)); };

  // Summary row
  if (!editing) {
    return (
      <div className="bg-cream border border-gray-200 rounded-[20px] p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="font-semibold text-ink">{t.yourFarm}</p>
          <button type="button" onClick={() => { setStep(0); onEditingChange(true); }} className="min-h-[44px] px-3 rounded-xl text-agri-800 font-semibold flex items-center gap-1.5 hover:bg-agri-50">
            <PencilSimple size={18} aria-hidden />{t.change}
          </button>
        </div>
        <ul className="flex flex-wrap gap-2">
          {fields.map((f) => {
            const M = meta[f];
            return (
              <li key={f} className="inline-flex items-center gap-1.5 rounded-full bg-paper border border-gray-200 px-3 py-1.5 text-ink">
                <M.icon size={18} weight="duotone" className="text-agri-700" aria-hidden />{profile[f] ? M.label(profile[f]) : '—'}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // Desktop: everything at once
  if (wide) {
    return (
      <div className="space-y-5">
        {fields.map((f) => {
          const M = meta[f];
          return (
            <div key={f}>
              <p className="flex items-center gap-2 font-semibold text-ink mb-2"><M.icon size={22} weight="duotone" className="text-agri-700" aria-hidden />{M.q}</p>
              {field(f, false)}
            </div>
          );
        })}
        <button type="button" onClick={() => onEditingChange(false)} className="min-h-[48px] px-4 rounded-2xl border-2 border-agri-700 text-agri-800 font-bold flex items-center gap-2">
          <Check size={20} weight="bold" aria-hidden />{t.save}
        </button>
      </div>
    );
  }

  // Phone: one question per step
  const f = fields[step];
  const M = meta[f];
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        {step > 0 && <button type="button" onClick={back} aria-label={t.back} className="w-12 h-12 shrink-0 rounded-2xl bg-paper border border-gray-300 flex items-center justify-center"><ArrowLeft size={22} aria-hidden /></button>}
        <p className="text-gray-600 font-semibold">{fmt(t.stepOf, { n: step + 1, total: fields.length })}</p>
        <span className="flex gap-1.5 ml-auto" aria-hidden>{fields.map((_, i) => <span key={i} className={`h-2 rounded-full ${i <= step ? 'w-6 bg-agri-700' : 'w-2 bg-gray-300'}`} />)}</span>
      </div>
      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.div key={f} custom={dir}
          variants={{ enter: (d: number) => ({ opacity: 0, x: d * 28 }), center: { opacity: 1, x: 0 }, exit: (d: number) => ({ opacity: 0, x: d * -20 }) }}
          initial="enter" animate="center" exit="exit" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
          <p className="flex items-center gap-2 text-xl font-semibold text-ink mb-3"><M.icon size={24} weight="duotone" className="text-agri-700" aria-hidden />{M.q}</p>
          {field(f, f !== 'districtId')}
          {f === 'districtId' && (
            <button type="button" onClick={next} disabled={!profile.districtId} className="mt-4 w-full min-h-[52px] rounded-2xl bg-agri-700 text-white font-bold disabled:opacity-50">{t.next}</button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
