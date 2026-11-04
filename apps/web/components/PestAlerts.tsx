import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, CheckCircle, Phone, ChevronRight } from 'lucide-react';
import { Farmer, Language, NavView } from '../types';
import { getTranslation, fmt, districtName, LOCALES } from '../utils/translations';
import { TwilioService } from '../services/twilioService';
import { DBService } from '../services/dbService';
import { PlatformService, zonesFor, WeatherAlert } from '../services/platformService';
import { pestLabel } from '../utils/pests';
import DistrictPicker from './DistrictPicker';
import { ScreenTitle, SpeakButton } from './ui/Kit';
import { motion } from 'motion/react';
import { IconChip, Ico, Bug, CloudLightning, CameraIcon, MapTrifold, CheckCircle as CheckCircleD, DeviceMobile } from './ui/Icons';
import { SeverityMeter } from './ui/Severity';

type Sev = 'RED' | 'ORANGE' | 'YELLOW';
const DEPTH: Record<Sev, number> = { RED: 2, ORANGE: 1, YELLOW: 0 };
const SEV_ICON: Record<Sev, React.ReactNode> = { RED: <SeverityMeter level="RED" />, ORANGE: <SeverityMeter level="ORANGE" />, YELLOW: <SeverityMeter level="YELLOW" /> };
const SEV_ICON_SM: Record<Sev, React.ReactNode> = { RED: <SeverityMeter level="RED" size="sm" />, ORANGE: <SeverityMeter level="ORANGE" size="sm" />, YELLOW: <SeverityMeter level="YELLOW" size="sm" /> };
const SEV_BOX: Record<Sev, string> = { RED: 'bg-paper border-red-200 border-l-[6px] border-l-red-600', ORANGE: 'bg-paper border-orange-200 border-l-[6px] border-l-orange-500', YELLOW: 'bg-paper border-yellow-200 border-l-[6px] border-l-gold-500' };

/**
 * Alerts for the farmer's own district: pest warnings that reach it, weather warnings,
 * a big button to report a pest (photo flow), and SMS sign-up for a basic phone.
 */
