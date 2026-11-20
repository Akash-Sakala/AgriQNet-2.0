// Fertilizer: what to put, how much and when.
//  • Quick advice: crop (the farmer's own first) + soil from the farm profile → AI plan, shown as an
//    ordered schedule with a rough bag count per acre.
//  • I have soil test numbers: N-P-K → the quantum-hybrid ML model.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Sparkle, Flask, Plant, Calendar, Scales, Warning, Atom, Question, CaretRight, PencilSimple, Package } from '@phosphor-icons/react';
import { GeminiService } from '../services/geminiService';
import { PlatformService } from '../services/platformService';
import { FertilizerPlan, Language, Farmer } from '../types';
import { getTranslation, fmt, fertName, plural, cropName } from '../utils/translations';
import { ScreenTitle, SpeakButton, ChoiceGrid, VoiceField } from './ui/Kit';
import { MlExtras, MlDetails } from './ui/MlExtras';
import { WorkingOn, InlineError } from './ui/WorkingOn';
import { Segmented, NumberStepper } from './ui/Segmented';
import { FarmQuestions } from './FarmQuestions';
import { cropChoices } from '../utils/farmOptions';
import { useLocalized } from '../utils/useLocalized';
import { normalizeFertilizerPlans } from '../services/aiNormalize';
import { useFarmProfile } from '../utils/farmProfile';
import { matchWord } from './CropAdvisor';
import { cn } from '../lib/utils';

const STORAGE_KEY = 'agriqnet_fertilizer_advisor';
type AdvisorMode = 'genai' | 'ml';

/** "50 kg per acre" → 1 bag of 50 kg (only when the dosage clearly says kg per acre). */
function bagsPerAcre(dosage: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*(?:-|–|to)?\s*(\d+(?:\.\d+)?)?\s*kg[^\d]{0,12}(acre|ಎಕರೆ|एकड़|ఎకరా)/i.exec(dosage || '');
  if (!m) return null;
  const kg = m[2] ? (Number(m[1]) + Number(m[2])) / 2 : Number(m[1]);
  const bags = Math.round((kg / 50) * 2) / 2;
  return bags >= 0.5 ? bags : null;
}

