import React, { useState, useRef, useEffect } from 'react';
import { Upload, AlertTriangle, ScanLine, ShieldCheck, Bug, Loader2 } from 'lucide-react';
import { GeminiService } from '../services/geminiService';
import { PlatformService } from '../services/platformService';
import { PestAnalysisResult, Language } from '../types';
import { getTranslation } from '../utils/translations';

interface PestControlProps {
  lang: Language;
}

const STORAGE_KEY = 'agriqnet_pest_control';

const PestControl: React.FC<PestControlProps> = ({ lang }) => {
  const t = getTranslation(lang);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load from localStorage
  const savedData = (() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  })();

  const [image, setImage] = useState<string | null>(savedData.image || null);
  // Cached result is only shown if it was produced in the current language
  const [result, setResult] = useState<PestAnalysisResult | null>((savedData.resultLang || 'en') === lang ? savedData.result || null : null);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ image, result, resultLang: lang }));
    } catch {
      /* ignore quota errors */
    }
  }, [image, result]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImage(reader.result as string);
      setResult(null);
    };
    reader.readAsDataURL(file);
  };

  const analyzePest = async () => {
    if (!image) return;
    setLoading(true);
    try {
      const base64Data = image.split(',')[1];
      const mimeType = image.slice(5, image.indexOf(';')) || 'image/jpeg';
      // 1) Our YOLOv8 model (works offline, no AI quota). 2) Gemini only writes the advice text.
      let analysis: PestAnalysisResult | null = null;
      try {
        const blob = await (await fetch(image)).blob();
        const det = await PlatformService.detectPest(new File([blob], 'pest.jpg', { type: blob.type || mimeType }), lang);
        if (det.pestType && det.model !== 'gemini-vision') {
          const advice = await GeminiService.pestAdvice(det.pestType, det.crop, lang).catch(() => null);
          analysis = {
            pestName: det.localName || det.pestType,
            confidence: det.confidence ?? 0,
            severity: (advice?.severity as PestAnalysisResult['severity']) || (det.defaultSeverity === 'RED' ? 'High' : 'Medium'),
            description: advice?.description || '',
            treatments: advice?.treatments?.length ? advice.treatments : det.management || [],
            preventions: advice?.preventions || [],
          };
        } else if (det.gemini) {
          analysis = det.gemini as PestAnalysisResult;
        }
      } catch { /* fall through to Gemini Vision */ }
      setResult(analysis || await GeminiService.analyzePestImage(base64Data, lang, mimeType));
    } catch {
      alert(t.analysisFailed);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'low': return 'bg-yellow-100 text-yellow-700';
      case 'medium': return 'bg-orange-100 text-orange-700';
      case 'high': return 'bg-red-100 text-red-700';
      case 'critical': return 'bg-red-600 text-white';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'low': return t.severityLow;
      case 'medium': return t.severityMedium;
      case 'high': return t.severityHigh;
      case 'critical': return t.severityCritical;
      default: return severity;
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-800">{t.pestTitle}</h2>
        <p className="text-gray-500 mt-2">{t.pestDesc}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Upload Section */}
        <div className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100 flex flex-col items-center justify-center min-h-[400px]">
          {image ? (
            <div className="relative w-full h-full rounded-2xl overflow-hidden group">
              <img
                src={image}
                alt={t.uploadedAlt}
                className="w-full h-64 object-cover md:h-full rounded-2xl"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-white text-gray-800 px-4 py-2 rounded-full font-medium"
                >
                  {t.changePhoto}
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-full border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-agri-50 hover:border-agri-300 transition-colors p-10"
            >
              <div className="p-4 bg-agri-100 rounded-full text-agri-600">
                <Upload size={32} />
              </div>
              <div className="text-center">
                <p className="font-semibold text-gray-700">{t.upload}</p>
                <p className="text-sm text-gray-400">{t.uploadFormats}</p>
              </div>
            </div>
          )}

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            className="hidden"
            accept="image/*"
          />

          <button
            onClick={analyzePest}
            disabled={!image || loading}
            className={`mt-6 w-full py-3 px-6 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all ${
              !image
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-gradient-to-r from-red-500 to-orange-500 hover:shadow-lg hover:shadow-orange-500/30'
            }`}
          >
            {loading ? <Loader2 className="animate-spin" /> : <ScanLine />}
            {loading ? t.analyzing : t.diagnose}
          </button>
        </div>

        {/* Results Section */}
        <div className="bg-white p-8 rounded-3xl shadow-lg border border-gray-100 relative overflow-hidden">
          {!result && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-white z-10">
              <Bug size={64} className="mb-4 opacity-20" />
              <p>{t.analysisPlaceholder}</p>
            </div>
          )}

          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur z-20">
              <div className="w-16 h-16 border-4 border-agri-200 border-t-agri-600 rounded-full animate-spin mb-4"></div>
              <p className="text-agri-800 font-medium">{t.analyzingPest}</p>
            </div>
          )}

          {result && (
            <div className="relative z-0 space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-bold text-gray-800">{result.pestName}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${getSeverityColor(result.severity)}`}>
                      {getSeverityLabel(result.severity)} {t.risk}
                    </span>
                    <span className="text-sm text-gray-500">
                      {t.confidence}: {(result.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className={`p-3 rounded-full ${result.pestName.toLowerCase().includes('no pest') ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                  {result.pestName.toLowerCase().includes('no pest')
                    ? <ShieldCheck size={32} />
                    : <AlertTriangle size={32} />}
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl text-gray-700 text-sm leading-relaxed">
                {result.description}
              </div>

              {result.treatments?.length > 0 && (
                <div>
                  <h4 className="font-bold text-gray-800 mb-3">{t.treatments}</h4>
                  <ul className="space-y-2">
                    {result.treatments.map((item, i) => (
                      <li key={i} className="text-sm text-gray-600">• {item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.preventions?.length > 0 && (
                <div>
                  <h4 className="font-bold text-gray-800 mb-3">{t.prevention}</h4>
                  <ul className="space-y-2">
                    {result.preventions.map((item, i) => (
                      <li key={i} className="text-sm text-gray-600">• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PestControl;
