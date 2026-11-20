// Which crop? Two ways in, named in farmer words:
//  • Quick advice: farm profile (district, soil, water, field size) → AI picks crops for this season.
//  • I have soil test numbers: N-P-K, pH, rain, temperature, humidity → the quantum-hybrid ML model.
// The farm profile is filled in once and reused (also by Fertilizer). Waits are staged; results
// are a ranked list with a photo, a plain match word and a reason; details open in a sheet.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Sparkle, Flask, Plant, MagnifyingGlass, ChartBar, Drop, Clock, Sun, MapPin, Coins, Question, CaretRight, Atom } from '@phosphor-icons/react';
import { GeminiService } from '../services/geminiService';
import { PlatformService } from '../services/platformService';
import { SoilData, CropRecommendation, Language, Farmer } from '../types';
import { getTranslation, fmt, cropName, LANGUAGES, districtName } from '../utils/translations';
import { ScreenTitle, SpeakButton } from './ui/Kit';
import { MlExtras, MlDetails } from './ui/MlExtras';
import { WorkingOn, InlineError, CardSkeletons } from './ui/WorkingOn';
import { Segmented, NumberStepper } from './ui/Segmented';
import { Sheet, SheetContent } from './ui/sheet';
import { FarmQuestions } from './FarmQuestions';
import { useLocalized } from '../utils/useLocalized';
import { normalizeCrops } from '../services/aiNormalize';
import { useFarmProfile } from '../utils/farmProfile';
import { cropImage } from '../utils/cropImages';
import { cn } from '../lib/utils';

interface CropAdvisorProps { lang: Language; user: Farmer; onBack: () => void }
type AdvisorMode = 'genai' | 'ml';
const STORAGE_KEY = 'agriqnet_crop_advisor';
const DEFAULT_SOIL: SoilData = { nitrogen: 40, phosphorus: 50, potassium: 40, ph: 6.5, rainfall: 1200 };

/** Confidence as a word, not a percentage. */
export const matchWord = (t: any, pct: number) => (pct >= 80 ? t.matchHigh : pct >= 60 ? t.matchMed : t.matchLow);
const matchCls = (pct: number) => (pct >= 80 ? 'bg-agri-700 text-white' : pct >= 60 ? 'bg-gold-100 text-ink border border-gold-500' : 'bg-gray-100 text-gray-800 border border-gray-300');

