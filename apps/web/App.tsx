import React, { useState, useEffect } from 'react';
import { Globe, HelpCircle, LogOut, Menu, X, Loader2, Settings2, Check } from 'lucide-react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { SCREEN, IconChip, Ico, MapPin as PinIcon, IdentificationBadge, Plant, TONES } from './components/ui/Icons';
import { NavView, Language, Farmer } from './types';
import { getTranslation, LANGUAGES, loadLanguage, saveLanguage, hasSavedLanguage, districtName } from './utils/translations';
import Home from './components/Home';
import CropAdvisor from './components/CropAdvisor';
import FertilizerAdvisor from './components/FertilizerAdvisor';
import PestCheck from './components/PestCheck';
import ChatModule from './components/ChatModule';
import Library from './components/Library';
import SmartWeather from './components/SmartWeather';
import PestAlerts from './components/PestAlerts';
import AlertNetwork from './components/AlertNetwork';
import TourGuide, { TourStep } from './components/TourGuide';
import AuthPage from './components/AuthPage';
import LanguageGate from './components/LanguageGate';
import DistrictPicker from './components/DistrictPicker';
import { ChoiceGrid } from './components/ui/Kit';
import { cropChoices } from './utils/farmOptions';
import { DBService } from './services/dbService';
import { stopSpeaking } from './utils/speech';

/** Every screen, in menu order: picture + words (the bottom bar shows the first five). */
const NAV: { id: NavView; key: string }[] = [
  { id: 'home', key: 'home' },
  { id: 'weather', key: 'tileWeather' },
  { id: 'pest_check', key: 'tilePest' },
  { id: 'alerts', key: 'tileAlerts' },
  { id: 'chat', key: 'tileAsk' },
  { id: 'library', key: 'tileLibrary' },
  { id: 'crops', key: 'tileCrop' },
  { id: 'fertilizer', key: 'tileFert' },
  { id: 'network', key: 'networkTitle' },
];
/** Brand mark: a seedling on forest green with a gold leaf tone. */
export const BrandMark: React.FC<{ size?: number }> = ({ size = 44 }) => (
  <span className="rounded-[14px] bg-agri-700 flex items-center justify-center shrink-0 shadow-soft" style={{ width: size, height: size }}>
    <Plant size={size * 0.6} weight="duotone" color="#E2C766" />
  </span>
);
const BOTTOM: NavView[] = ['home', 'weather', 'pest_check', 'alerts', 'chat'];

