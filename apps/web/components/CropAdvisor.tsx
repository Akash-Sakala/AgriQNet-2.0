

import { Ico, MapPin as PinD, Mountains, Drop, Ruler } from './ui/Icons';
import React, { useState, useEffect } from 'react';
import { Sprout, Droplets, FlaskConical, MapPin, Loader2, CheckCircle, Clock, TrendingUp, DollarSign, X, Sun, Info, Leaf, Activity, BrainCircuit } from 'lucide-react';
import { GeminiService } from '../services/geminiService';
import { PlatformService } from '../services/platformService';
import { SoilData, CropRecommendation, Language, Farmer } from '../types';
import { getTranslation, fmt, cropName, LANGUAGES, LOCALES, districtName } from '../utils/translations';
import { ScreenTitle, SpeakButton, ChoiceGrid } from './ui/Kit';
import { MlExtras, MlDetails } from './ui/MlExtras';
import DistrictPicker from './DistrictPicker';
import { soilChoices, waterChoices, sizeChoices } from '../utils/farmOptions';
import { useLocalized } from '../utils/useLocalized';
import appleImg from '../images/apple.jpeg';
import bananaImg from '../images/banana.jpeg';
import blackgramImg from '../images/blackgram.jpeg';
import chickpeaImg from '../images/chickpea.jpeg';
import coconutImg from '../images/coconut.jpeg';
import coffeeImg from '../images/coffee.jpeg';
import cottonImg from '../images/cotton.jpeg';
import grapesImg from '../images/grapes.jpg';
import juteImg from '../images/jute.jpeg';
import kidneybeansImg from '../images/kidneybeans.jpeg';
import lentilImg from '../images/lentil.jpeg';
import maizeImg from '../images/maize.jpeg';
import mangoImg from '../images/mango.jpeg';
import mothbeansImg from '../images/mothbeans.jpeg';
import mungbeanImg from '../images/mungbean.jpeg';
import muskmelonImg from '../images/muskmelon.jpeg';
import orangeImg from '../images/orange.jpeg';
import papayaImg from '../images/papaya.jpeg';
import pigeonpeasImg from '../images/pigeonpeas.jpeg';
import pomegranateImg from '../images/pomegranate.jpeg';
import riceImg from '../images/rice.jpeg';
import watermelonImg from '../images/watermelon.jpeg';
import wheatImg from '../images/wheat.jpeg';
import cornImg from '../images/corn.jpeg';
import sugarcaneImg from '../images/sugarcane.jpeg';
import ragiImg from '../images/ragi.jpeg';
import jowarImg from '../images/jowar.jpeg';
import tomatoImg from '../images/tomato.jpeg';
import potatoImg from '../images/potato.jpeg';
import onionImg from '../images/onion.jpeg';
import chilliImg from '../images/chilli.jpeg';
import sunflowerImg from '../images/sunflower.jpeg';
import arecanutImg from '../images/arecanut.jpeg';
import groundnutImg from '../images/groundnut.jpeg';

interface CropAdvisorProps {
  lang: Language;
  user: Farmer;
  onBack: () => void;
}

// Predefined dictionary for common crops to ensure high-quality, relevant images
const CROP_IMAGES: Record<string, string> = {
  'wheat': wheatImg,
  'corn': cornImg,
  // 'potato': 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=800&q=80',
  // 'tomato': 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=800&q=80',
  'sugarcane': sugarcaneImg,
  'ragi': ragiImg, 'fingermillet': ragiImg, 'jowar': jowarImg, 'sorghum': jowarImg,
  'tomato': tomatoImg, 'potato': potatoImg, 'onion': onionImg, 'chilli': chilliImg, 'chili': chilliImg, 'sunflower': sunflowerImg, 'arecanut': arecanutImg, 'areca': arecanutImg, 'groundnut': groundnutImg, 'peanut': groundnutImg,
  // 'soybean': 'https://images.unsplash.com/photo-1526346698789-22fd84310124?auto=format&fit=crop&w=800&q=80',
  // 'barley': 'https://images.unsplash.com/photo-1518563259397-59c23b3eb981?auto=format&fit=crop&w=800&q=80',
  // 'tea': 'https://images.unsplash.com/photo-1558230263-5490726d691e?auto=format&fit=crop&w=800&q=80',
  // 'sunflower': 'https://images.unsplash.com/photo-1471193945509-9adadd0974ce?auto=format&fit=crop&w=800&q=80',
  // 'carrot': 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?auto=format&fit=crop&w=800&q=80',
  // 'onion': 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=800&q=80',
  // 'chilli': 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?auto=format&fit=crop&w=800&q=80',
  'maize': maizeImg,
  'apple': appleImg,
  'banana': bananaImg,
  'blackgram': blackgramImg,
  'chickpea': chickpeaImg,
  'coconut': coconutImg,
  'coffee': coffeeImg,
  'cotton': cottonImg,
  'grapes': grapesImg,
  'jute': juteImg,
  'kidneybeans': kidneybeansImg,
  'lentil': lentilImg,
  'mango': mangoImg,
  'mothbeans': mothbeansImg,
  'mungbean': mungbeanImg,
  'muskmelon': muskmelonImg,
  'orange': orangeImg,
  'papaya': papayaImg,
  'pigeonpeas': pigeonpeasImg,
  'pomegranate': pomegranateImg,
  'rice': riceImg,
  'watermelon': watermelonImg,
};

