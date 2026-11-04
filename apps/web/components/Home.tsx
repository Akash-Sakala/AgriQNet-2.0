import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Pencil, RefreshCw, ChevronRight, Droplets } from 'lucide-react';
import { motion } from 'motion/react';
import { IconChip, Ico, SCREEN, weatherIcon, tipIcon, Bug, CloudLightning, ClipboardText, TONES } from './ui/Icons';
import { Farmer, Language, NavView } from '../types';
import { getTranslation, districtName, fmt } from '../utils/translations';
import { PlatformService, DistrictAdvice, WeatherAlert, zonesFor } from '../services/platformService';
import { api } from '../services/config';
import { SpeakButton } from './ui/Kit';
import { pestLabel } from '../utils/pests';
import { Books } from './ui/Icons';
import { BookCover, requestOpenBook } from './Library';
import { Book, LibraryService } from '../services/libraryService';

export const wxWord = (t: any, code: number) =>
  code === 0 ? t.wxClear : code <= 3 ? t.wxPartlyCloudy : code <= 48 ? t.wxFog : code <= 67 ? t.wxRain : code <= 77 ? t.wxSnow : code <= 82 ? t.wxShowers : t.wxThunder;

const DEPTH: Record<string, number> = { RED: 2, ORANGE: 1, YELLOW: 0 };

export const TILES: { id: NavView; key: string; sub: string }[] = [
  { id: 'weather', key: 'tileWeather', sub: 'tileWeatherSub' },
  { id: 'crops', key: 'tileCrop', sub: 'tileCropSub' },
  { id: 'fertilizer', key: 'tileFert', sub: 'tileFertSub' },
  { id: 'pest_check', key: 'tilePest', sub: 'tilePestSub' },
  { id: 'alerts', key: 'tileAlerts', sub: 'tileAlertsSub' },
  { id: 'chat', key: 'tileAsk', sub: 'tileAskSub' },
];

// The home screen plays its entrance once per visit; coming back to Home is instant.
let entrancePlayed = false;

const adviceKey = (u: Farmer, lang: Language) => `agriqnet_advice|${new Date().toISOString().slice(0, 10)}|${u.districtId}|${(u.crops || []).join(',')}|${lang}`;
// Kept in memory only: the server caches advice per day/language, and is cleared when demo data is reset.
const adviceMem = new Map<string, DistrictAdvice>();
const readAdvice = (k: string): DistrictAdvice | null => adviceMem.get(k) || null;

