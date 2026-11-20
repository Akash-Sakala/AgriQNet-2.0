import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, RotateCcw, Send, Loader2, Map as MapIcon, Home as HomeIcon } from 'lucide-react';
import { Farmer, Language, NavView } from '../types';
import { getTranslation, fmt, districtName, sentenceCase } from '../utils/translations';
import { CameraCapture, canUseCamera } from './CameraCapture';
import { WorkingOn } from './ui/WorkingOn';
import { MagnifyingGlass, Bug as BugD, ChatCircleDots } from '@phosphor-icons/react';
import { PlatformService, PestDetection, AlertReport, Edge, pestDictionary, PestInfo, zonesFor } from '../services/platformService';
import { GeminiService } from '../services/geminiService';
import { pestLabel, cropGroupLabel, pestTips } from '../utils/pests';
import { useLocalized } from '../utils/useLocalized';
import DistrictPicker from './DistrictPicker';
import { motion } from 'motion/react';
import { IconChip, Ico, Bug, MagnifyingGlassIcon, FirstAidKit, ShieldCheck, Megaphone, MapPin as Pin, DeviceMobile, IdentificationBadge, SealCheck, Hourglass, Info, Plant, Question } from './ui/Icons';
import { SeverityMeter } from './ui/Severity';
import { ScreenTitle, SpeakButton, ChoiceGrid, Step, Spinner } from './ui/Kit';

type Sev = 'RED' | 'ORANGE' | 'YELLOW';
const DEPTH: Record<Sev, number> = { RED: 2, ORANGE: 1, YELLOW: 0 };
const SURE = 0.6; // same rule as the server: ≥60 % sends at once

interface Detected { pestType: string; crop?: string; confidence: number; model?: string; defaultSeverity?: Sev; management?: string[] }

/**
 * One simple flow for farmers: photo → "is this the pest?" → how bad / where → warn farmers.
 * The server decides: confident photo (or 2+ farmers) = sent at once; otherwise an officer checks.
 */