const STORAGE_KEY = 'agriqnet_crop_advisor';
// Neutral local placeholder (no external image service)
const PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dcfce7"/><stop offset="1" stop-color="#86efac"/></linearGradient></defs><rect width="400" height="240" fill="url(#g)"/><path d="M200 190V110m0 0c0-30 20-50 50-55-2 32-22 52-50 55zm0 18c0-26-18-44-44-48 2 28 20 46 44 48z" fill="none" stroke="#15803d" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>');

type AdvisorMode = 'genai' | 'ml';

const CropAdvisor: React.FC<CropAdvisorProps> = ({ lang, user, onBack }) => {
  const t = getTranslation(lang);
  const [loading, setLoading] = useState(false);
  const [selectedCrop, setSelectedCrop] = useState<CropRecommendation | null>(null);
  const [mode, setMode] = useState<AdvisorMode>('genai');

  // GenAI Simple Mode State
  const [genAIParams, setGenAIParams] = useState(() => {
    const base = { districtId: user.districtId || '', soilType: 'Red Soil', waterSource: 'Rainfed', fieldSize: 'under 2 acres' };
    try { return { ...base, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').genAIParams || {}), districtId: base.districtId || '' }; } catch { return base; }
  });
  const setParam = (k: string) => (v: string) => setGenAIParams((p: any) => ({ ...p, [k]: v }));
  const location = genAIParams.districtId ? `${districtName(getTranslation('en'), genAIParams.districtId)} district, Karnataka` : '';

  // ML Model State
  const [soilData, setSoilData] = useState<SoilData>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved).soilData : {
        nitrogen: 40,
        phosphorus: 50,
        potassium: 40,
        ph: 6.5,
        rainfall: 1200
      };
    } catch {
      return {
        nitrogen: 40,
        phosphorus: 50,
        potassium: 40,
        ph: 6.5,
        rainfall: 1200
      };
    }
  });

  const [extraParams, setExtraParams] = useState({
    temperature: 25,
    humidity: 70
  });
  
  const [mlResult, setMlResult] = useState<{prediction: string, details?: MlDetails} | null>(null);

  // AI results follow the language switch (translated, not re-generated)
  const recs = useLocalized<CropRecommendation[]>('agriqnet_crop_recs', lang, []);
  const recommendations = recs.value;
  const setRecommendations = recs.setValue;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ soilData, genAIParams }));
  }, [soilData, genAIParams]);

  // const handleRecommend = async () => {
  //   setLoading(true);
  //   try {
  //     // For GenAI, we pass the simplified params + current date
  //     const currentDate = new Date().toLocaleDateString(lang === 'en' ? 'en-US' : 'en-IN', {
  //       weekday: 'long',
  //       year: 'numeric',
  //       month: 'long',
  //       day: 'numeric'
  //     });
      
  //     const payload = {
  //       ...genAIParams,
  //       date: currentDate
  //     };

  //     const results = await GeminiService.recommendCrops(payload, lang);
  //     setRecommendations(results);
  //   } catch (err) {
  //     alert("Failed to get recommendations. Check API Key.");
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const handleRecommend = async () => {
  setLoading(true);
  try {
    const currentDate = new Date();
    const dateString = currentDate.toLocaleDateString('en-IN', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    // Detailed prompt construction
    const prompt = `
      CONTEXT:
      - Location: ${location}
      - Current Date: ${dateString}
      - Soil: ${genAIParams.soilType}
      - Water: ${genAIParams.waterSource}
      - Farm Size: ${genAIParams.fieldSize}
      - Preferred Language: ${LANGUAGES[lang]}

      INSTRUCTIONS:
      1. Analyze the agro-climatic zone of ${location}. Identify typical historical crops and current market demand in this specific region.
      2. Factor in the current season (e.g., Kharif, Rabi, or Zaid in India) based on the date: ${dateString}.
      3. Filter these crops based on the user's ${genAIParams.soilType} and ${genAIParams.waterSource}.
      4. Provide 4 high-probability recommendations. Use very simple words a farmer understands; short sentences.

      OUTPUT FORMAT:
      Return ONLY a JSON array. Write all values (except JSON keys and "englishName") in ${LANGUAGES[lang]}.
      Structure:
      [{
        "name": "string (in the farmer's language)",
        "englishName": "common English crop name, e.g. rice, maize, ragi",
        "scientificName": "string",
        "confidence": number,
        "description": "Why this works for ${location} in this season",
        "growthPeriod": "string",
        "yieldPotential": "string",
        "economicAnalysis": "Market demand and price trends for this region",
        "requirements": {
          "water": "string",
          "sun": "string",
          "soil": "string"
        }
      }]
    `;

    const results = await GeminiService.recommendCrops(prompt, lang, { districtId: genAIParams.districtId, crops: user.crops });
    setRecommendations(results);
  } catch (err) {
    console.error(err);
    alert(t.errRecommend);
  } finally {
    setLoading(false);
  }
};

  const handleMLPredict = async () => {
    setLoading(true);
    setMlResult(null);
    try {
      const payload = {
        N: soilData.nitrogen,
        P: soilData.phosphorus,
        K: soilData.potassium,
        temperature: extraParams.temperature,
        humidity: extraParams.humidity,
        ph: soilData.ph,
        rainfall: soilData.rainfall
      };

      // Local QML-inspired recommender (services/recommender) via the API gateway
      const data: any = await PlatformService.recommendCrop(payload);
      setMlResult(data);
    } catch (err) {
      console.error(err);
      alert(t.errCropModel);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSoilData({ ...soilData, [e.target.name]: parseFloat(e.target.value) });
  };
  

  const handleExtraParamChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setExtraParams({ ...extraParams, [e.target.name]: parseFloat(e.target.value) });
  };

  // Images are looked up by the English crop name (Gemini returns englishName even when
  // the visible name is in Kannada/Hindi/Telugu). Unknown crops use a local placeholder.
  const getCropImage = (name?: string) => {
    const normalizedName = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!normalizedName) return PLACEHOLDER_IMG;
    const aliases: Record<string, string> = { corn: 'maize', paddy: 'rice', tur: 'pigeonpeas', redgram: 'pigeonpeas', greengram: 'mungbean', moong: 'mungbean', urad: 'blackgram', bengalgram: 'chickpea', gram: 'chickpea' };
    if (aliases[normalizedName]) return CROP_IMAGES[aliases[normalizedName]];
    for (const key of Object.keys(CROP_IMAGES)) {
      if (normalizedName.includes(key) || key.includes(normalizedName)) return CROP_IMAGES[key];
    }
    return PLACEHOLDER_IMG;
  };
  const imgFor = (c: CropRecommendation) => getCropImage((c as any).englishName || c.name);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 relative">
      <ScreenTitle lang={lang} icon="crops" title={t.tileCrop} desc={t.tileCropSub} onBack={onBack} />

      {/* Detailed View Modal */}
      {selectedCrop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-paper rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-300 relative">
            <button 
              onClick={() => setSelectedCrop(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
            >
              <X size={20} />
            </button>
            
            <div className="relative h-64 md:h-80">
               <img 
                 src={imgFor(selectedCrop)} 
                 alt={selectedCrop.name} 
                 className="w-full h-full object-cover" 
               />
               <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-8">
                  <div className="flex items-center gap-3"><h2 className="text-4xl font-bold text-white mb-1">{selectedCrop.name}</h2>
                    <SpeakButton tone="dark" text={`${selectedCrop.name}. ${selectedCrop.description} ${selectedCrop.economicAnalysis}`} lang={lang} /></div>
                  <p className="text-green-300 font-medium italic text-lg">{selectedCrop.scientificName}</p>
               </div>
            </div>

            <div className="p-8 space-y-8">
               {/* Quick Stats Grid */}
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-green-50 p-4 rounded-2xl border border-green-100 text-center">
                    <CheckCircle className="mx-auto text-green-600 mb-2" size={24} />
                    <div className="text-xs text-gray-500 uppercase font-bold">{t.confidence}</div>
                    <div className="text-xl font-bold text-gray-800">{selectedCrop.confidence}%</div>
                  </div>
                  <div className="bg-agri-50 p-4 rounded-2xl border border-agri-100 text-center">
                    <Clock className="mx-auto text-agri-700 mb-2" size={24} />
                    <div className="text-xs text-gray-500 uppercase font-bold">{t.growthTime}</div>
                    <div className="text-xl font-bold text-gray-800 leading-tight text-sm md:text-base mt-1">{selectedCrop.growthPeriod}</div>
                  </div>
                  <div className="bg-gold-100 p-4 rounded-2xl border border-gold-100 text-center">
                    <TrendingUp className="mx-auto text-gold-700 mb-2" size={24} />
                    <div className="text-xs text-gray-500 uppercase font-bold">{t.yield}</div>
                    <div className="text-xl font-bold text-gray-800 leading-tight text-sm md:text-base mt-1">{selectedCrop.yieldPotential}</div>
                  </div>
                  <div className="bg-gold-100 p-4 rounded-2xl border border-gold-100 text-center">
                    <DollarSign className="mx-auto text-gold-700 mb-2" size={24} />
                    <div className="text-xs text-gray-500 uppercase font-bold">{t.economy}</div>
                    <div className="text-xl font-bold text-gray-800 leading-tight text-sm md:text-base mt-1 line-clamp-2">{selectedCrop.economicAnalysis.split('.')[0]}</div>
                  </div>
               </div>

               {/* Detailed Analysis */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="space-y-4">
                   <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                     <Info size={20} className="text-agri-600" /> {t.analysis}
                   </h3>
                   <p className="text-gray-600 leading-relaxed text-justify">
                     {selectedCrop.description}
                   </p>
                   <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                      <h4 className="font-bold text-gray-700 mb-2 text-sm">{t.economy}</h4>
                      <p className="text-sm text-gray-600">{selectedCrop.economicAnalysis}</p>
                   </div>
                 </div>

                 <div className="space-y-4">
                   <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                     <Leaf size={20} className="text-agri-600" /> {t.requirements}
                   </h3>
                   <div className="space-y-3">
                      <div className="flex items-start gap-3 p-3 bg-paper border border-gray-100 rounded-xl shadow-soft">
                        <div className="p-2 bg-agri-100 text-agri-700 rounded-lg"><Droplets size={18} /></div>
                        <div>
                          <span className="text-xs text-gray-400 font-bold uppercase">{t.waterNeeds}</span>
                          <p className="text-sm font-medium text-gray-700">{selectedCrop.requirements.water}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 bg-paper border border-gray-100 rounded-xl shadow-soft">
                        <div className="p-2 bg-gold-100 text-gold-700 rounded-lg"><Sun size={18} /></div>
                        <div>
                          <span className="text-xs text-gray-400 font-bold uppercase">{t.sunlight}</span>
                          <p className="text-sm font-medium text-gray-700">{selectedCrop.requirements.sun}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 bg-paper border border-gray-100 rounded-xl shadow-soft">
                        <div className="p-2 bg-amber-100 text-amber-700 rounded-lg"><MapPin size={18} /></div>
                        <div>
                          <span className="text-xs text-gray-400 font-bold uppercase">{t.soilPref}</span>
                          <p className="text-sm font-medium text-gray-700">{selectedCrop.requirements.soil}</p>
                        </div>
                      </div>
                   </div>
                 </div>
               </div>
            </div>
          </div>
        </div>
      )}

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
            {t.precisionModel}
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Input Section */}
        <div className="w-full md:w-5/12 space-y-6">
          <div className={`bg-paper rounded-3xl p-6 shadow-soft border ${mode === 'ml' ? 'border-agri-100' : 'border-agri-100'}`}>
            <div className="flex items-center gap-3 mb-6">
              <div className={`p-3 rounded-xl ${mode === 'ml' ? 'bg-agri-100 text-agri-700' : 'bg-agri-100 text-agri-600'}`}>
                {mode === 'ml' ? <Activity size={24} /> : <Leaf size={24} />}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-800">{mode === 'ml' ? t.precisionModel : t.soilData}</h2>
                <p className="text-sm text-gray-500">{mode === 'ml' ? t.precisionDesc : t.genAiDesc}</p>
              </div>
            </div>
            
            <div className="space-y-4">
              {mode === 'ml' ? (
                // ML Mode Inputs (Technical)
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t.nitrogen}</label>
                    <input type="range" name="nitrogen" min="0" max="140" value={soilData.nitrogen} onChange={handleInputChange} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-agri-500" />
                    <div className="text-right text-xs font-bold text-agri-700">{soilData.nitrogen} mg/kg</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t.phosphorus}</label>
                    <input type="range" name="phosphorus" min="0" max="100" value={soilData.phosphorus} onChange={handleInputChange} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-agri-500" />
                    <div className="text-right text-xs font-bold text-agri-700">{soilData.phosphorus} mg/kg</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t.potassium}</label>
                    <input type="range" name="potassium" min="0" max="100" value={soilData.potassium} onChange={handleInputChange} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-agri-500" />
                    <div className="text-right text-xs font-bold text-agri-700">{soilData.potassium} mg/kg</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-1">{t.temperature}</label>
                       <input type="number" name="temperature" value={extraParams.temperature} onChange={handleExtraParamChange} className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900" />
                     </div>
                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-1">{t.humidity} (%)</label>
                       <input type="number" name="humidity" value={extraParams.humidity} onChange={handleExtraParamChange} className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900" />
                     </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t.phLevel}</label>
                      <input type="number" name="ph" step="0.1" value={soilData.ph} onChange={handleInputChange} className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 outline-none focus:ring-blue-500 text-gray-900" />
                    </div>
                    <div>
                       <label className="block text-sm font-medium text-gray-700 mb-1">{t.rainfall}</label>
                      <input type="number" name="rainfall" value={soilData.rainfall} onChange={handleInputChange} className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 outline-none focus:ring-blue-500 text-gray-900" />
                    </div>
                  </div>
                </>
              ) : (
                // GenAI mode: big picture buttons, district already known
                <>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 font-semibold text-gray-800"><Ico icon={PinD} size={20} tone="forest" />{t.farmLocation}</label>
                    <DistrictPicker lang={lang} value={genAIParams.districtId} onChange={setParam('districtId')} />
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 font-semibold text-gray-800"><Ico icon={Mountains} size={20} tone="soil" />{t.soilType}</label>
                    <ChoiceGrid options={soilChoices(t)} value={genAIParams.soilType} onChange={setParam('soilType')} cols="grid-cols-2 sm:grid-cols-3 md:grid-cols-2 xl:grid-cols-3" size="sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 font-semibold text-gray-800"><Ico icon={Drop} size={20} tone="sky" />{t.waterSource}</label>
                    <ChoiceGrid options={waterChoices(t)} value={genAIParams.waterSource} onChange={setParam('waterSource')} cols="grid-cols-2 sm:grid-cols-3 md:grid-cols-2 xl:grid-cols-3" size="sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 font-semibold text-gray-800"><Ico icon={Ruler} size={20} tone="gold" />{t.fieldSize}</label>
                    <ChoiceGrid options={sizeChoices(t)} value={genAIParams.fieldSize} onChange={setParam('fieldSize')} cols="grid-cols-3 md:grid-cols-1 xl:grid-cols-3" size="sm" />
                  </div>
                </>
              )}
            </div>

            <button 
              onClick={mode === 'ml' ? handleMLPredict : handleRecommend}
              disabled={loading || (mode === 'genai' && !genAIParams.districtId)}
              className={`w-full mt-8 text-white text-lg font-bold py-4 px-6 rounded-2xl disabled:opacity-50 transition-all flex items-center justify-center gap-2 ${
                mode === 'ml' 
                  ? 'bg-agri-700 hover:bg-agri-800 shadow-lift'
                  : 'bg-agri-700 hover:bg-agri-800 shadow-lift'
              }`}
            >
              {loading ? <Loader2 className="animate-spin" /> : (mode === 'ml' ? <Activity /> : <Sprout />)}
              {loading ? t.analyzing : (mode === 'ml' ? t.predict : t.analyze)}
            </button>
          </div>
        </div>

        {/* Results Section */}
        <div className="w-full md:w-7/12">
          {/* ML Result Display */}
          {mode === 'ml' ? (
             <div className="h-full">
                {!mlResult && !loading && (
                   <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-white/50 border-2 border-dashed border-agri-200 rounded-3xl p-12">
                     <BrainCircuit size={48} className="mb-4 text-agri-300" />
                     <p className="text-lg text-center max-w-sm">{t.precisionDesc}</p>
                   </div>
                )}
                
                {mlResult && (
                  <div className="bg-paper rounded-2xl overflow-hidden shadow-lift border border-agri-100 animate-in zoom-in-95 duration-500">
                      <div className="h-64 overflow-hidden relative group">
                        <img 
                          src={getCropImage(mlResult.prediction)} 
                          alt={cropName(t, mlResult.prediction)} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-8">
                           <div className="bg-agri-700 text-white text-xs font-bold px-3 py-1 rounded-full w-fit mb-2 flex items-center gap-1">
                              <Activity size={12} /> {t.predictionResult}
                           </div>
                           <div className="flex items-center gap-3"><h2 className="text-4xl font-bold text-white capitalize">{cropName(t, mlResult.prediction)}</h2>
                             <SpeakButton tone="dark" text={fmt(t.mlCropResult, { crop: cropName(t, mlResult.prediction) })} lang={lang} /></div>
                           <p className="text-agri-200 font-medium">{t.confidenceScoreLabel}: {((mlResult.details?.confidence ?? 0) * 100).toLocaleString(LOCALES[lang], { maximumFractionDigits: 1 })}%</p>
                        </div>
                      </div>
                      <div className="p-8">
                         <div className="flex items-center gap-4 mb-6">
                            <div className="flex-1 bg-agri-50 p-4 rounded-xl border border-agri-100">
                               <span className="text-xs font-bold text-agri-700 uppercase">{t.inputSummary}</span>
                               <div className="flex flex-wrap gap-2 mt-2">
                                  <span className="text-xs bg-paper px-2 py-1 rounded border border-agri-100 text-gray-600">N: {soilData.nitrogen}</span>
                                  <span className="text-xs bg-paper px-2 py-1 rounded border border-agri-100 text-gray-600">P: {soilData.phosphorus}</span>
                                  <span className="text-xs bg-paper px-2 py-1 rounded border border-agri-100 text-gray-600">K: {soilData.potassium}</span>
                                  <span className="text-xs bg-paper px-2 py-1 rounded border border-agri-100 text-gray-600">{t.tempShort}: {extraParams.temperature}°C</span>
                               </div>
                            </div>
                         </div>
                         <p className="text-gray-600 leading-relaxed">
                            {fmt(t.mlCropResult, { crop: cropName(t, mlResult.prediction) })}
                         </p>
                         <div className="mt-4"><MlExtras details={mlResult.details} prediction={mlResult.prediction} t={t} nameOf={(x) => cropName(t, x)} /></div>
                      </div>
                  </div>
                )}
             </div>
          ) : (
            // GenAI Results Grid
            <div className="h-full">
              {recommendations.length === 0 && !loading ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-white/50 border-2 border-dashed border-gray-200 rounded-3xl p-12">
                  <Sprout size={48} className="mb-4 text-gray-300" />
                  <p className="text-lg text-center">{t.noCrops}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {recs.translating && <p className="col-span-full text-sm text-gray-500 flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2 border-agri-600 border-t-transparent animate-spin" />{t.translating}</p>}
                  {recommendations.map((crop, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => setSelectedCrop(crop)}
                      className="bg-paper rounded-2xl overflow-hidden shadow-soft hover:shadow-lift transition-all border border-gray-100 group cursor-pointer transform hover:-translate-y-1"
                    >
                        <div className="h-40 overflow-hidden relative">
                          <img 
                            src={imgFor(crop)} 
                            alt={crop.name} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                          />
                          <div className="absolute top-2 right-2 bg-white/90 backdrop-blur text-agri-700 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                            <CheckCircle size={12} /> {fmt(t.matchPct, { n: crop.confidence })}
                          </div>
                        </div>
                        <div className="p-5">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-xl font-bold text-gray-800 mb-1">{crop.name}</h3>
                            <SpeakButton text={`${crop.name}. ${crop.description}. ${crop.requirements.water}. ${crop.growthPeriod}`} lang={lang} size="sm" />
                          </div>
                          <p className="text-xs text-gray-400 italic mb-3">{crop.scientificName}</p>
                          
                          <p className="text-gray-700 text-base mb-4 line-clamp-3">{crop.description}</p>
                          
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <Droplets size={14} className="text-agri-500" />
                              <span>{crop.requirements.water}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <Sun size={14} className="text-gold-700" />
                              <span>{crop.requirements.sun}</span>
                            </div>
                          </div>
                          
                          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-center">
                            <span className="text-xs font-bold text-agri-600 uppercase tracking-wide group-hover:underline">{t.clickAnalysis}</span>
                          </div>
                        </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CropAdvisor;