const App: React.FC = () => {
  const [langChosen, setLangChosen] = useState(hasSavedLanguage);
  const [activeLang, setActiveLangState] = useState<Language>(loadLanguage);
  const [user, setUser] = useState<Farmer | null>(() => DBService.getCachedUser());
  const [view, setView] = useState<NavView>('home');
  const [history, setHistory] = useState<NavView[]>([]);
  const [langOpen, setLangOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [farmOpen, setFarmOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const t = getTranslation(activeLang);

  useEffect(() => { document.documentElement.lang = activeLang; }, [activeLang]);

  const setLang = (l: Language) => {
    saveLanguage(l);
    setActiveLangState(l);
    setLangChosen(true);
    setLangOpen(false);
    stopSpeaking();
    // Remember it on the account too (SMS alerts then arrive in this language)
    if (user?.token && user.lang !== l) DBService.updateProfile({ lang: l }).then(setUser).catch(() => {});
  };

  const go = (v: NavView) => {
    if (v === view) return;
    stopSpeaking();
    setHistory((h) => (v === 'home' ? [] : [...h, view]));
    setView(v);
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  };
  const back = () => {
    stopSpeaking();
    setHistory((h) => {
      const prev = h[h.length - 1] || 'home';
      setView(prev);
      return h.slice(0, -1);
    });
  };
  // Phone "back" gesture goes back one screen inside the app
  useEffect(() => {
    if (view === 'home') return;
    window.history.pushState({ agq: view }, '');
    const onPop = () => back();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const logout = () => { DBService.logout(); setUser(null); setView('home'); setHistory([]); setMenuOpen(false); };

  if (!langChosen) return <LanguageGate onPick={setLang} />;
  if (!user) return <AuthPage lang={activeLang} onLogin={(u) => { setUser(u); setView('home'); }} onLangChange={setLang} />;

  const place = districtName(t, user.districtId || '', user.location);
  // The App Tour: every feature, in the order a new farmer meets them on the home screen.
  const tourSteps: TourStep[] = [
    { targetId: 'farm-card', titleKey: 'tourFarmTitle', descKey: 'tourFarmDesc' },
    { targetId: 'lang-selector', titleKey: 'tourLangTitle', descKey: 'tourLangDesc' },
    { targetId: 'tile-weather', titleKey: 'tileWeather', descKey: 'tourWeatherDesc' },
    { targetId: 'tile-crops', titleKey: 'tileCrop', descKey: 'tourCropDesc' },
    { targetId: 'tile-fertilizer', titleKey: 'tileFert', descKey: 'tourFertDesc' },
    { targetId: 'tile-pest_check', titleKey: 'tilePest', descKey: 'tourPestDesc' },
    { targetId: 'tile-alerts', titleKey: 'tileAlerts', descKey: 'tourAlertsDesc' },
    { targetId: 'tile-chat', titleKey: 'tileAsk', descKey: 'tourAskDesc' },
    { targetId: 'library-shelf', titleKey: 'libTitle', descKey: 'tourLibraryDesc' },
    { targetId: 'advice-card', titleKey: 'tourAdviceTitle', descKey: 'tourAdviceDesc' },
    { targetId: 'main-nav-desktop|main-nav-phone', titleKey: 'tourNavTitle', descKey: user.role === 'officer' ? 'tourNavDescOfficer' : 'tourNavDesc' },
    { targetId: 'tour-button', titleKey: 'tourAgainTitle', descKey: 'tourAgainDesc' },
  ];

  const screen = () => {
    switch (view) {
      case 'weather': return <SmartWeather lang={activeLang} user={user} onBack={back} />;
      case 'crops': return <CropAdvisor lang={activeLang} user={user} onBack={back} />;
      case 'fertilizer': return <FertilizerAdvisor lang={activeLang} user={user} onBack={back} />;
      case 'pest_check': return <PestCheck lang={activeLang} user={user} onBack={back} onNavigate={go} />;
      case 'alerts': return <PestAlerts lang={activeLang} user={user} onBack={back} onNavigate={go} />;
      case 'network': return <AlertNetwork lang={activeLang} user={user} onBack={back} />;
      case 'chat': return <ChatModule lang={activeLang} user={user} onBack={back} onNavigate={go} />;
      case 'library': return <Library lang={activeLang} user={user} onBack={back} />;
      default: return <Home lang={activeLang} user={user} onNavigate={go} onEditFarm={() => setFarmOpen(true)} />;
    }
  };

  const LangButton = (
    <div className="relative" id="lang-selector">
      <button onClick={() => setLangOpen(!langOpen)} aria-expanded={langOpen} className="flex items-center gap-2 bg-paper px-3 py-2.5 rounded-2xl border border-gray-200 text-gray-800 font-semibold hover:border-agri-400 transition-colors">
        <Globe size={20} /> <span>{LANGUAGES[activeLang].split(' (')[0]}</span>
      </button>
      <AnimatePresence>
        {langOpen && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.16 }}
            className="absolute right-0 top-full mt-2 w-56 bg-paper rounded-2xl shadow-lift border border-gray-200 p-2 z-50 origin-top-right">
            {(Object.keys(LANGUAGES) as Language[]).map((code) => (
              <button key={code} onClick={() => setLang(code)}
                className={`w-full flex items-center justify-between text-left px-4 py-3 rounded-xl text-lg font-semibold ${activeLang === code ? 'bg-agri-50 text-agri-800' : 'text-gray-700 hover:bg-gray-100'}`}>
                {LANGUAGES[code].split(' (')[0]}{activeLang === code && <Check size={18} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen bg-cream flex font-sans text-ink">
      <TourGuide steps={tourSteps} isOpen={tourOpen} onClose={() => setTourOpen(false)} lang={activeLang} onStepChange={() => { if (view !== 'home') setView('home'); }} />

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-72 bg-paper border-r border-gray-200 h-screen sticky top-0 p-5 z-20">
        <button onClick={() => go('home')} className="flex items-center gap-3 mb-7 px-1">
          <BrandMark />
          <span className="font-display text-[1.6rem] font-semibold text-agri-800 tracking-tight">AgriQNet</span>
        </button>
        <button onClick={() => setFarmOpen(true)} className="mb-6 p-3 bg-cream rounded-2xl flex items-center gap-3 border border-gray-200 text-left hover:border-agri-300 transition-colors">
          <span className="w-11 h-11 bg-agri-700 rounded-full flex items-center justify-center text-gold-300 font-display font-semibold text-lg">{user.name.charAt(0)}</span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 font-semibold text-gray-900 truncate">{user.name}{user.role === 'officer' && <Ico icon={IdentificationBadge} size={18} tone="forest" />}</span>
            <span className="flex items-center gap-1 text-sm text-gray-600 truncate"><Ico icon={PinIcon} size={15} tone="forest" />{place}</span>
          </span>
          <Settings2 size={18} className="text-gray-400" />
        </button>
        <nav id="main-nav-desktop" className="flex-1 space-y-1 overflow-y-auto">
          {NAV.map((n) => {
            const on = view === n.id;
            return (
              <button key={n.id} onClick={() => go(n.id)} aria-current={on ? 'page' : undefined}
                className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[1.05rem] transition-colors ${on ? 'text-agri-900 font-semibold' : 'text-gray-700 hover:bg-gray-100'}`}>
                {on && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-2xl bg-agri-50 border border-agri-200" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                <IconChip icon={SCREEN[n.id].icon} tone={SCREEN[n.id].tone} size="sm" className="relative" />
                <span className="relative">{(t as any)[n.key]}</span>
              </button>
            );
          })}
        </nav>
        <button onClick={logout} className="mt-3 flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-2xl font-semibold"><LogOut size={20} />{t.logout}</button>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-cream/90 backdrop-blur-md border-b border-gray-200 lg:border-0 px-4 lg:px-8 py-3 flex items-center gap-3">
          <button onClick={() => go('home')} className="lg:hidden flex items-center gap-2">
            <BrandMark size={38} />
            <span className="font-display text-xl font-semibold text-agri-800 hidden min-[430px]:inline">AgriQNet</span>
          </button>
          <span className="flex-1" />
          {view === 'home' && (
            <button id="tour-button" onClick={() => setTourOpen(true)} aria-label={t.takeTour} title={t.takeTour} className="flex items-center gap-2 bg-paper border border-gray-200 text-agri-800 px-3 py-2.5 rounded-2xl font-semibold hover:border-agri-400 transition-colors">
              <HelpCircle size={20} /><span className="hidden md:inline">{t.takeTour}</span>
            </button>
          )}
          {LangButton}
          <button onClick={() => setMenuOpen(true)} aria-label={t.menu} className="lg:hidden w-11 h-11 rounded-2xl bg-paper border border-gray-200 flex items-center justify-center"><Menu /></button>
        </header>

        <main className="flex-1 px-4 lg:px-8 pt-4 pb-28 lg:pb-10 max-w-6xl w-full mx-auto">
          {/* Screen change: a short cross-fade with a small rise, so it is clear the page changed */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={view} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
              {screen()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Phone bottom bar */}
      <nav id="main-nav-phone" className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-paper/95 backdrop-blur-md border-t border-gray-200 grid grid-cols-5 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-16px_rgba(30,42,36,.25)]">
        {BOTTOM.map((id) => {
          const n = NAV.find((x) => x.id === id)!;
          const on = view === id;
          const I = SCREEN[id].icon;
          return (
            <button key={id} onClick={() => go(id)} aria-current={on ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center pt-2 pb-1.5 min-h-[66px] ${on ? 'text-agri-800' : 'text-gray-500'}`}>
              <span className="relative px-4 py-1">
                {on && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-full bg-agri-100" transition={{ type: 'spring', stiffness: 480, damping: 36 }} />}
                <I size={24} weight={on ? 'fill' : 'duotone'} className="relative" style={{ color: on ? TONES[SCREEN[id].tone].fg : undefined }} aria-hidden />
              </span>
              <span className={`text-[11px] mt-0.5 leading-tight text-center px-0.5 ${on ? 'font-semibold' : ''}`}>{(t as any)[n.key]}</span>
            </button>
          );
        })}
      </nav>

      {/* Phone menu (all screens + my farm + logout) */}
      <AnimatePresence>
      {menuOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="lg:hidden fixed inset-0 z-50 bg-ink/40" onClick={() => setMenuOpen(false)}>
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-paper p-4 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="flex items-center gap-1.5 font-semibold text-lg">{user.name}{user.role === 'officer' && <Ico icon={IdentificationBadge} size={20} tone="forest" />}</span>
              <button onClick={() => setMenuOpen(false)} aria-label={t.close} className="w-11 h-11 rounded-2xl bg-gray-100 flex items-center justify-center"><X /></button>
            </div>
            <button onClick={() => { setMenuOpen(false); setFarmOpen(true); }} className="w-full mb-3 p-3 bg-cream rounded-2xl border border-gray-200 text-left">
              <span className="block text-sm text-gray-600">{t.myFarm}</span>
              <span className="flex items-center gap-1.5 font-semibold text-gray-900"><Ico icon={PinIcon} size={18} tone="forest" />{place}</span>
            </button>
            {NAV.map((n) => (
              <button key={n.id} onClick={() => go(n.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-lg ${view === n.id ? 'bg-agri-50 font-semibold' : ''}`}>
                <IconChip icon={SCREEN[n.id].icon} tone={SCREEN[n.id].tone} size="sm" />{(t as any)[n.key]}
              </button>
            ))}
            <button onClick={logout} className="w-full mt-3 flex items-center gap-3 px-3 py-3 text-red-700 rounded-2xl font-semibold"><LogOut />{t.logout}</button>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
        {farmOpen && <MyFarm lang={activeLang} user={user} onClose={() => setFarmOpen(false)} onSaved={(u) => { setUser(u); setFarmOpen(false); }} />}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
};

/** Change district and crops (drives weather, alerts and advice). */
const MyFarm: React.FC<{ lang: Language; user: Farmer; onClose: () => void; onSaved: (u: Farmer) => void }> = ({ lang, user, onClose, onSaved }) => {
  const t = getTranslation(lang);
  const [districtId, setDistrictId] = useState(user.districtId || '');
  const [crops, setCrops] = useState<string[]>(user.crops || []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      onSaved(await DBService.updateProfile({ districtId, crops, lang }));
    } catch (e: any) {
      // Old sessions without a token: update locally so the app still uses the new district
      if (e.status === 401 && !user.token) { const u = { ...user, districtId, crops }; DBService.cacheUser(u); onSaved(u); }
      else setErr(e.message || t.errServer);
    } finally { setBusy(false); }
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-ink/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 34 }}
        className="bg-paper w-full sm:max-w-xl rounded-t-[28px] sm:rounded-[28px] p-5 md:p-6 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-3 text-2xl font-semibold"><IconChip icon={Plant} tone="leaf" size="sm" />{t.myFarm}</h2>
          <button onClick={onClose} aria-label={t.close} className="w-11 h-11 rounded-2xl bg-gray-100 flex items-center justify-center"><X /></button>
        </div>
        <p className="font-bold text-gray-800 mb-1">{t.yourDistrict}</p>
        <p className="text-sm text-gray-500 mb-2">{t.districtWhy}</p>
        <DistrictPicker lang={lang} value={districtId} onChange={setDistrictId} />
        <p className="font-bold text-gray-800 mt-5 mb-2">{t.yourCrops}</p>
        <ChoiceGrid options={cropChoices(t)} value={crops} onChange={setCrops} multi cols="grid-cols-3 sm:grid-cols-4" size="sm" />
        {err && <p className="text-red-600 mt-3">{err}</p>}
        <button onClick={save} disabled={busy || !districtId} className="mt-5 w-full py-4 rounded-2xl bg-agri-700 hover:bg-agri-800 text-white text-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 className="animate-spin" /> : t.save}
        </button>
      </motion.div>
    </motion.div>
  );
};

export default App;