const PestAlerts: React.FC<{ lang: Language; user: Farmer; onBack: () => void; onNavigate: (v: NavView) => void }> = ({ lang, user, onBack, onNavigate }) => {
  const t = getTranslation(lang);
  const dateFmt = new Intl.DateTimeFormat(LOCALES[lang], { day: 'numeric', month: 'short' });
  const sevWord: Record<Sev, string> = { RED: t.sevBadTitle, ORANGE: t.sevMediumTitle, YELLOW: t.sevFewTitle };
  const [alerts, setAlerts] = useState<any[] | null>(null);
  const [edges, setEdges] = useState<any[]>([]);
  const [wx, setWx] = useState<WeatherAlert[]>([]);
  const [err, setErr] = useState(false);
  const place = districtName(t, user.districtId || '', user.location);

  useEffect(() => {
    Promise.all([PlatformService.getAlerts(), PlatformService.getEdges()])
      .then(([a, e]) => { setAlerts(a); setEdges(e); })
      .catch(() => setErr(true));
  }, []);
  useEffect(() => {
    if (user.districtId) PlatformService.weatherAlerts({ districtId: user.districtId, lang }).then((r) => setWx(r.alerts)).catch(() => {});
  }, [user.districtId, lang]);

  const near = useMemo(() => (alerts || [])
    .filter((a) => a.status === 'ACTIVE')
    .map((a) => {
      const z = zonesFor(a.reportedDistrictId, edges, DEPTH[a.severity as Sev]);
      const hops = z.red.includes(user.districtId!) ? 0 : z.orange.includes(user.districtId!) ? 1 : z.yellow.includes(user.districtId!) ? 2 : -1;
      return { ...a, hops };
    })
    .filter((a) => a.hops >= 0), [alerts, edges, user.districtId]);

  const others = (alerts || []).filter((a) => a.status === 'ACTIVE' && !near.some((n) => n.id === a.id)).slice(0, 5);

  const alertLine = (a: any) => `${pestLabel(lang, a.pestType)}. ${sevWord[a.severity as Sev]}. ${a.hops === 0 ? t.inYourDistrict : fmt(t.reportedIn2, { district: districtName(t, a.reportedDistrictId) })}`;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <ScreenTitle lang={lang} icon="alerts" title={t.alertsTitle} desc={fmt(t.alertsDesc, { district: place })} onBack={onBack} />

      <div className="grid grid-cols-2 gap-3">
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => onNavigate('pest_check')} className="flex flex-col items-center gap-2 p-5 rounded-3xl bg-agri-700 hover:bg-agri-800 text-white font-semibold text-lg shadow-lift">
          <CameraIcon size={40} weight="duotone" className="text-gold-300" aria-hidden />{t.reportPest}
        </motion.button>
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => onNavigate('network')} className="flex flex-col items-center gap-2 p-5 rounded-3xl bg-paper border border-gray-200 shadow-soft text-agri-800 font-semibold text-lg">
          <MapTrifold size={40} weight="duotone" aria-hidden />{t.seeMap}
        </motion.button>
      </div>

      {/* Pest warnings reaching my district */}
      <section className="bg-paper rounded-3xl border border-gray-200 shadow-soft p-5">
        <h2 className="text-xl font-semibold text-ink mb-4 flex items-center gap-3"><IconChip icon={Bug} tone="rust" size="sm" />{fmt(t.pestNearTitle, { district: place })}</h2>
        {err && <p className="text-red-600">{t.errServer}</p>}
        {!alerts && !err && <Loader2 className="animate-spin text-gray-400" />}
        {alerts && near.length === 0 && <p className="flex items-center gap-2 text-lg text-agri-800 bg-agri-50 border border-agri-100 rounded-2xl p-4"><Ico icon={CheckCircleD} size={24} />{t.noPestNear}</p>}
        <ul className="space-y-2">
          {near.map((a) => (
            <li key={a.id} className={`flex items-center gap-3 border-2 rounded-2xl p-3 ${SEV_BOX[a.severity as Sev]}`}>
              <span className="w-10 flex justify-center">{SEV_ICON[a.severity as Sev]}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-lg leading-tight">{pestLabel(lang, a.pestType)}</p>
                <p className="text-gray-700">{sevWord[a.severity as Sev]} · {a.hops === 0 ? t.inYourDistrict : fmt(t.reportedIn2, { district: districtName(t, a.reportedDistrictId) })} · {dateFmt.format(new Date(a.reportedAt))}</p>
              </div>
              <SpeakButton text={alertLine(a)} lang={lang} />
            </li>
          ))}
        </ul>
        {others.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-agri-700 font-semibold py-2">{fmt(t.otherAlerts, { n: others.length })}</summary>
            <ul className="space-y-1 mt-1">
              {others.map((a) => <li key={a.id} className="flex items-center gap-2 text-gray-700">{SEV_ICON_SM[a.severity as Sev]} {pestLabel(lang, a.pestType)} — {districtName(t, a.reportedDistrictId)}</li>)}
            </ul>
          </details>
        )}
      </section>

      {/* Weather warnings */}
      <section className="bg-paper rounded-3xl border border-gray-200 shadow-soft p-5">
        <h2 className="text-xl font-semibold text-ink mb-4 flex items-center gap-3"><IconChip icon={CloudLightning} tone="sky" size="sm" />{t.weatherAlertsTitle}</h2>
        {wx.length === 0 ? <p className="flex items-center gap-2 text-lg text-agri-800 bg-agri-50 border border-agri-100 rounded-2xl p-4"><Ico icon={CheckCircleD} size={24} />{t.noWeatherRisk}</p> : (
          <ul className="space-y-2">
            {wx.slice(0, 4).map((a, i) => (
              <li key={i} className={`flex items-start gap-3 border-2 rounded-2xl p-3 ${SEV_BOX[a.level]}`}>
                <span className="w-8 flex justify-center mt-1">{SEV_ICON_SM[a.level]}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900">{a.title} <span className="font-normal text-gray-600">· {dateFmt.format(new Date(a.date))}</span></p>
                  <p className="text-gray-700">{a.message} {a.advice}</p>
                </div>
                <SpeakButton text={`${a.title}. ${a.message} ${a.advice}`} lang={lang} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <SmsSignup lang={lang} user={user} />
    </div>
  );
};

/** SMS alerts for a basic phone (e.g. a family member's number) — verified with an OTP. */
const SmsSignup: React.FC<{ lang: Language; user: Farmer }> = ({ lang, user }) => {
  const t = getTranslation(lang);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'input' | 'otp' | 'done'>('input');
  const [phone, setPhone] = useState('');
  const [districtId, setDistrictId] = useState(user.districtId || '');
  const [otp, setOtp] = useState('');
  const [fallback, setFallback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const full = phone.startsWith('+') ? phone.replace(/[^+\d]/g, '') : `+91${phone.replace(/\D/g, '')}`;

  const start = async () => {
    setErr('');
    if (phone.replace(/\D/g, '').length < 10) return setErr(t.errValidMobile);
    if (!districtId) return setErr(t.errSelectDistrict);
    setBusy(true);
    const r = await TwilioService.sendOTP(full, undefined, 'subscribe', lang);
    setBusy(false);
    if (!r.success) return setErr(t.errSubscribe);
    setFallback(r.isMock && r.otp ? r.otp : null);
    setStep('otp');
  };
  const verify = async () => {
    setBusy(true);
    setErr('');
    if (!(await TwilioService.verifyOTP(full, otp, 'subscribe'))) { setBusy(false); return setErr(t.errOtp); }
    try { await DBService.addPestSubscriber(districtId, full, user.name, lang); setStep('done'); } catch { setErr(t.errSubscribe); }
    setBusy(false);
  };

  return (
    <section className="bg-paper rounded-3xl border border-gray-200 shadow-soft p-5">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 text-left">
        <IconChip icon={DeviceMobile} tone="forest" />
        <span className="flex-1">
          <span className="block text-xl font-bold text-gray-900">{t.smsBasicTitle}</span>
          <span className="block text-gray-600">{t.smsBasicDesc}</span>
        </span>
        <ChevronRight className={`text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          {step === 'done' ? (
            <p className="flex items-center gap-2 text-green-800 bg-green-50 rounded-2xl p-4 text-lg"><CheckCircle /> {fmt(t.subscriptionDesc, { district: districtName(t, districtId), phone: full })}</p>
          ) : step === 'input' ? (
            <>
              <div className="flex items-center gap-2 bg-paper border border-gray-200 rounded-2xl px-4">
                <Phone size={20} className="text-gray-400" />
                <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t.mobileNumber} className="flex-1 bg-transparent outline-none text-lg py-3.5" />
              </div>
              <DistrictPicker lang={lang} value={districtId} onChange={setDistrictId} />
              {err && <p className="text-red-600">{err}</p>}
              <button onClick={start} disabled={busy} className="w-full py-4 rounded-2xl bg-agri-700 text-white text-lg font-bold flex items-center justify-center gap-2">{busy ? <Loader2 className="animate-spin" /> : t.sendOtp}</button>
            </>
          ) : (
            <>
              <p className="text-gray-700">{fmt(t.codeSentTo, { phone: full })}</p>
              {fallback && <p className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-900">{t.otpFallbackDesc} <b className="font-mono tracking-widest">{fallback}</b></p>}
              <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={6} placeholder="••••••" className="w-full text-center text-2xl font-bold tracking-[0.5em] p-3 bg-paper border-2 border-gray-200 rounded-2xl" />
              {err && <p className="text-red-600">{err}</p>}
              <button onClick={verify} disabled={busy} className="w-full py-4 rounded-2xl bg-agri-700 text-white text-lg font-bold flex items-center justify-center gap-2">{busy ? <Loader2 className="animate-spin" /> : t.verifySubscribe}</button>
            </>
          )}
        </div>
      )}
    </section>
  );
};

export default PestAlerts;
