
import { Ico, Plant, Mountains, PencilSimple } from './ui/Icons';
import React, { useState, useEffect } from 'react';
import { FlaskConical, Leaf, AlertCircle, Loader2, Calendar, Scale, BrainCircuit, Activity, Sprout } from 'lucide-react';
import { GeminiService } from '../services/geminiService';
import { PlatformService } from '../services/platformService';
import { FertilizerPlan, Language, Farmer } from '../types';
import { getTranslation, fmt, fertName, LOCALES } from '../utils/translations';
import { ScreenTitle, SpeakButton, ChoiceGrid, VoiceField } from './ui/Kit';
import { MlExtras, MlDetails } from './ui/MlExtras';
import { cropChoices, soilChoices } from '../utils/farmOptions';
import { useLocalized } from '../utils/useLocalized';

interface FertilizerAdvisorProps {
  lang: Language;
  user: Farmer;
  onBack: () => void;
}

const STORAGE_KEY = 'agriqnet_fertilizer_advisor';

type AdvisorMode = 'genai' | 'ml';

const FertilizerAdvisor: React.FC<FertilizerAdvisorProps> = ({ lang, user, onBack }) => {
  const t = getTranslation(lang);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<AdvisorMode>('genai');

  // Initialize state from localStorage
  const savedData = (() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch { return {}; }
  })();

  // GenAI Mode State
  const [crop, setCrop] = useState<string>(savedData.crop || user.crops?.[0] || '');
  const [otherCrop, setOtherCrop] = useState('');
  const [soilType, setSoilType] = useState(savedData.soilType && savedData.soilType.includes('Soil') ? savedData.soilType : 'Red Soil');
  // AI plans follow the language switch (translated, not re-generated)
  const plansStore = useLocalized<FertilizerPlan[]>('agriqnet_fert_plans', lang, []);
  const plans = plansStore.value;
  const setPlans = plansStore.setValue;
  // The farmer's own crops first
  const allCrops = cropChoices(t);
  const myCrops = [...allCrops.filter((c) => user.crops?.includes(c.value)), ...allCrops.filter((c) => !user.crops?.includes(c.value))].slice(0, 9);
  const cropToSend = crop === '__other' ? otherCrop : crop;

  // ML Mode State
  const [mlParams, setMlParams] = useState({
    nitrogen: 40,
    phosphorus: 40,
    potassium: 40
  });
  const [mlResult, setMlResult] = useState<{prediction: string, details?: MlDetails} | null>(null);

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ crop, soilType, mlParams }));
  }, [crop, soilType, mlParams]);

  const handleRecommend = async () => {
    if (!cropToSend) return;
    setLoading(true);
    try {
      const results = await GeminiService.recommendFertilizer(cropToSend, soilType, lang, { districtId: user.districtId, crops: user.crops });
      setPlans(results);
    } catch (err) {
      console.error(err);
      alert(t.errFertGenAi);
    } finally {
      setLoading(false);
    }
  };

  const handleMLPredict = async () => {
    setLoading(true);
    setMlResult(null);
    try {
      const payload = {
        Nitrogen: mlParams.nitrogen,
        Potassium: mlParams.potassium,
        Phosphorous: mlParams.phosphorus // API expects 'Phosphorous'
      };

      // Local AgriQNet v3 quantum-hybrid recommender (services/recommender) via the API gateway
      const data: any = await PlatformService.recommendFertilizer(payload);
      setMlResult(data);
    } catch (err) {
      console.error(err);
      alert(t.errFertModel);
    } finally {
      setLoading(false);
    }
  };

  const handleMlParamChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMlParams({ ...mlParams, [e.target.name]: parseFloat(e.target.value) });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      <ScreenTitle lang={lang} icon="fertilizer" title={t.tileFert} desc={t.tileFertSub} onBack={onBack} />

      {/* Mode Switcher */}
      <div className="flex justify-center mb-6">
        <div className="bg-gray-100 p-1.5 rounded-full inline-flex items-center shadow-inner">
          <button
            onClick={() => setMode('genai')}
            className={`px-6 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${
              mode === 'genai' 
                ? 'bg-paper text-agri-700 shadow-soft' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <BrainCircuit size={16} />
            {t.aiModel}
          </button>
          <button
            onClick={() => setMode('ml')}
            className={`px-6 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${
              mode === 'ml' 
                ? 'bg-agri-700 text-white shadow-soft' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Activity size={16} />
            {t.fertilizerPrecision}
          </button>
        </div>
      </div>

      {/* Input Section */}
      <div className={`bg-paper rounded-3xl p-8 shadow-soft border ${mode === 'ml' ? 'border-gold-300' : 'border-agri-100'}`}>
        <div className="text-center max-w-2xl mx-auto mb-8">
           <div className={`inline-flex p-3 rounded-full mb-4 ${mode === 'ml' ? 'bg-gold-100 text-gold-700' : 'bg-gold-100 text-gold-700'}`}>
             {mode === 'ml' ? <Activity size={32} /> : <FlaskConical size={32} />}
           </div>
           <h2 className="text-3xl font-bold text-gray-800">{mode === 'ml' ? t.fertilizerPrecision : t.calcTitle}</h2>
           <p className="text-gray-500 mt-2">{mode === 'ml' ? t.fertilizerPrecisionDesc : t.calcDesc}</p>
        </div>

        {mode === 'ml' ? (
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t.nitrogen}</label>
                <input type="range" name="nitrogen" min="0" max="140" value={mlParams.nitrogen} onChange={handleMlParamChange} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gold-700" />
                <div className="text-right text-xs font-bold text-gold-700">{mlParams.nitrogen} kg/ha</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t.phosphorus}</label>
                <input type="range" name="phosphorus" min="0" max="140" value={mlParams.phosphorus} onChange={handleMlParamChange} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gold-700" />
                <div className="text-right text-xs font-bold text-gold-700">{mlParams.phosphorus} kg/ha</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t.potassium}</label>
                <input type="range" name="potassium" min="0" max="140" value={mlParams.potassium} onChange={handleMlParamChange} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gold-700" />
                <div className="text-right text-xs font-bold text-gold-700">{mlParams.potassium} kg/ha</div>
              </div>
           </div>
        ) : (
          <div className="space-y-6 mb-6">
             <div className="space-y-2">
               <label className="flex items-center gap-2 font-semibold text-gray-800"><Ico icon={Plant} size={20} tone="leaf" />{t.targetCrop}</label>
               <ChoiceGrid options={[...myCrops, { value: '__other', label: t.otherCrop, ph: PencilSimple, tone: 'stone' as const }]} value={crop} onChange={setCrop} cols="grid-cols-3 sm:grid-cols-5" size="sm" />
               {crop === '__other' && <VoiceField lang={lang} value={otherCrop} onChange={setOtherCrop} placeholder={t.phCrop} />}
             </div>
             <div className="space-y-2">
               <label className="flex items-center gap-2 font-semibold text-gray-800"><Ico icon={Mountains} size={20} tone="soil" />{t.soilCond}</label>
               <ChoiceGrid options={soilChoices(t)} value={soilType} onChange={setSoilType} cols="grid-cols-3 sm:grid-cols-5" size="sm" />
             </div>
          </div>
        )}

        <button 
          onClick={mode === 'ml' ? handleMLPredict : handleRecommend}
          disabled={loading || (mode === 'genai' && !cropToSend)}
          className={`w-full font-bold py-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
            mode === 'ml' 
            ? 'bg-agri-700 hover:bg-agri-800 text-white shadow-lift' 
            : 'bg-agri-700 hover:bg-agri-800 text-white shadow-lift'
          }`}
        >
          {loading ? <Loader2 className="animate-spin" /> : (mode === 'ml' ? <Activity /> : <FlaskConical />)}
          {loading ? t.analyzing : (mode === 'ml' ? t.predictFert : t.genPlan)}
        </button>
      </div>

      {/* Results Section */}
      {mode === 'ml' ? (
         <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            {mlResult && (
               <div className="bg-paper rounded-3xl p-8 shadow-soft border border-gold-100 flex flex-col md:flex-row items-center gap-8">
                  <div className="w-full md:w-1/3 flex justify-center">
                     <div className="w-40 h-40 bg-gold-100 rounded-full flex items-center justify-center shadow-inner">
                        <Sprout size={80} className="text-gold-700" />
                     </div>
                  </div>
                  <div className="w-full md:w-2/3 space-y-4 text-center md:text-left">
                     <div className="bg-gold-100 text-gold-700 text-xs font-bold px-3 py-1 rounded-full w-fit mx-auto md:mx-0 flex items-center gap-1">
                        <Activity size={12} /> {t.predictionResult}
                     </div>
                     <div className="flex items-center gap-3 justify-center md:justify-start"><h3 className="text-4xl font-bold text-gray-800">{fertName(t, mlResult.prediction)}</h3>
                       <SpeakButton text={fmt(t.mlFertResult, { fert: fertName(t, mlResult.prediction) })} lang={lang} /></div>
                     <div className="flex items-center justify-center md:justify-start gap-4">
                        <div className="bg-green-50 px-4 py-2 rounded-xl border border-green-100">
                           <span className="block text-xs text-green-600 font-bold uppercase">{t.confidence}</span>
                           <span className="text-xl font-bold text-green-700">{((mlResult.details?.confidence ?? 0) * 100).toLocaleString(LOCALES[lang], { maximumFractionDigits: 1 })}%</span>
                        </div>
                     </div>
                     <p className="text-gray-500 text-sm">
                        {fmt(t.mlFertResult, { fert: fertName(t, mlResult.prediction) })} (N {mlParams.nitrogen} · P {mlParams.phosphorus} · K {mlParams.potassium})
                     </p>
                     <MlExtras details={mlResult.details} prediction={mlResult.prediction} t={t} nameOf={(x) => fertName(t, x)} />
                  </div>
               </div>
            )}
         </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {plansStore.translating && <p className="col-span-full text-sm text-gray-500 flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2 border-agri-600 border-t-transparent animate-spin" />{t.translating}</p>}
          {plans.map((plan, idx) => (
            <div key={idx} className="bg-paper rounded-3xl p-6 shadow-soft border border-gray-100 flex flex-col h-full hover:border-gold-300 transition-colors group">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-800">{plan.name}</h3>
                <SpeakButton text={`${plan.name}. ${plan.description}. ${t.appFreq}: ${plan.applicationFrequency}. ${t.dosage}: ${plan.dosage}. ${(plan.warnings || []).join('. ')}`} lang={lang} />
              </div>
              
              <div className="mb-6">
                <p className="text-gray-700 text-base leading-relaxed">{plan.description}</p>
              </div>
              
              <div className="mt-auto space-y-4">
                <div className="bg-gold-100 rounded-xl p-4 space-y-4 border border-gold-100">
                  {/* Frequency Section */}
                  <div className="flex gap-4 items-start">
                      <div className="bg-paper p-2 rounded-lg text-gold-700 shadow-soft shrink-0">
                        <Calendar size={20} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{t.appFreq}</h4>
                        <p className="text-gray-900 font-medium text-base">{plan.applicationFrequency}</p>
                      </div>
                  </div>

                  <div className="h-px bg-gold-300 w-full opacity-50"></div>

                  {/* Dosage Section */}
                  <div className="flex gap-4 items-start">
                      <div className="bg-paper p-2 rounded-lg text-gold-700 shadow-soft shrink-0">
                        <Scale size={20} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{t.dosage}</h4>
                        <p className="text-gray-900 font-medium text-base">{plan.dosage}</p>
                      </div>
                  </div>
                </div>

                {plan.warnings && plan.warnings.length > 0 && (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2 text-red-700 font-bold text-xs uppercase tracking-wide">
                      <AlertCircle size={14} />
                      <span>{t.warnings}</span>
                    </div>
                    <ul className="space-y-2">
                      {plan.warnings.map((w, i) => (
                        <li key={i} className="flex gap-2 text-xs text-red-800 leading-snug">
                          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FertilizerAdvisor;