const FertilizerAdvisor: React.FC<{ lang: Language; user: Farmer; onBack: () => void }> = ({ lang, user, onBack }) => {
  const t = getTranslation(lang) as any;
  const farm = useFarmProfile(user);
  const saved = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; } })();
  const [mode, setMode] = useState<AdvisorMode>('genai');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(!farm.profile.soilType);
  const [crop, setCrop] = useState<string>(saved.crop || user.crops?.[0] || '');
  const [otherCrop, setOtherCrop] = useState('');
  const [npk, setNpk] = useState<{ nitrogen: number; phosphorus: number; potassium: number }>(saved.mlParams || { nitrogen: 40, phosphorus: 40, potassium: 40 });
  const [mlResult, setMlResult] = useState<{ prediction: string; details?: MlDetails } | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ crop, mlParams: npk })); } catch { /* ignore */ } }, [crop, npk]);

  const plansStore = useLocalized<FertilizerPlan[]>('agriqnet_fert_plans', lang, []);
  const plans = useMemo(() => normalizeFertilizerPlans(plansStore.value), [plansStore.value]);
  const allCrops = cropChoices(t);
  const myCrops = [...allCrops.filter((c) => user.crops?.includes(c.value)), ...allCrops.filter((c) => !user.crops?.includes(c.value))].slice(0, 8);
  const cropToSend = crop === '__other' ? otherCrop.trim() : crop;
  const soil = farm.profile.soilType || 'Red Soil';
  const reveal = () => window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);

  const handleRecommend = async () => {
    if (!cropToSend) return;
    setLoading(true); setErr(''); setEditing(false); reveal();
    try {
      const results = normalizeFertilizerPlans(await GeminiService.recommendFertilizer(cropToSend, soil, lang, { districtId: user.districtId, crops: user.crops }));
      if (!results.length) throw new Error('empty plan');
      plansStore.setValue(results);
      reveal();
    } catch (e) { console.error(e); setErr(t.errFertGenAi); } finally { setLoading(false); }
  };
  const handleMLPredict = async () => {
    setLoading(true); setMlResult(null); setErr(''); reveal();
    try {
      setMlResult(await PlatformService.recommendFertilizer({ Nitrogen: npk.nitrogen, Potassium: npk.potassium, Phosphorous: npk.phosphorus }) as any);
      reveal();
    } catch (e) { console.error(e); setErr(t.errFertModel); } finally { setLoading(false); }
  };

  const cropLabelShown = crop === '__other' ? otherCrop : cropName(t, crop);
  const planSpeech = plans.map((p, i) => `${i + 1}. ${p.name}. ${t.whenLabel}: ${p.applicationFrequency}. ${t.howMuch}: ${p.dosage}. ${p.warnings.join('. ')}`).join(' ');

  return (
    <div className="space-y-5">
      <ScreenTitle lang={lang} icon="fertilizer" title={t.tileFert} desc={t.tileFertSub} onBack={onBack} />
      <Segmented label={t.tileFert} value={mode} onChange={(m) => { setMode(m); setErr(''); }}
        options={[{ value: 'genai', label: t.modeQuick, icon: Sparkle }, { value: 'ml', label: t.modeSoilTest, icon: Flask }]} />

      <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6 items-start">
        <section className="bg-paper rounded-[20px] p-5 border border-gray-200 shadow-soft space-y-5">
          {mode === 'genai' ? (
            <>
              <div>
                <p className="flex items-center gap-2 text-xl font-semibold text-ink mb-3"><Plant size={24} weight="duotone" className="text-agri-700" aria-hidden />{t.qCrop}</p>
                <ChoiceGrid options={[...myCrops, { value: '__other', label: t.otherCrop, ph: PencilSimple, tone: 'stone' as const }]} value={crop} onChange={setCrop} cols="grid-cols-3" size="sm" />
                {crop === '__other' && <div className="mt-3"><VoiceField lang={lang} value={otherCrop} onChange={setOtherCrop} placeholder={t.phCrop} /></div>}
              </div>
              <FarmQuestions lang={lang} profile={farm.profile} onChange={farm.save} fields={['soilType']} editing={editing} onEditingChange={setEditing} />
              <button type="button" onClick={handleRecommend} disabled={loading || !cropToSend || editing}
                className="w-full min-h-[56px] rounded-2xl bg-agri-700 hover:bg-agri-800 text-white text-lg font-bold flex items-center justify-center gap-2 shadow-soft disabled:opacity-50">
                <Flask size={24} weight="duotone" aria-hidden />{t.genPlan}
              </button>
            </>
          ) : (
            <>
              <details className="group bg-gold-100/60 border border-gold-300 rounded-2xl p-3">
                <summary className="min-h-[44px] flex items-center gap-2 font-semibold text-ink cursor-pointer list-none">
                  <Question size={22} weight="duotone" className="text-gold-700" aria-hidden />{t.soilCardQ}
                  <CaretRight size={18} className="ml-auto transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <p className="text-gray-800 mt-1 pl-8">{t.soilCardA}</p>
              </details>
              {(['nitrogen', 'phosphorus', 'potassium'] as const).map((k, i) => (
                <NumberStepper key={k} id={`fert-${k}`} label={t[k]} unit="kg/ha" value={npk[k]} min={0} max={200} step={1}
                  onChange={(v) => setNpk((p) => ({ ...p, [k]: v }))} hint={fmt(t.typicalRange, { a: [20, 10, 10][i], b: [120, 80, 80][i], unit: 'kg/ha' })} decLabel={t.decrease} incLabel={t.increase} />
              ))}
              <button type="button" onClick={handleMLPredict} disabled={loading}
                className="w-full min-h-[56px] rounded-2xl bg-agri-700 hover:bg-agri-800 text-white text-lg font-bold flex items-center justify-center gap-2 shadow-soft disabled:opacity-50">
                <Atom size={24} weight="duotone" aria-hidden />{t.predictFert}
              </button>
            </>
          )}
        </section>

        <section ref={resultsRef} className="scroll-mt-24 min-w-0" aria-live="polite">
          {loading && (
            <WorkingOn lang={lang} expectedMs={mode === 'ml' ? 5000 : 15000} onRetry={mode === 'ml' ? handleMLPredict : handleRecommend}
              stages={mode === 'ml' ? [{ icon: Flask, text: t.stageMl1 }, { icon: Atom, text: t.stageMl2 }] : [{ icon: Plant, text: t.stageFert1 }, { icon: Scales, text: t.stageFert2 }, { icon: Sparkle, text: t.stageAlmost }]} />
          )}
          {err && !loading && <InlineError message={err} onRetry={mode === 'ml' ? handleMLPredict : handleRecommend} retryLabel={t.retry} className="mb-4" />}

          {mode === 'genai' && !loading && plans.length === 0 && !err && (
            <div className="rounded-[20px] border-2 border-dashed border-agri-200 bg-paper/60 p-8 text-center">
              <Flask size={44} weight="duotone" className="mx-auto text-agri-500 mb-3" aria-hidden />
              <p className="text-lg text-gray-700">{fmt(t.fertReady, { action: t.genPlan })}</p>
            </div>
          )}

          {mode === 'genai' && !loading && plans.length > 0 && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-xl md:text-2xl font-semibold text-ink">{cropLabelShown ? fmt(t.fertPlanFor, { crop: cropLabelShown }) : t.fertPlanTitle}</h2>
                  <p className="text-gray-600">{t.fertPlanHint}</p>
                </div>
                <SpeakButton text={`${t.fertPlanTitle}. ${planSpeech}`} lang={lang} label />
              </div>
              {plansStore.translating && <p className="text-[15px] text-gray-600 mb-2">{t.translating}</p>}
              <ol className="relative space-y-4 before:absolute before:left-[19px] before:top-6 before:bottom-6 before:w-0.5 before:bg-agri-200">
                {plans.map((p, i) => {
                  const bags = bagsPerAcre(p.dosage);
                  return (
                    <motion.li key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 5) * 0.06, duration: 0.32 }} className="relative flex gap-3">
                      <span className="relative z-10 w-10 h-10 shrink-0 rounded-full bg-agri-700 text-white font-bold flex items-center justify-center tabular-nums ring-4 ring-cream" aria-hidden>{i + 1}</span>
                      <div className="flex-1 min-w-0 bg-paper border border-gray-200 rounded-[20px] p-4 shadow-soft">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-display text-xl font-semibold text-ink">{p.name}</h3>
                          <SpeakButton size="sm" text={`${p.name}. ${p.description}. ${t.whenLabel}: ${p.applicationFrequency}. ${t.howMuch}: ${p.dosage}. ${p.warnings.join('. ')}`} lang={lang} />
                        </div>
                        {p.description && <p className="text-gray-700 mt-1">{p.description}</p>}
                        <dl className="mt-3 grid sm:grid-cols-2 gap-2">
                          <div className="bg-cream rounded-2xl p-3"><dt className="flex items-center gap-1.5 text-gray-600"><Calendar size={18} weight="duotone" aria-hidden />{t.whenLabel}</dt><dd className="text-ink font-semibold mt-0.5">{p.applicationFrequency || '—'}</dd></div>
                          <div className="bg-cream rounded-2xl p-3"><dt className="flex items-center gap-1.5 text-gray-600"><Scales size={18} weight="duotone" aria-hidden />{t.howMuch}</dt><dd className="text-ink font-semibold mt-0.5">{p.dosage || '—'}</dd>
                            {bags && <dd className="mt-1 flex items-center gap-1.5 text-agri-800"><Package size={18} weight="duotone" aria-hidden />{plural(t, lang, 'bags', bags)}</dd>}
                          </div>
                        </dl>
                        {p.warnings.length > 0 && (
                          <div className="mt-3 bg-clay-50 border border-clay-600/25 rounded-2xl p-3">
                            <p className="flex items-center gap-1.5 font-semibold text-clay-700"><Warning size={20} weight="duotone" aria-hidden />{t.safetyLabel}</p>
                            <ul className="mt-1 space-y-1 text-gray-800 list-disc pl-6">{p.warnings.map((w, j) => <li key={j}>{w}</li>)}</ul>
                          </div>
                        )}
                      </div>
                    </motion.li>
                  );
                })}
              </ol>
            </>
          )}

          {mode === 'ml' && !loading && !mlResult && !err && (
            <div className="rounded-[20px] border-2 border-dashed border-agri-200 bg-paper/60 p-8 text-center">
              <Atom size={44} weight="duotone" className="mx-auto text-agri-500 mb-3" aria-hidden />
              <p className="text-lg text-gray-700">{t.fertilizerPrecisionDesc}</p>
            </div>
          )}
          {mode === 'ml' && mlResult && !loading && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-paper rounded-[20px] p-5 border border-gray-200 shadow-lift">
              <p className="text-gray-600">{t.fertMlTitle}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="w-14 h-14 rounded-2xl bg-gold-100 text-gold-700 flex items-center justify-center" aria-hidden><Flask size={30} weight="duotone" /></span>
                <h2 className="font-display text-3xl font-semibold text-ink">{fertName(t, mlResult.prediction)}</h2>
                <SpeakButton text={fmt(t.mlFertResult, { fert: fertName(t, mlResult.prediction) })} lang={lang} />
              </div>
              {mlResult.details?.confidence != null && (
                <span className={cn('mt-3 inline-block rounded-full px-3 py-1 font-semibold', mlResult.details.confidence >= 0.8 ? 'bg-agri-700 text-white' : 'bg-gold-100 text-ink border border-gold-500')}>{matchWord(t, mlResult.details.confidence * 100)}</span>
              )}
              <p className="text-gray-700 mt-3">{fmt(t.mlFertResult, { fert: fertName(t, mlResult.prediction) })}</p>
              <div className="mt-3"><MlExtras details={mlResult.details} prediction={mlResult.prediction} t={t} nameOf={(x) => fertName(t, x)} /></div>
            </motion.div>
          )}
        </section>
      </div>
    </div>
  );
};

export default FertilizerAdvisor;