const PestCheck: React.FC<{ lang: Language; user: Farmer; onBack: () => void; onNavigate: (v: NavView) => void }> = ({ lang, user, onBack, onNavigate }) => {
  const t = getTranslation(lang);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [det, setDet] = useState<Detected | null>(null);
  const [pests, setPests] = useState<Record<string, PestInfo>>({});
  const advice = useLocalized<{ pest: string; description?: string; treatments?: string[]; preventions?: string[] } | null>('agriqnet_pest_advice', lang, null);
  const [adviceBusy, setAdviceBusy] = useState(false);
  const [districtId, setDistrictId] = useState(user.districtId || '');
  const [severity, setSeverity] = useState<Sev>('ORANGE');
  const [edges, setEdges] = useState<Edge[]>([]);
  const [result, setResult] = useState<AlertReport | null>(null);
  const [camOpen, setCamOpen] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => { pestDictionary(lang).then(setPests); }, [lang]);
  useEffect(() => { PlatformService.getEdges().then(setEdges).catch(() => {}); }, []);

  const onFile = async (file?: File) => {
    if (!file) return;
    setCamOpen(false);
    setError('');
    setDet(null);
    setPreview(URL.createObjectURL(file));
    setStep(2);
    setBusy(true);
    try {
      const r: PestDetection = await PlatformService.detectPest(file, 'en');
      if (!r.pestType) { setError(t.noPestDetected); return; }
      const d: Detected = { pestType: r.pestType, crop: r.crop, confidence: r.confidence ?? 0, model: r.model, defaultSeverity: r.defaultSeverity, management: r.management };
      setDet(d);
      if (r.defaultSeverity) setSeverity(r.defaultSeverity);
      // Plain-language advice (AI) — loads in the background, translated when the language changes
      setAdviceBusy(true);
      GeminiService.pestAdvice(r.pestType, r.crop, lang)
        .then((a) => advice.setValue({ pest: r.pestType, description: a.description, treatments: a.treatments, preventions: a.preventions }))
        .catch(() => advice.setValue(null))
        .finally(() => setAdviceBusy(false));
    } catch {
      setError(t.detectFailed);
    } finally {
      setBusy(false);
    }
  };

  const restart = () => { setStep(1); setPreview(null); setDet(null); setError(''); setResult(null); };

  const send = async () => {
    if (!det || !districtId) return;
    setBusy(true);
    setError('');
    try {
      setResult(await PlatformService.reportAlert(districtId, severity, det.pestType, det.confidence, user.id, det.model));
      setStep(4);
    } catch {
      setError(t.errBroadcast);
    } finally {
      setBusy(false);
    }
  };

  const name = det ? sentenceCase(pestLabel(lang, det.pestType)) : '';
  const info = det ? pests[det.pestType.toLowerCase()] : undefined;
  const crop = det ? cropGroupLabel(lang, det.crop || info?.crop) : '';
  const tips = det ? (info?.management?.length ? info.management : pestTips(lang, det.crop, det.management || [])) : [];
  const sure = (det?.confidence ?? 0) >= SURE;
  const unsure = (det?.confidence ?? 0) < 0.4;
  const sureWord = sure ? t.sureWord : unsure ? t.unsureWord : t.maybeWord;
  const openCamera = () => (canUseCamera() ? setCamOpen(true) : cameraRef.current?.click());
  const askAbout = () => { try { localStorage.setItem('agriqnet_ask_prefill', fmt(t.askPestQ, { pest: name })); } catch { /* ignore */ } onNavigate('chat'); };
  const adv = advice.value && det && advice.value.pest === det.pestType ? advice.value : null;
  const zones = useMemo(() => (districtId ? zonesFor(districtId, edges, DEPTH[severity]) : null), [districtId, edges, severity]);
  const reach = zones ? zones.red.length + zones.orange.length + zones.yellow.length : 0;

  const sevChoices = [
    { value: 'RED', icon: <SeverityMeter level="RED" />, label: t.sevBadTitle, sub: t.sevRedDesc },
    { value: 'ORANGE', icon: <SeverityMeter level="ORANGE" />, label: t.sevMediumTitle, sub: t.sevOrangeDesc },
    { value: 'YELLOW', icon: <SeverityMeter level="YELLOW" />, label: t.sevFewTitle, sub: t.sevYellowDesc },
  ];

  const big = 'w-full py-4 px-5 rounded-2xl text-lg font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-60';

  return (
    <div className="max-w-3xl mx-auto">
      <ScreenTitle lang={lang} icon="pest_check" title={t.pestCheckTitle} desc={t.pestCheckDesc} onBack={onBack} />

      <div className="flex items-center gap-2 sm:gap-4 mb-5 bg-paper rounded-2xl p-3 border border-gray-100">
        <Step n={1} title={t.stepPhoto} done={step > 1} active={step === 1} />
        <span className="flex-1 h-0.5 bg-gray-200" />
        <Step n={2} title={t.stepCheck} done={step > 2} active={step === 2} />
        <span className="flex-1 h-0.5 bg-gray-200" />
        <Step n={3} title={t.stepWarn} done={step > 3} active={step >= 3} />
      </div>

      {camOpen && <CameraCapture lang={lang} onCapture={(f) => onFile(f)} onClose={() => setCamOpen(false)} onGallery={() => { setCamOpen(false); galleryRef.current?.click(); }} onFallback={() => { setCamOpen(false); cameraRef.current?.click(); }} />}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />

      {step === 1 && (
        <div className="bg-paper rounded-3xl border border-gray-100 p-5 space-y-4">
          <div className="flex items-start gap-3 bg-cream rounded-2xl p-4 border border-gray-200">
            <IconChip icon={MagnifyingGlassIcon} tone="rust" />
            <p className="flex-1 text-gray-800 text-lg">{t.photoTip}</p>
            <SpeakButton text={t.photoTip} lang={lang} />
          </div>
          <button onClick={openCamera} className={`${big} bg-agri-700 hover:bg-agri-800 text-white py-6 text-xl shadow-lift`}>
            <Camera size={28} /> {t.takePhoto}
          </button>
          <button onClick={() => galleryRef.current?.click()} className={`${big} bg-paper border-2 border-agri-200 text-agri-800 hover:bg-agri-50`}>
            <ImageIcon size={24} /> {t.choosePhoto}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="bg-paper rounded-3xl border border-gray-100 overflow-hidden">
          {preview && (
            <div className="relative bg-gray-900">
              <img src={preview} alt="" className="w-full max-h-72 object-contain" />
              {busy && <span aria-hidden className="pest-scan absolute inset-x-0 top-0 h-1 bg-gold-300 shadow-[0_0_24px_6px_rgba(226,199,102,0.65)]" />}
            </div>
          )}
          <div className="p-5 space-y-4">
            {busy && <WorkingOn lang={lang} expectedMs={6000} stages={[{ icon: MagnifyingGlass, text: t.stagePest1 }, { icon: BugD, text: t.stagePest2 }]} />}
            {!busy && error && (
              <div className="text-center space-y-4">
                <IconChip icon={Question} tone="stone" size="xl" className="mx-auto" />
                <p role="alert" className="text-lg text-gray-800">{error}</p>
                <button onClick={restart} className={`${big} bg-agri-700 text-white`}><RotateCcw /> {t.tryAnotherPhoto}</button>
              </div>
            )}
            {!busy && det && (
              <>
                <div className="flex items-start gap-3">
                  <IconChip icon={Bug} tone="rust" size="lg" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-500 font-semibold">{t.isThisThePest}</p>
                    <h2 className="text-3xl font-semibold text-ink leading-tight">{name}</h2>
                    {lang !== 'en' && name !== det.pestType && <p className="text-gray-500 italic">{det.pestType}</p>}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {crop && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-agri-50 border border-agri-200 text-agri-800 font-medium text-sm"><Ico icon={Plant} size={16} />{fmt(t.hostCrop, { crop })}</span>}
                      <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full font-medium text-sm border ${sure ? 'bg-agri-50 border-agri-200 text-agri-800' : 'bg-gold-100 border-gold-300 text-gold-700'}`}>
                        <span className="w-14 h-1.5 rounded-full bg-black/10 overflow-hidden"><motion.span className="block h-full rounded-full" style={{ background: sure ? '#2B6046' : '#C9A227' }} initial={{ width: 0 }} animate={{ width: `${Math.round(det.confidence * 100)}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} /></span>
                        {sureWord}
                      </span>
                    </div>
                  </div>
                  <SpeakButton text={[name, crop && fmt(t.hostCrop, { crop }), adv?.description, ...(adv?.treatments || tips).slice(0, 4)].filter(Boolean).join('. ')} lang={lang} />
                </div>

                {unsure && (
                  <div role="status" className="flex flex-col sm:flex-row sm:items-center gap-3 bg-gold-100 border border-gold-300 rounded-2xl p-4">
                    <p className="flex-1 font-semibold text-ink">{t.lowConfidence}</p>
                    <button onClick={() => { restart(); openCamera(); }} className="min-h-[48px] px-4 rounded-2xl bg-agri-700 text-white font-bold flex items-center justify-center gap-2"><Camera size={20} />{t.retakePhoto}</button>
                  </div>
                )}

                <div className="bg-cream border border-gray-200 rounded-2xl p-4 md:p-5">
                  <p className="flex items-center gap-2 font-semibold text-ink mb-2 text-lg"><Ico icon={FirstAidKit} size={22} tone="forest" />{t.whatToDoNow}</p>
                  {adv?.description && <p className="text-gray-800 mb-2">{adv.description}</p>}
                  <ul className="space-y-1.5">
                    {(adv?.treatments?.length ? adv.treatments : tips).slice(0, 3).map((m, i) => <li key={i} className="flex gap-2.5 text-gray-800"><span className="w-7 h-7 shrink-0 rounded-full bg-agri-700 text-white text-[15px] font-semibold flex items-center justify-center">{i + 1}</span>{m}</li>)}
                  </ul>
                  {adv?.preventions && adv.preventions.length > 0 && (
                    <>
                      <p className="flex items-center gap-2 font-semibold text-ink mt-4 mb-1"><Ico icon={ShieldCheck} size={20} tone="forest" />{t.prevention}</p>
                      <ul className="space-y-1 text-gray-800">{adv.preventions.slice(0, 3).map((m, i) => <li key={i}>• {m}</li>)}</ul>
                    </>
                  )}
                  {(adviceBusy || advice.translating) && <p className="text-sm text-gray-500 mt-3 flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2 border-agri-600 border-t-transparent animate-spin" />{advice.translating ? t.translating : t.loadingMore}</p>}
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <button onClick={() => setStep(3)} className={`${big} bg-red-700 hover:bg-red-800 text-white`}><Megaphone size={24} weight="duotone" /> {t.yesWarnFarmers}</button>
                  <button onClick={askAbout} className={`${big} bg-paper border-2 border-agri-700 text-agri-800`}><ChatCircleDots size={24} weight="duotone" /> {t.askAboutPest}</button>
                  <button onClick={restart} className={`${big} sm:col-span-2 bg-paper border-2 border-gray-300 text-gray-700`}><RotateCcw /> {t.noRetake}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {step === 3 && det && (
        <div className="bg-paper rounded-3xl border border-gray-100 p-5 space-y-5">
          <div className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3">
            {preview && <img src={preview} alt="" className="w-16 h-16 rounded-xl object-cover" />}
            <div className="flex-1 min-w-0"><p className="text-sm text-gray-500">{t.pestType}</p><p className="text-xl font-bold text-gray-900 truncate">{name}</p></div>
          </div>
          <div>
            <p className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-2"><Ico icon={Pin} size={22} tone="forest" />{t.whereSeen}</p>
            <DistrictPicker lang={lang} value={districtId} onChange={setDistrictId} />
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900 mb-2">{t.howBad}</p>
            <ChoiceGrid options={sevChoices} value={severity} onChange={setSeverity} cols="grid-cols-1 sm:grid-cols-3" />
          </div>
          {zones && (
            <p className="flex items-start gap-2 bg-gray-50 rounded-2xl p-3 text-gray-800">
              <Ico icon={DeviceMobile} size={24} tone="forest" className="mt-0.5" />
              <span>{fmt(t.warnReach, { n: reach })} <span className="text-gray-500">({[...zones.red, ...zones.orange, ...zones.yellow].slice(0, 6).map((id) => districtName(t, id)).join(', ')}{reach > 6 ? '…' : ''})</span></span>
            </p>
          )}
          {!sure && <p className="flex gap-2 bg-gold-100 border border-gold-300 rounded-2xl p-3 text-gold-700"><Ico icon={IdentificationBadge} size={22} />{t.officerWillCheck}</p>}
          {error && <p className="text-red-600 font-medium">{error}</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            <button onClick={send} disabled={busy || !districtId} className={`${big} bg-red-700 hover:bg-red-800 text-white`}>
              {busy ? <Loader2 className="animate-spin" /> : <Send />} {t.sendWarning}
            </button>
            <button onClick={() => setStep(2)} className={`${big} bg-paper border-2 border-gray-300 text-gray-700`}>{t.back}</button>
          </div>
        </div>
      )}

      {step === 4 && result && (
        <div className="bg-paper rounded-3xl border border-gray-100 p-6 text-center space-y-4">
          {result.outcome === 'sent' && (() => {
            const s = result.stats!;
            const farmers = s.red + s.orange + s.yellow;
            const msg = fmt(t.outcomeSent, { farmers, districts: result.affectedDistricts?.length || 0 });
            return (
              <>
                <Celebrate icon={SealCheck} tone="forest" />
                <h2 className="text-2xl md:text-3xl font-semibold text-ink">{msg}</h2>
                <p className="inline-flex items-center gap-2 text-gray-700"><Ico icon={DeviceMobile} size={20} tone="forest" />{fmt(t.outcomeSms, { n: s.smsSent + s.smsSimulated })}</p>
                <SpeakButton text={msg} lang={lang} label />
              </>
            );
          })()}
          {result.outcome === 'pending' && (
            <>
              <Celebrate icon={Hourglass} tone="gold" />
              <h2 className="text-2xl md:text-3xl font-semibold text-ink">{t.outcomePendingTitle}</h2>
              <p className="text-gray-700 text-lg">{t.outcomePending}</p>
              <SpeakButton text={`${t.outcomePendingTitle}. ${t.outcomePending}`} lang={lang} label />
            </>
          )}
          {result.outcome === 'already_active' && (
            <>
              <Celebrate icon={Info} tone="sky" />
              <h2 className="text-2xl md:text-3xl font-semibold text-ink">{t.outcomeAlready}</h2>
              <SpeakButton text={t.outcomeAlready} lang={lang} label />
            </>
          )}
          <div className="grid sm:grid-cols-3 gap-3 pt-2">
            <button onClick={() => onNavigate('network')} className={`${big} bg-agri-700 text-white`}><MapIcon /> {t.seeMap}</button>
            <button onClick={restart} className={`${big} bg-paper border-2 border-gray-300 text-gray-700`}><Camera /> {t.checkAnother}</button>
            <button onClick={() => onNavigate('home')} className={`${big} bg-paper border-2 border-gray-300 text-gray-700`}><HomeIcon /> {t.home}</button>
          </div>
        </div>
      )}
    </div>
  );
};

/** Result badge: springs in once to confirm the action finished. */
const Celebrate: React.FC<{ icon: any; tone: 'forest' | 'gold' | 'sky' }> = ({ icon, tone }) => (
  <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className="flex justify-center">
    <IconChip icon={icon} tone={tone} size="xl" />
  </motion.div>
);

export default PestCheck;