const CropAdvisor: React.FC<CropAdvisorProps> = ({ lang, user, onBack }) => {
  const t = getTranslation(lang) as any;
  const farm = useFarmProfile(user);
  const [editing, setEditing] = useState(!farm.complete);
  const [mode, setMode] = useState<AdvisorMode>('genai');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CropRecommendation | null>(null);
  const [recErr, setRecErr] = useState('');
  const [mlErr, setMlErr] = useState('');
  const resultsRef = useRef<HTMLDivElement>(null);

  // Soil test numbers (remembered on this device)
  const [soil, setSoil] = useState<SoilData>(() => { try { return { ...DEFAULT_SOIL, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').soilData || {}) }; } catch { return DEFAULT_SOIL; } });
  const [extra, setExtra] = useState({ temperature: 25, humidity: 70 });
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ soilData: soil })); } catch { /* ignore */ } }, [soil]);
  const [mlResult, setMlResult] = useState<{ prediction: string; details?: MlDetails } | null>(null);

  // AI results follow the language switch (translated, not re-generated); normalized on read
  const recs = useLocalized<CropRecommendation[]>('agriqnet_crop_recs', lang, []);
  const recommendations = useMemo(() => normalizeCrops(recs.value), [recs.value]);
  const district = districtName(t, farm.profile.districtId);

  const reveal = () => window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);

  const handleRecommend = async () => {
    setLoading(true); setRecErr(''); setEditing(false);
    reveal(); // show the progress card (it starts below the fold on phones)
    try {
      const p = farm.profile;
      const location = p.districtId ? `${districtName(getTranslation('en'), p.districtId)} district, Karnataka` : '';
      const dateString = new Date().toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' });
      const prompt = `
      CONTEXT:
      - Location: ${location}
      - Current Date: ${dateString}
      - Soil: ${p.soilType}
      - Water: ${p.waterSource}
      - Farm Size: ${p.fieldSize}
      - Preferred Language: ${LANGUAGES[lang]}

      INSTRUCTIONS:
      1. Analyze the agro-climatic zone of ${location}. Identify typical historical crops and current market demand in this specific region.
      2. Factor in the current season (e.g., Kharif, Rabi, or Zaid in India) based on the date: ${dateString}.
      3. Filter these crops based on the user's ${p.soilType} and ${p.waterSource}.
      4. Provide 4 high-probability recommendations, best first. Use very simple words a farmer understands; short sentences.

      OUTPUT FORMAT:
      Return ONLY a JSON array. Write all values (except JSON keys and "englishName") in ${LANGUAGES[lang]}.
      Structure:
      [{
        "name": "string (in the farmer's language)",
        "englishName": "common English crop name, e.g. rice, maize, ragi",
        "scientificName": "string",
        "confidence": number,
        "description": "One or two short sentences: why this works for ${location} in this season",
        "growthPeriod": "string",
        "yieldPotential": "string",
        "economicAnalysis": "Market demand and price trends for this region",
        "requirements": { "water": "string", "sun": "string", "soil": "string" }
      }]`;
      const crops = normalizeCrops(await GeminiService.recommendCrops(prompt, lang, { districtId: p.districtId, crops: user.crops }));
      if (!crops.length) throw new Error('AI returned no usable crops');
      recs.setValue(crops);
      reveal();
    } catch (err) {
      console.error(err);
      setRecErr(t.errRecommend);
    } finally { setLoading(false); }
  };

  const handleMLPredict = async () => {
    setLoading(true); setMlResult(null); setMlErr('');
    reveal();
    try {
      setMlResult(await PlatformService.recommendCrop({ N: soil.nitrogen, P: soil.phosphorus, K: soil.potassium, temperature: extra.temperature, humidity: extra.humidity, ph: soil.ph, rainfall: soil.rainfall }) as any);
      reveal();
    } catch (err) { console.error(err); setMlErr(t.errCropModel); } finally { setLoading(false); }
  };

  const imgFor = (c: CropRecommendation) => cropImage((c as any).englishName || c.name);
  const listenAll = recommendations.map((c, i) => `${i + 1}. ${c.name}. ${matchWord(t, c.confidence)}. ${c.description}`).join(' ');
  const stepper = (k: keyof SoilData, label: string, unit: string, a: number, b: number, step = 1, max = 200) => (
    <NumberStepper id={`soil-${k}`} label={label} unit={unit} step={step} min={0} max={max} value={soil[k]} onChange={(v) => setSoil((s) => ({ ...s, [k]: v }))}
      hint={fmt(t.typicalRange, { a, b, unit })} decLabel={t.decrease} incLabel={t.increase} />
  );

  return (
    <div className="space-y-5">
      <ScreenTitle lang={lang} icon="crops" title={t.tileCrop} desc={t.tileCropSub} onBack={onBack} />
      <Segmented label={t.tileCrop} value={mode} onChange={(m) => setMode(m)}
        options={[{ value: 'genai', label: t.modeQuick, icon: Sparkle }, { value: 'ml', label: t.modeSoilTest, icon: Flask }]} />

      <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6 items-start">
        {/* Inputs */}
        <section className="bg-paper rounded-[20px] p-5 border border-gray-200 shadow-soft space-y-5">
          {mode === 'genai' ? (
            <>
              <FarmQuestions lang={lang} profile={farm.profile} onChange={farm.save} fields={['districtId', 'soilType', 'waterSource', 'fieldSize']} editing={editing} onEditingChange={setEditing} />
              {!editing && (
                <button type="button" onClick={handleRecommend} disabled={loading || !farm.complete}
                  className="w-full min-h-[56px] rounded-2xl bg-agri-700 hover:bg-agri-800 text-white text-lg font-bold flex items-center justify-center gap-2 shadow-soft disabled:opacity-50">
                  <Plant size={24} weight="duotone" aria-hidden />{t.showBestCrops}
                </button>
              )}
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
              <div className="grid sm:grid-cols-2 gap-4">
                {stepper('nitrogen', t.nitrogen, 'kg/ha', 20, 120)}
                {stepper('phosphorus', t.phosphorus, 'kg/ha', 10, 80)}
                {stepper('potassium', t.potassium, 'kg/ha', 10, 80)}
                {stepper('ph', t.phLevel, '', 5.5, 7.5, 0.1, 14)}
                {stepper('rainfall', t.rainfall, 'mm', 400, 1500, 50, 4000)}
              </div>
              <p className="font-semibold text-ink pt-1">{t.fieldWeather}</p>
              <div className="grid grid-cols-2 gap-4">
                <NumberStepper id="ml-temp" label={t.temperature} value={extra.temperature} onChange={(v) => setExtra((e) => ({ ...e, temperature: v }))} min={0} max={50} decLabel={t.decrease} incLabel={t.increase} />
                <NumberStepper id="ml-hum" label={`${t.humidity} (%)`} value={extra.humidity} onChange={(v) => setExtra((e) => ({ ...e, humidity: v }))} min={0} max={100} decLabel={t.decrease} incLabel={t.increase} />
              </div>
              <button type="button" onClick={handleMLPredict} disabled={loading}
                className="w-full min-h-[56px] rounded-2xl bg-agri-700 hover:bg-agri-800 text-white text-lg font-bold flex items-center justify-center gap-2 shadow-soft disabled:opacity-50">
                <Atom size={24} weight="duotone" aria-hidden />{t.predictCrop}
              </button>
            </>
          )}
        </section>

        {/* Results */}
        <section ref={resultsRef} className="scroll-mt-24 min-w-0" aria-live="polite">
          {mode === 'genai' ? (
            <>
              {loading && (
                <WorkingOn lang={lang} expectedMs={18000} onRetry={handleRecommend} skeleton={<CardSkeletons count={2} />}
                  stages={[{ icon: Drop, text: t.stageCrop1 }, { icon: MagnifyingGlass, text: fmt(t.stageCrop2, { district }) }, { icon: ChartBar, text: t.stageCrop3 }, { icon: Sparkle, text: t.stageAlmost }]} />
              )}
              {recErr && !loading && <InlineError message={recErr} onRetry={handleRecommend} retryLabel={t.retry} className="mb-4" />}
              {!loading && recommendations.length === 0 && !recErr && (
                <div className="rounded-[20px] border-2 border-dashed border-agri-200 bg-paper/60 p-8 text-center">
                  <Plant size={44} weight="duotone" className="mx-auto text-agri-500 mb-3" aria-hidden />
                  <p className="text-lg text-gray-700">{farm.complete ? t.cropReady : t.noCrops}</p>
                </div>
              )}
              {!loading && recommendations.length > 0 && (
                <>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h2 className="text-xl md:text-2xl font-semibold text-ink">{t.bestCropsTitle}</h2>
                    <SpeakButton text={`${t.bestCropsTitle}. ${listenAll}`} lang={lang} label />
                  </div>
                  {recs.translating && <p className="text-[15px] text-gray-600 mb-2">{t.translating}</p>}
                  <ol className="space-y-3">
                    {recommendations.map((c, i) => (
                      <motion.li key={`${c.name}-${i}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 5) * 0.06, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}>
                        <button type="button" onClick={() => setSelected(c)}
                          className="w-full text-left bg-paper border border-gray-200 rounded-[20px] overflow-hidden shadow-soft hover:border-agri-300 hover:shadow-lift transition-[box-shadow,border-color] flex">
                          <span className="relative w-28 sm:w-36 shrink-0">
                            <img src={imgFor(c)} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                            <span className="absolute top-2 left-2 w-8 h-8 rounded-full bg-ink/80 text-white font-bold flex items-center justify-center tabular-nums" aria-hidden>{i + 1}</span>
                          </span>
                          <span className="flex-1 min-w-0 p-4">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-display text-xl font-semibold text-ink leading-tight">{c.name}</span>
                              <span className={cn('rounded-full px-2.5 py-0.5 font-semibold text-[15px]', matchCls(c.confidence))}>{matchWord(t, c.confidence)}</span>
                            </span>
                            {c.description && <span className="text-gray-700 mt-1 line-clamp-2">{c.description}</span>}
                            <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[15px] text-gray-700">
                              {c.requirements.water && <span className="flex items-center gap-1"><Drop size={18} weight="duotone" className="text-sky-700" aria-hidden />{c.requirements.water}</span>}
                              {c.growthPeriod && <span className="flex items-center gap-1"><Clock size={18} weight="duotone" className="text-agri-700" aria-hidden />{c.growthPeriod}</span>}
                            </span>
                            <span className="mt-2 inline-flex items-center gap-1 font-semibold text-agri-800">{t.seeDetails}<CaretRight size={16} weight="bold" aria-hidden /></span>
                          </span>
                        </button>
                      </motion.li>
                    ))}
                  </ol>
                </>
              )}
            </>
          ) : (
            <>
              {loading && <WorkingOn lang={lang} expectedMs={5000} stages={[{ icon: Flask, text: t.stageMl1 }, { icon: Atom, text: t.stageMl2 }]} onRetry={handleMLPredict} />}
              {mlErr && !loading && <InlineError message={mlErr} onRetry={handleMLPredict} retryLabel={t.retry} />}
              {!loading && !mlResult && !mlErr && (
                <div className="rounded-[20px] border-2 border-dashed border-agri-200 bg-paper/60 p-8 text-center">
                  <Atom size={44} weight="duotone" className="mx-auto text-agri-500 mb-3" aria-hidden />
                  <p className="text-lg text-gray-700">{t.precisionDesc}</p>
                </div>
              )}
              {mlResult && !loading && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }} className="bg-paper rounded-[20px] overflow-hidden shadow-lift border border-gray-200">
                  <div className="relative h-52">
                    <img src={cropImage(mlResult.prediction)} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-5">
                      <p className="text-agri-100">{t.mlResultTitle}</p>
                      <div className="flex items-center gap-3">
                        <h2 className="font-display text-4xl font-semibold text-white capitalize">{cropName(t, mlResult.prediction)}</h2>
                        <SpeakButton tone="dark" text={fmt(t.mlCropResult, { crop: cropName(t, mlResult.prediction) })} lang={lang} />
                      </div>
                      {mlResult.details?.confidence != null && (
                        <span className={cn('mt-1 self-start rounded-full px-2.5 py-0.5 font-semibold', matchCls(mlResult.details.confidence * 100))}>{matchWord(t, mlResult.details.confidence * 100)}</span>
                      )}
                    </div>
                  </div>
                  <div className="p-5">
                    <p className="text-gray-700 leading-relaxed">{fmt(t.mlCropResult, { crop: cropName(t, mlResult.prediction) })}</p>
                    <div className="mt-4"><MlExtras details={mlResult.details} prediction={mlResult.prediction} t={t} nameOf={(x) => cropName(t, x)} /></div>
                  </div>
                </motion.div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Crop details */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        {selected && (
          <SheetContent title={selected.name} description={selected.scientificName} closeLabel={t.close}>
            <img src={imgFor(selected)} alt="" className="w-full h-44 object-cover rounded-2xl mb-4" />
            <div className="flex items-center justify-between gap-2 mb-4">
              <span className={cn('rounded-full px-3 py-1 font-semibold', matchCls(selected.confidence))}>{matchWord(t, selected.confidence)}</span>
              <SpeakButton text={[selected.name, selected.description, selected.growthPeriod, selected.economicAnalysis].filter(Boolean).join('. ')} lang={lang} label />
            </div>
            {selected.description && (<><h3 className="font-semibold text-ink mb-1">{t.whyCrop}</h3><p className="text-gray-800 mb-4 leading-relaxed">{selected.description}</p></>)}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
              {[
                { icon: Clock, label: t.harvestIn, value: selected.growthPeriod },
                { icon: ChartBar, label: t.yieldLabel, value: selected.yieldPotential },
                { icon: Drop, label: t.waterLabel, value: selected.requirements.water },
                { icon: Sun, label: t.sunLabel, value: selected.requirements.sun },
                { icon: MapPin, label: t.soilLabel, value: selected.requirements.soil },
                { icon: Coins, label: t.marketLabel, value: selected.economicAnalysis },
              ].filter((x) => x.value).map((x) => (
                <div key={x.label} className="bg-cream border border-gray-200 rounded-2xl p-3">
                  <dt className="flex items-center gap-1.5 text-gray-600"><x.icon size={18} weight="duotone" aria-hidden />{x.label}</dt>
                  <dd className="text-ink mt-0.5">{x.value}</dd>
                </div>
              ))}
            </dl>
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
};

export default CropAdvisor;