const Home: React.FC<{ lang: Language; user: Farmer; onNavigate: (v: NavView) => void; onEditFarm: () => void }> = ({ lang, user, onNavigate, onEditFarm }) => {
  const t = getTranslation(lang);
  const place = districtName(t, user.districtId || '', user.location);
  const [now, setNow] = useState<{ temp: number; code: number; rain: number; hum: number } | null>(null);
  const [pestNear, setPestNear] = useState<{ pestType: string; severity: string; reportedDistrictId: string }[]>([]);
  const [wxAlerts, setWxAlerts] = useState<WeatherAlert[]>([]);
  const [advice, setAdvice] = useState<DistrictAdvice | null>(() => readAdvice(adviceKey(user, lang)));
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceErr, setAdviceErr] = useState(false);

  // Weather now + pest alerts reaching this district (district-based, no GPS)
  useEffect(() => {
    if (user.districtId) api<{ temp: number; code: number; rain: number; hum: number }>(`/weather/now?districtId=${user.districtId}`).then(setNow).catch(() => {});
    Promise.all([PlatformService.getAlerts(), PlatformService.getEdges()]).then(([alerts, edges]) => {
      const near = alerts.filter((a: any) => a.status === 'ACTIVE' && Object.values(zonesFor(a.reportedDistrictId, edges, DEPTH[a.severity])).some((ids) => ids.includes(user.districtId!)));
      setPestNear(near);
    }).catch(() => {});
  }, [user.districtId]);

  useEffect(() => {
    if (!user.districtId) return;
    PlatformService.weatherAlerts({ districtId: user.districtId, lang }).then((r) => setWxAlerts(r.alerts)).catch(() => {});
  }, [user.districtId, lang]);

  // District advice: instant from this device's cache, otherwise from the server (cached there per day)
  const loadAdvice = (refresh = false) => {
    if (!user.districtId) return;
    const k = adviceKey(user, lang);
    const hit = !refresh && readAdvice(k);
    if (hit) { setAdvice(hit); return; }
    setAdviceLoading(true);
    setAdviceErr(false);
    PlatformService.advice(user.districtId, user.crops || [], lang)
      .then((a) => { setAdvice(a); adviceMem.set(k, a); })
      .catch(() => setAdviceErr(true))
      .finally(() => setAdviceLoading(false));
  };
  useEffect(() => { loadAdvice(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [lang, user.districtId, (user.crops || []).join(',')]);

  // Farmer Library shelf (newest books first)
  const [shelf, setShelf] = useState<Book[]>([]);
  const [shelfState, setShelfState] = useState<'loading' | 'ok' | 'off'>('loading');
  useEffect(() => { LibraryService.list().then((r) => { setShelf(r.books.slice(0, 10)); setShelfState('ok'); }).catch(() => setShelfState('off')); }, []);

  const topWx = wxAlerts[0];
  const adviceSpeech = useMemo(() => advice ? [advice.headline, ...advice.tips.map((x) => `${x.title}. ${x.text}`)].join('. ') : '', [advice]);
  const nowSpeech = now ? `${place}. ${now.temp} °C. ${wxWord(t, now.code)}. ${fmt(t.rainChance, { n: now.rain })}` : '';

  const first = !entrancePlayed;
  useEffect(() => { entrancePlayed = true; }, []);
  const rise = (i: number) => (first ? { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.08 + i * 0.05, duration: 0.42, ease: [0.22, 1, 0.36, 1] as const } } : {});
  const WxIcon = now ? weatherIcon(now.code) : null;

  return (
    <div className="space-y-6">
      {/* The field card: where the farmer is and the weather right now */}
      <motion.section id="farm-card" {...(first ? { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } } : {})}
        className="relative overflow-hidden rounded-[28px] bg-agri-700 text-white shadow-lift">
        <div className="furrows absolute inset-0" aria-hidden />
        <div className="absolute -right-16 -top-20 w-72 h-72 rounded-full bg-gold-500/15 blur-2xl" aria-hidden />
        <div className="relative p-5 md:p-7">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-agri-100/90 text-base">{fmt(t.helloName, { name: user.name.split(' ')[0] })}</p>
              <button onClick={onEditFarm} className="mt-1 group flex items-center gap-2 text-left">
                <MapPin size={22} className="shrink-0 text-gold-300" />
                <span className="font-display text-[1.65rem] md:text-3xl font-semibold leading-tight truncate">{place}</span>
                <Pencil size={16} className="opacity-60 group-hover:opacity-100 shrink-0 transition-opacity" />
              </button>
            </div>
            {nowSpeech && <SpeakButton text={nowSpeech} lang={lang} tone="dark" />}
          </div>
          <div className="mt-5 h-px bg-gradient-to-r from-gold-300/70 via-white/20 to-transparent" aria-hidden />
          {now && WxIcon ? (
            <button onClick={() => onNavigate('weather')} className="mt-4 w-full flex items-center gap-4 text-left group">
              <WxIcon size={64} weight="duotone" className="text-gold-300 shrink-0" aria-hidden />
              <span className="flex-1 min-w-0">
                <span className="flex items-baseline gap-3 flex-wrap">
                  <span className="font-display text-5xl font-semibold leading-none tabular-nums">{now.temp}°</span>
                  <span className="text-lg font-medium text-agri-50">{wxWord(t, now.code)}</span>
                </span>
                <span className="mt-1.5 flex items-center gap-1.5 text-agri-100"><Droplets size={16} className="text-sky-200" /> {fmt(t.rainChance, { n: now.rain })}</span>
              </span>
              <ChevronRight className="opacity-60 group-hover:translate-x-0.5 transition-transform" />
            </button>
          ) : <div className="mt-4 h-[72px] rounded-2xl bg-white/10 animate-pulse" />}
        </div>
      </motion.section>

      {/* Warnings for this district (icon + words + colour) */}
      {(pestNear.length > 0 || topWx) && (
        <div className="space-y-2.5">
          {pestNear.length > 0 && (
            <motion.button {...rise(1)} whileTap={{ scale: 0.98 }} onClick={() => onNavigate('alerts')}
              className="w-full flex items-center gap-3 bg-paper border border-red-200 border-l-[6px] border-l-red-600 rounded-2xl p-4 text-left shadow-soft">
              <IconChip icon={Bug} tone="red" />
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-red-800 text-lg">{fmt(t.pestNearCount, { n: pestNear.length })}</span>
                <span className="block text-gray-700 truncate">{pestNear.slice(0, 3).map((a) => pestLabel(lang, a.pestType)).join(', ')}</span>
              </span>
              <ChevronRight className="text-red-400" />
            </motion.button>
          )}
          {topWx && (
            <motion.div {...rise(2)} className={`w-full flex items-center gap-3 bg-paper border border-l-[6px] rounded-2xl p-4 shadow-soft ${topWx.level === 'RED' ? 'border-red-200 border-l-red-600' : topWx.level === 'ORANGE' ? 'border-orange-200 border-l-orange-500' : 'border-yellow-200 border-l-gold-500'}`}>
              <button onClick={() => onNavigate('alerts')} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                <IconChip icon={CloudLightning} tone={topWx.level === 'YELLOW' ? 'gold' : topWx.level === 'ORANGE' ? 'rust' : 'red'} />
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-gray-900 text-lg">{topWx.title}</span>
                  <span className="block text-gray-600 line-clamp-2">{topWx.advice || topWx.message}</span>
                </span>
              </button>
              <SpeakButton text={`${topWx.title}. ${topWx.message} ${topWx.advice}`} lang={lang} />
            </motion.div>
          )}
        </div>
      )}

      {/* Six tiles: one per job */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {TILES.map((tile, i) => {
          const sc = SCREEN[tile.id];
          return (
            <motion.div key={tile.id} {...rise(3 + i)} whileTap={{ scale: 0.97 }}
              className="group relative bg-paper border border-gray-200 rounded-3xl shadow-soft hover:shadow-lift hover:-translate-y-0.5 transition-[box-shadow,transform,border-color] duration-200"
              style={{ ['--tone' as any]: TONES[sc.tone].fg }}>
              <button id={`tile-${tile.id}`} onClick={() => onNavigate(tile.id)} className="w-full h-full p-4 md:p-5 flex flex-col items-start text-left min-h-[156px] rounded-3xl">
                <IconChip icon={sc.icon} tone={sc.tone} size="lg" className="mb-4" />
                <span className="font-display text-xl md:text-[1.35rem] font-semibold text-ink leading-tight">{(t as any)[tile.key]}</span>
                <span className="text-sm text-gray-600 mt-1 leading-snug">{(t as any)[tile.sub]}</span>
                {tile.id === 'alerts' && pestNear.length > 0 && <span className="absolute top-4 right-4 min-w-7 h-7 px-2 rounded-full bg-red-600 text-white text-sm font-bold flex items-center justify-center ring-4 ring-paper">{pestNear.length}</span>}
              </button>
              <span className="absolute inset-x-5 bottom-0 h-[3px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'var(--tone)' }} aria-hidden />
              {tile.id !== 'alerts' && <SpeakButton text={`${(t as any)[tile.key]}. ${(t as any)[tile.sub]}`} lang={lang} size="sm" className="absolute top-4 right-4" />}
            </motion.div>
          );
        })}
      </div>

      {/* Farmer Library: a shelf of book covers, like a streaming app */}
      {/* always shown (the App Tour points at it); empty / loading states below */}
      {shelfState !== 'off' && (
        <motion.section {...rise(9)} id="library-shelf" className="relative overflow-hidden rounded-3xl bg-paper border border-gray-200 shadow-soft p-5 md:p-6">
          <div className="flex items-start gap-3 mb-4">
            <IconChip icon={Books} tone="soil" />
            <div className="flex-1 min-w-0">
              <h2 className="text-xl md:text-2xl font-semibold text-ink leading-tight">{t.libHomeTitle}</h2>
              <p className="text-gray-600 mt-0.5">{t.libHomeSub}</p>
            </div>
            <button id="tile-library" onClick={() => onNavigate('library')} className="shrink-0 inline-flex items-center gap-1 px-4 py-2.5 rounded-2xl bg-agri-700 text-white font-semibold hover:bg-agri-800">
              <span className="hidden sm:inline">{t.libOpenLibrary}</span><ChevronRight size={18} />
            </button>
          </div>
          {shelf.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto snap-x pb-2 -mx-1 px-1 [scrollbar-width:thin]">
              {shelf.map((b) => <BookCover key={b.id} book={b} lang={lang} size="sm" onClick={() => { requestOpenBook(b.id); onNavigate('library'); }} />)}
            </div>
          ) : shelfState === 'loading' ? (
            <div className="flex gap-4 overflow-hidden">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="w-28 h-40 shrink-0 rounded-xl shimmer" />)}</div>
          ) : (
            <p className="text-gray-600">{t.askLibraryEmpty}</p>
          )}
        </motion.section>
      )}

      {/* This week's advice for the district */}
      <motion.section {...rise(10)} id="advice-card" className="bg-paper rounded-3xl border border-gray-200 shadow-soft p-5 md:p-6">
        <div className="flex items-start gap-3 mb-4">
          <IconChip icon={ClipboardText} tone="gold" />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl md:text-2xl font-semibold text-ink leading-tight">{fmt(t.adviceTitle, { district: place })}</h2>
            {advice && <p className="text-agri-700 font-medium mt-0.5">{advice.headline}</p>}
          </div>
          {advice && <SpeakButton text={adviceSpeech} lang={lang} label />}
        </div>
        {adviceLoading && !advice && <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-2xl shimmer" />)}<p className="text-sm text-gray-500 text-center pt-1">{t.adviceLoading}</p></div>}
        {adviceLoading && advice && <p className="text-sm text-gray-500 mb-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2 border-agri-600 border-t-transparent animate-spin" />{t.translating}</p>}
        {adviceErr && !advice && (
          <div className="text-center py-4">
            <p className="text-gray-600 mb-3">{t.adviceFailed}</p>
            <button onClick={() => loadAdvice(true)} className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-agri-700 text-white font-semibold"><RefreshCw size={18} /> {t.retry}</button>
          </div>
        )}
        {advice && (
          <ul className={`divide-y divide-gray-100 transition-opacity ${adviceLoading ? 'opacity-60' : ''}`}>
            {advice.tips.map((tip, i) => {
              const ti = tipIcon(`${(tip as any).topic || ''} ${tip.icon || ''} ${tip.title}`);
              return (
                <li key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <IconChip icon={ti.icon} tone={ti.tone} size="sm" className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{tip.title}</p>
                    <p className="text-gray-700 leading-relaxed">{tip.text}</p>
                  </div>
                  <SpeakButton text={`${tip.title}. ${tip.text}`} lang={lang} size="sm" />
                </li>
              );
            })}
          </ul>
        )}
      </motion.section>
    </div>
  );
};

export default Home;
