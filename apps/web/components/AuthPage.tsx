// Sign-in and onboarding: phone number → 6-digit code → (new farmers) district → crops.
// No passwords. One question per screen, read-aloud on every step, steps slide in the direction
// of travel. Demo buttons stay as quiet secondary actions.
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Phone, ArrowLeft, Globe, Check, CircleNotch, PaperPlaneTilt, SealCheck, MonitorPlay, IdentificationBadge, Plant, MapPin, UserCircle,
} from '@phosphor-icons/react';
import { Language, Farmer } from '../types';
import { getTranslation, LANGUAGES, fmt } from '../utils/translations';
import { TwilioService } from '../services/twilioService';
import { DBService } from '../services/dbService';
import DistrictPicker from './DistrictPicker';
import { ChoiceGrid, SpeakButton, MicButton, VoiceField } from './ui/Kit';
import { InlineError } from './ui/WorkingOn';
import { cropChoices } from '../utils/farmOptions';

interface AuthPageProps { lang: Language; onLogin: (user: Farmer) => void; onLangChange?: (lang: Language) => void }

/** Demo accounts created by the seed (see README). */
const DEMO = { farmer: { phone: '+910000000000', password: 'demo1234' }, officer: { phone: '+910000000001', password: 'officer123' } };
type Step = 'phone' | 'code' | 'district' | 'crops';
const ORDER: Step[] = ['phone', 'code', 'district', 'crops'];
const RESEND_S = 30;

