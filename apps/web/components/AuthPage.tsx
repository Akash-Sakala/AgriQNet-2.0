import React, { useState } from 'react';
import { Phone, Lock, User, Loader2, ShieldCheck, AlertTriangle, MonitorPlay, BadgeCheck, Globe } from 'lucide-react';
import { Language, Farmer } from '../types';
import { getTranslation, LANGUAGES } from '../utils/translations';
import { TwilioService } from '../services/twilioService';
import { DBService } from '../services/dbService';
import DistrictPicker from './DistrictPicker';
import { ChoiceGrid, SpeakButton, VoiceField } from './ui/Kit';
import { cropChoices } from '../utils/farmOptions';
import { motion } from 'motion/react';
import { Plant, UserCircle as FarmerIcon, PaperPlaneTilt, SealCheck } from './ui/Icons';

interface AuthPageProps {
  lang: Language;
  onLogin: (user: Farmer) => void;
  onLangChange?: (lang: Language) => void;
}

const CODES = ['+91', '+1', '+44', '+61', '+971'];

/** Demo accounts created by the seed (see README). */
const DEMO = { farmer: { phone: '+910000000000', password: 'demo1234' }, officer: { phone: '+910000000001', password: 'officer123' } };

const AuthPage: React.FC<AuthPageProps> = ({ lang, onLogin, onLangChange }) => {
  const t = getTranslation(lang);
  const [view, setView] = useState<'login' | 'signup' | 'otp'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('+91');
  const [form, setForm] = useState({ name: '', phone: '', password: '' });
  const [districtId, setDistrictId] = useState('');
  const [crops, setCrops] = useState<string[]>([]);
  const [otp, setOtp] = useState('');
  const [fallbackOtp, setFallbackOtp] = useState<string | null>(null);
  const [showLangs, setShowLangs] = useState(false);

  const fullPhone = `${code}${form.phone.replace(/\D/g, '')}`;
  const set = (k: keyof typeof form) => (v: string) => { setForm({ ...form, [k]: v }); setError(''); };

  const login = async (phone: string, password: string) => {
    setLoading(true);
    setError('');
    try {
      const user = await DBService.verifyLogin(phone, password);
      if (user) {
        // The language picked on this screen is the farmer's language: save it on the account
        // too, so SMS alerts arrive in it.
        if (user.lang !== lang) {
          DBService.updateProfile({ lang }).then(onLogin).catch(() => onLogin(user));
        } else onLogin(user);
      } else setError(t.errInvalidLogin);
    } catch {
      setError(t.errServer);
    }
    setLoading(false);
  };

  const startSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError(t.errName);
    if (form.phone.replace(/\D/g, '').length < 10) return setError(t.errPhone);
    if (form.password.length < 4) return setError(t.errPassword);
    if (!districtId) return setError(t.errSelectDistrict);
    setLoading(true);
    setError('');
    try {
      if (await DBService.findUserByPhone(fullPhone)) { setError(t.userExists); setLoading(false); return; }
    } catch { setError(t.errServer); setLoading(false); return; }
    const r = await TwilioService.sendOTP(fullPhone, undefined, 'signup', lang);
    if (r.success) {
      setView('otp');
      setFallbackOtp(r.isMock && r.otp ? r.otp : null);
    } else setError(r.error || t.errServer);
    setLoading(false);
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (!(await TwilioService.verifyOTP(fullPhone, otp, 'signup'))) { setError(t.invalidOtp); setLoading(false); return; }
    try {
      const user = await DBService.createUser({ id: '', name: form.name.trim(), location: '', phone: fullPhone, password: form.password, lang, districtId, crops } as any);
      onLogin(user);
    } catch (err: any) {
      setError(err.message || t.errServer);
      setLoading(false);
    }
  };

  const big = 'w-full py-4 rounded-2xl text-lg font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60';
  const PhoneRow = (
    <div className="flex gap-2">
      <select value={code} onChange={(e) => setCode(e.target.value)} aria-label={t.countryCode} className="bg-gray-50 border border-gray-200 rounded-2xl px-2 text-lg font-semibold text-gray-800">
        {CODES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <div className="flex-1 min-w-0 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-4 focus-within:ring-2 focus-within:ring-agri-400">
        <Phone size={20} className="text-gray-400" />
        <input type="tel" inputMode="numeric" autoComplete="tel-national" value={form.phone} onChange={(e) => set('phone')(e.target.value)} placeholder="98765 43210"
          className="flex-1 min-w-0 bg-transparent outline-none text-lg py-3.5 text-gray-900" required />
      </div>
    </div>
  );
  const PasswordRow = (
    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-4 focus-within:ring-2 focus-within:ring-agri-400">
      <Lock size={20} className="text-gray-400" />
      <input type="password" autoComplete={view === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={(e) => set('password')(e.target.value)} placeholder="••••"
        className="flex-1 min-w-0 bg-transparent outline-none text-lg py-3.5 text-gray-900" required />
    </div>
  );
  const Err = error ? <div role="alert" className="p-3 bg-red-50 text-red-700 rounded-xl border border-red-100 flex gap-2 items-start"><AlertTriangle size={18} className="shrink-0 mt-0.5" />{error}</div> : null;

  return (
    <div className="min-h-screen bg-cream flex items-start md:items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-xl bg-paper rounded-[28px] shadow-lift border border-gray-200 overflow-hidden">
        {/* Header with language */}
        <div className="relative bg-agri-700 text-white p-5 flex items-center gap-3 overflow-hidden">
          <div className="furrows absolute inset-0" aria-hidden />
          <span className="relative w-12 h-12 rounded-[14px] bg-white/10 ring-1 ring-white/20 flex items-center justify-center"><Plant size={30} weight="duotone" color="#E2C766" /></span>
          <div className="relative flex-1 min-w-0">
            <p className="font-display text-2xl font-semibold">AgriQNet</p>
            <p className="text-agri-100 text-sm truncate">{t.authDesc}</p>
          </div>
          {onLangChange && (
            <button onClick={() => setShowLangs(!showLangs)} className="relative flex items-center gap-1.5 bg-white/15 hover:bg-white/25 px-3 py-2 rounded-xl font-semibold">
              <Globe size={18} /> {LANGUAGES[lang].split(' (')[0]}
            </button>
          )}
        </div>
        {showLangs && onLangChange && (
          <div className="grid grid-cols-4 gap-2 p-3 bg-agri-50 border-b border-agri-100">
            {(Object.keys(LANGUAGES) as Language[]).map((c) => (
              <button key={c} onClick={() => { onLangChange(c); setShowLangs(false); }}
                className={`py-2.5 rounded-xl font-bold ${lang === c ? 'bg-agri-700 text-white' : 'bg-paper text-gray-800 border border-gray-200'}`}>{LANGUAGES[c].split(' (')[0]}</button>
            ))}
          </div>
        )}

        <div className="p-5 md:p-8">
          {view === 'login' && (
            <form onSubmit={(e) => { e.preventDefault(); login(fullPhone, form.password); }} className="space-y-4">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-ink">{t.login}</h1>
                <SpeakButton text={t.loginHelp} lang={lang} />
              </div>
              {Err}
              <label className="block"><span className="block font-semibold text-gray-700 mb-1.5">{t.phone}</span>{PhoneRow}</label>
              <label className="block"><span className="block font-semibold text-gray-700 mb-1.5">{t.password}</span>{PasswordRow}</label>
              <button type="submit" disabled={loading} className={`${big} bg-agri-700 text-white hover:bg-agri-800 shadow-soft`}>
                {loading ? <Loader2 className="animate-spin" /> : t.login}
              </button>
              <button type="button" onClick={() => { setView('signup'); setError(''); }} className={`${big} bg-paper border-2 border-agri-600 text-agri-700 hover:bg-agri-50`}>
                <FarmerIcon size={24} weight="duotone" /> {t.newFarmer}
              </button>
              <div className="pt-4 border-t border-gray-100 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => login(DEMO.farmer.phone, DEMO.farmer.password)} className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-full">
                  <MonitorPlay size={18} /> {t.tryDemo}
                </button>
                <button type="button" onClick={() => login(DEMO.officer.phone, DEMO.officer.password)} className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-full">
                  <BadgeCheck size={18} /> {t.tryOfficer}
                </button>
              </div>
            </form>
          )}

          {view === 'signup' && (
            <form onSubmit={startSignup} className="space-y-5">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-ink">{t.signup}</h1>
                <SpeakButton text={t.signupHelp} lang={lang} />
              </div>
              {Err}
              <label className="block"><span className="block font-semibold text-gray-700 mb-1.5">{t.fullName}</span>
                <VoiceField lang={lang} value={form.name} onChange={set('name')} icon={<User size={20} />} />
              </label>
              <label className="block"><span className="block font-semibold text-gray-700 mb-1.5">{t.phone}</span>{PhoneRow}</label>
              <label className="block"><span className="block font-semibold text-gray-700 mb-1.5">{t.password}</span>{PasswordRow}</label>
              <div>
                <span className="block font-semibold text-gray-700 mb-1">{t.yourDistrict} <span className="text-red-600">*</span></span>
                <p className="text-sm text-gray-500 mb-2">{t.districtWhy}</p>
                <DistrictPicker lang={lang} value={districtId} onChange={(id) => { setDistrictId(id); setError(''); }} error={!!error && !districtId} />
              </div>
              <div>
                <span className="block font-semibold text-gray-700 mb-1">{t.yourCrops}</span>
                <p className="text-sm text-gray-500 mb-2">{t.yourCropsHint}</p>
                <ChoiceGrid options={cropChoices(t)} value={crops} onChange={setCrops} multi cols="grid-cols-3 sm:grid-cols-4" size="sm" />
              </div>
              <button type="submit" disabled={loading} className={`${big} bg-agri-700 text-white hover:bg-agri-800 shadow-soft`}>
                {loading ? <Loader2 className="animate-spin" /> : <><PaperPlaneTilt size={22} weight="duotone" /> {t.sendOtp}</>}
              </button>
              <button type="button" onClick={() => { setView('login'); setError(''); }} className="w-full text-agri-700 font-semibold py-2">{t.haveAccount}</button>
            </form>
          )}

          {view === 'otp' && (
            <form onSubmit={verify} className="space-y-5 text-center">
              <div className="w-16 h-16 bg-agri-100 text-agri-700 rounded-full flex items-center justify-center mx-auto"><ShieldCheck size={32} /></div>
              <h1 className="text-2xl font-semibold text-ink">{t.enterOtp}</h1>
              <p className="text-gray-600">{t.otpSent} <span className="font-bold text-gray-900">{fullPhone}</span></p>
              {fallbackOtp && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-2xl text-left">
                  <p className="text-sm text-yellow-800 mb-2">{t.otpFallbackDesc}</p>
                  <p className="font-mono font-bold text-2xl tracking-[0.3em] text-yellow-900 select-all">{fallbackOtp}</p>
                </div>
              )}
              {Err}
              <input type="text" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} maxLength={6} placeholder="••••••" required
                className="w-full text-center text-3xl font-bold tracking-[0.5em] p-4 bg-gray-50 border-2 border-gray-200 rounded-2xl outline-none focus:border-agri-500" />
              <button type="submit" disabled={loading} className={`${big} bg-agri-700 text-white hover:bg-agri-800 shadow-soft`}>
                {loading ? <Loader2 className="animate-spin" /> : <><SealCheck size={22} weight="duotone" /> {t.verifyRegister}</>}
              </button>
              <button type="button" onClick={() => setView('signup')} className="text-gray-500 font-semibold">{t.wrongNumber}</button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default AuthPage;