const fmtPhone = (digits: string) => (digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5, 10)}` : digits);

const AuthPage: React.FC<AuthPageProps> = ({ lang, onLogin, onLangChange }) => {
  const t = getTranslation(lang) as any;
  const [step, setStep] = useState<Step>('phone');
  const [dir, setDir] = useState(1);
  const [isNew, setIsNew] = useState(false);
  const [digits, setDigits] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [districtId, setDistrictId] = useState('');
  const [crops, setCrops] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [showLangs, setShowLangs] = useState(false);

  const phone = `+91${digits}`;
  const total = isNew ? 4 : 2;
  const stepNo = ORDER.indexOf(step) + 1;
  const go = (s: Step) => { setDir(ORDER.indexOf(s) >= ORDER.indexOf(step) ? 1 : -1); setError(''); setStep(s); };

  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [resendAt]);
  const waitS = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const finishLogin = (user: Farmer) => {
    // The language picked on this screen is the farmer's language: save it on the account (SMS alerts use it)
    if (user.lang !== lang) DBService.updateProfile({ lang }).then(onLogin).catch(() => onLogin(user));
    else onLogin(user);
  };

  const sendCode = async () => {
    if (digits.length !== 10) { setError(t.errPhone); setShake((n) => n + 1); return; }
    setBusy(true); setError('');
    try {
      const exists = !!(await DBService.findUserByPhone(phone));
      setIsNew(!exists);
      const r = await TwilioService.sendOTP(phone, undefined, exists ? 'login' : 'signup', lang);
      if (!r.success) { setError(r.error || t.errServer); return; }
      setDevCode(r.isMock && r.otp ? r.otp : null);
      setCode('');
      setResendAt(Date.now() + RESEND_S * 1000); setNow(Date.now());
      if (step !== 'code') go('code');
    } catch { setError(t.errServer); } finally { setBusy(false); }
  };

  const verify = async (value = code) => {
    if (value.length !== 6 || busy) return;
    setBusy(true); setError('');
    try {
      if (!isNew) return finishLogin(await DBService.otpLogin(phone, value));
      if (await TwilioService.verifyOTP(phone, value, 'signup')) go('district');
      else { setError(t.codeWrong); setShake((n) => n + 1); setCode(''); }
    } catch (e: any) {
      setError(/expired|not requested/i.test(e?.message || '') ? t.codeExpired : /wrong|invalid/i.test(e?.message || '') ? t.codeWrong : e?.message || t.errServer);
      setShake((n) => n + 1); setCode('');
    } finally { setBusy(false); }
  };

  const register = async () => {
    setBusy(true); setError('');
    try {
      const user = await DBService.createUser({ id: '', name: name.trim(), location: '', phone, lang, districtId, crops } as any);
      onLogin(user);
    } catch (e: any) { setError(e?.message || t.errServer); } finally { setBusy(false); }
  };

  const demo = async (who: 'farmer' | 'officer') => {
    setBusy(true); setError('');
    try {
      const u = await DBService.verifyLogin(DEMO[who].phone, DEMO[who].password);
      if (u) finishLogin(u); else setError(t.errInvalidLogin);
    } catch { setError(t.errServer); } finally { setBusy(false); }
  };

  const question: Record<Step, string> = { phone: t.phoneQ, code: t.codeQ, district: t.districtQ, crops: t.cropsQ };
  const help: Record<Step, string> = { phone: t.phoneHelp, code: fmt(t.codeSentTo, { phone: `+91 ${fmtPhone(digits).replace(' ', ' ')}` }), district: t.districtWhy, crops: t.yourCropsHint };
  const primary = 'w-full min-h-[56px] rounded-2xl bg-agri-700 hover:bg-agri-800 text-white text-lg font-bold flex items-center justify-center gap-2 shadow-soft disabled:opacity-50 active:scale-[0.98] transition-transform';

  return (
    <div className="min-h-dvh bg-cream flex items-start sm:items-center justify-center p-4">
      <div className="w-full max-w-xl bg-paper rounded-[28px] shadow-lift border border-gray-200 overflow-hidden">
        {/* Brand + language */}
        <div className="relative bg-agri-700 text-white px-5 py-4 flex items-center gap-3 overflow-hidden">
          <div className="furrows absolute inset-0" aria-hidden />
          <span className="relative w-12 h-12 rounded-[14px] bg-white/10 ring-1 ring-white/20 flex items-center justify-center shrink-0"><Plant size={30} weight="duotone" color="#E2C766" aria-hidden /></span>
          <div className="relative flex-1 min-w-0">
            <p className="font-display text-2xl font-semibold leading-tight">AgriQNet</p>
            <p className="text-agri-100 leading-snug">{t.authTagline}</p>
          </div>
          {onLangChange && (
            <button type="button" onClick={() => setShowLangs(!showLangs)} aria-expanded={showLangs}
              className="relative min-h-[48px] flex items-center gap-1.5 bg-white/15 hover:bg-white/25 px-3 rounded-xl font-semibold shrink-0">
              <Globe size={20} aria-hidden /> {LANGUAGES[lang].split(' (')[0]}
            </button>
          )}
        </div>
        {showLangs && onLangChange && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-agri-50 border-b border-agri-100">
            {(Object.keys(LANGUAGES) as Language[]).map((c) => (
              <button key={c} type="button" onClick={() => { onLangChange(c); setShowLangs(false); }}
                className={`min-h-[48px] rounded-xl font-bold flex items-center justify-center gap-1.5 ${lang === c ? 'bg-agri-700 text-white' : 'bg-paper text-gray-800 border border-gray-200'}`}>
                {lang === c && <Check size={16} weight="bold" aria-hidden />}{LANGUAGES[c].split(' (')[0]}
              </button>
            ))}
          </div>
        )}

        <div className="p-5 md:p-8">
          {/* Progress: back + "Step n of N" + dots */}
          {step !== 'phone' && <div className="flex items-center gap-3 mb-4 min-h-[48px]">
            {(
              <button type="button" onClick={() => go(ORDER[ORDER.indexOf(step) - 1])} aria-label={t.back}
                className="w-12 h-12 shrink-0 rounded-2xl bg-paper border border-gray-300 flex items-center justify-center text-gray-700"><ArrowLeft size={22} aria-hidden /></button>
            )}
            <p className="text-gray-600 font-semibold">{fmt(t.stepOf, { n: stepNo, total })}</p>
            <span className="flex gap-1.5 ml-auto" aria-hidden>
              {Array.from({ length: total }).map((_, i) => (
                <span key={i} className={`h-2 rounded-full transition-all ${i < stepNo ? 'w-6 bg-agri-700' : 'w-2 bg-gray-300'}`} />
              ))}
            </span>
          </div>}

          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div key={step} custom={dir}
              variants={{ enter: (d: number) => ({ opacity: 0, x: d * 32 }), center: { opacity: 1, x: 0 }, exit: (d: number) => ({ opacity: 0, x: d * -24 }) }}
              initial="enter" animate="center" exit="exit" transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}>
              <div className="flex items-start gap-3 mb-1">
                <h1 className="flex-1 text-2xl md:text-[1.75rem] font-semibold text-ink leading-tight">{question[step]}</h1>
                <SpeakButton text={`${question[step]} ${help[step]}`} lang={lang} />
              </div>
              <p className="text-gray-600 mb-5">{help[step]}</p>

              {error && <InlineError message={error} retryLabel={t.retry} className="mb-4" />}

              {step === 'phone' && (
                <form onSubmit={(e) => { e.preventDefault(); sendCode(); }} className="space-y-4">
                  <motion.div key={shake} animate={shake ? { x: [0, -6, 6, -4, 4, 0] } : {}} transition={{ duration: 0.32 }}
                    className="flex items-center gap-2 bg-paper border-2 border-gray-300 rounded-2xl pl-3 pr-1.5 py-1.5 focus-within:border-agri-600">
                    <span className="flex items-center gap-1 px-2 py-2 rounded-xl bg-gray-100 font-semibold text-gray-800 text-lg shrink-0"><Phone size={18} aria-hidden />+91</span>
                    <label htmlFor="auth-phone" className="sr-only">{t.phone}</label>
                    <input id="auth-phone" type="tel" inputMode="numeric" autoComplete="tel-national" value={fmtPhone(digits)} placeholder="98765 43210"
                      onChange={(e) => { setDigits(e.target.value.replace(/\D/g, '').slice(-10)); setError(''); }}
                      className="flex-1 min-w-0 w-0 bg-transparent outline-hidden text-xl tabular-nums py-2 text-ink" />
                    <MicButton lang={lang} onText={(txt) => { const d = txt.replace(/\D/g, ''); if (d) setDigits(d.slice(-10)); }} />
                  </motion.div>
                  <button type="submit" disabled={busy} className={primary}>
                    {busy ? <CircleNotch size={24} className="animate-spin" aria-hidden /> : <PaperPlaneTilt size={22} weight="duotone" aria-hidden />}{t.sendCode}
                  </button>
                </form>
              )}

              {step === 'code' && (
                <div className="space-y-4">
                  {devCode && (
                    <div className="p-4 bg-gold-100 border border-gold-300 rounded-2xl">
                      <p className="text-gray-800">{t.devCodeBanner}</p>
                      <p className="font-display font-semibold text-3xl tracking-[0.3em] text-ink select-all tabular-nums">{devCode}</p>
                    </div>
                  )}
                  <motion.div key={shake} animate={shake ? { x: [0, -6, 6, -4, 4, 0] } : {}} transition={{ duration: 0.32 }}>
                    <CodeBoxes value={code} onChange={(v) => { setCode(v); setError(''); if (v.length === 6) verify(v); }} label={t.codeQ} disabled={busy} />
                  </motion.div>
                  <button type="button" onClick={() => verify()} disabled={busy || code.length !== 6} className={primary}>
                    {busy ? <CircleNotch size={24} className="animate-spin" aria-hidden /> : <SealCheck size={22} weight="duotone" aria-hidden />}{t.verifyCode}
                  </button>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button type="button" onClick={() => go('phone')} className="min-h-[48px] px-1 font-semibold text-agri-800 underline underline-offset-4">{t.changeNumber}</button>
                    {waitS > 0
                      ? <span className="text-gray-600 tabular-nums">{fmt(t.resendIn, { s: waitS })}</span>
                      : <button type="button" onClick={sendCode} disabled={busy} className="min-h-[48px] px-4 rounded-2xl border-2 border-agri-700 text-agri-800 font-bold">{t.resendNow}</button>}
                  </div>
                </div>
              )}

              {step === 'district' && (
                <div className="space-y-5">
                  <DistrictPicker lang={lang} value={districtId} onChange={(id) => { setDistrictId(id); setError(''); }} />
                  <button type="button" onClick={() => (districtId ? go('crops') : setError(t.errSelectDistrict))} className={primary}>
                    <MapPin size={22} weight="duotone" aria-hidden />{t.next || 'Next'}
                  </button>
                </div>
              )}

              {step === 'crops' && (
                <div className="space-y-5">
                  <ChoiceGrid options={cropChoices(t)} value={crops} onChange={setCrops} multi cols="grid-cols-3 sm:grid-cols-4" size="sm" />
                  <label className="block">
                    <span className="block font-semibold text-gray-800 mb-1.5">{t.nameOptional}</span>
                    <VoiceField lang={lang} value={name} onChange={setName} icon={<UserCircle size={22} />} />
                  </label>
                  <button type="button" onClick={register} disabled={busy} className={primary}>
                    {busy ? <CircleNotch size={24} className="animate-spin" aria-hidden /> : <Check size={22} weight="bold" aria-hidden />}{t.finishSignup}
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {step === 'phone' && (
            <div className="mt-6 pt-5 border-t border-gray-200">
              <p className="text-center text-gray-600 mb-2">{t.orDemo}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => demo('farmer')} disabled={busy} className="min-h-[48px] flex items-center gap-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded-full">
                  <MonitorPlay size={20} aria-hidden /> {t.tryDemoShort}
                </button>
                <button type="button" onClick={() => demo('officer')} disabled={busy} className="min-h-[48px] flex items-center gap-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded-full">
                  <IdentificationBadge size={20} aria-hidden /> {t.tryOfficer}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Six separate digit boxes; paste fills all, Backspace moves back, Android SMS autofill works on the first box. */
const CodeBoxes: React.FC<{ value: string; onChange: (v: string) => void; label: string; disabled?: boolean }> = ({ value, onChange, label, disabled }) => {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { refs.current[Math.min(value.length, 5)]?.focus(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const set = (i: number, raw: string) => {
    const d = raw.replace(/\D/g, '');
    if (!d) return;
    const next = (value.slice(0, i) + d).slice(0, 6);
    onChange(next);
    refs.current[Math.min(next.length, 5)]?.focus();
  };
  return (
    <div role="group" aria-label={label} className="grid grid-cols-6 gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} value={value[i] || ''} disabled={disabled}
          inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} aria-label={`${label} ${i + 1}`} maxLength={i === 0 ? 6 : 1}
          onChange={(e) => set(i, e.target.value)}
          onPaste={(e) => { e.preventDefault(); const d = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6); if (d) { onChange(d); refs.current[Math.min(d.length, 5)]?.focus(); } }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') { e.preventDefault(); const cut = value.slice(0, Math.max(0, value[i] ? i : i - 1)); onChange(cut); refs.current[Math.max(0, cut.length)]?.focus(); }
          }}
          className="w-full aspect-[4/5] min-h-[56px] text-center text-3xl font-semibold tabular-nums text-ink bg-paper border-2 border-gray-300 rounded-2xl outline-hidden focus:border-agri-600 focus:ring-4 focus:ring-gold-300/40" />
      ))}
    </div>
  );
};

export default AuthPage;
