// Home: what matters on the farm today, then the right tool in one tap.
// 1. Living-sky card (district + weather now): the app's single signature moment.
// 2. "Today on your farm": up to three prioritised actions built from pest alerts, weather warnings and
//    the spray verdict.  3. Three big tools + three compact ones (press and hold any tile to hear it).
// 4. Farmer Library shelf.  5. This week's advice (staged loading, offline tips if it is slow).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { MapPin, PencilSimple, CaretRight, Drop, CheckCircle, Bug, ClipboardText, CloudSun, SprayBottle, Eye, Notebook, Sparkle, type Icon as PhIcon } from '@phosphor-icons/react';
import { IconChip, SCREEN, weatherIcon, tipIcon, CloudLightning, Books, Tone } from './ui/Icons';
import { Farmer, Language, NavView } from '../types';
import { getTranslation, districtName, fmt, plural, sentenceCase } from '../utils/translations';
import { PlatformService, DistrictAdvice, WeatherAlert, zonesFor } from '../services/platformService';
import { normalizeAdvice } from '../services/aiNormalize';
import { FarmWeather, farmVerdicts, getFarmWeather, wxWord } from '../services/weatherService';
import { SpeakButton } from './ui/Kit';
import { WorkingOn, InlineError } from './ui/WorkingOn';
import { pestLabel } from '../utils/pests';
import { speak, stopSpeaking } from '../utils/speech';
import { BookCover, requestOpenBook } from './Library';
import { Book, LibraryService } from '../services/libraryService';
import { LivingSky } from './LivingSky';
import { useFarmPlace } from './SmartWeather';

export { wxWord };

const DEPTH: Record<string, number> = { RED: 2, ORANGE: 1, YELLOW: 0 };
const PRIMARY: { id: NavView; key: string; sub: string }[] = [
  { id: 'pest_check', key: 'tilePest', sub: 'tilePestSub' },
  { id: 'weather', key: 'tileWeather', sub: 'tileWeatherSub' },
  { id: 'chat', key: 'tileAsk', sub: 'tileAskSub' },
];
const SECONDARY: { id: NavView; key: string; sub: string }[] = [
  { id: 'crops', key: 'tileCrop', sub: 'tileCropSub' },
  { id: 'fertilizer', key: 'tileFert', sub: 'tileFertSub' },
  { id: 'alerts', key: 'tileAlerts', sub: 'tileAlertsSub' },
];

/** Sky inputs from the weather. In development, ?sky=rain|cloudy|dusk|night previews the other scenes. */
function skyProps(wx: FarmWeather) {
  const base = { code: wx.now.code, rainPct: wx.now.rainPctToday, sunrise: wx.sunrise, sunset: wx.sunset };
  const demo = (import.meta as any).env?.DEV ? new URLSearchParams(window.location.search).get('sky') : null;
  const H = 3600_000;
  if (demo === 'rain') return { ...base, code: 63, rainPct: 90 };
  if (demo === 'cloudy') return { ...base, code: 2, rainPct: 20 };
  if (demo === 'dusk') return { ...base, now: wx.sunset - 0.3 * H, code: 1 };
  if (demo === 'night') return { ...base, now: wx.sunset + 3 * H, code: 0 };
  return base;
}

// The home screen plays its entrance once per visit; coming back to Home is instant.
let entrancePlayed = false;

const adviceKey = (u: Farmer, lang: Language) => `agriqnet_advice|${new Date().toISOString().slice(0, 10)}|${u.districtId}|${(u.crops || []).join(',')}|${lang}`;
// Kept in memory only: the server caches advice per day/language, and is cleared when demo data is reset.
const adviceMem = new Map<string, DistrictAdvice>();

interface TodayItem { id: string; icon: PhIcon; tone: Tone; level: 'danger' | 'warning' | 'ok'; text: string; action: string; go: NavView }

/** Press and hold (500 ms) to hear a tile's description; a normal tap still navigates. */
function useHoldToSpeak(lang: Language) {
  const timer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const start = (text: string) => { held.current = false; timer.current = window.setTimeout(() => { held.current = true; speak(text, lang, 'hold'); }, 500); };
  const cancel = () => window.clearTimeout(timer.current);
  return { start, cancel, wasHeld: () => held.current };
}

const Home: React.FC<{ lang: Language; user: Farmer; onNavigate: (v: NavView) => void; onEditFarm: () => void }> = ({ lang, user, onNavigate, onEditFarm }) => {
  const t = getTranslation(lang) as any;
  const place = districtName(t, user.districtId || '', user.location);
  const farm = useFarmPlace(user, lang);
  const [wx, setWx] = useState<FarmWeather | null>(null);
  const [pestNear, setPestNear] = useState<{ pestType: string; severity: string; reportedDistrictId: string }[]>([]);
  const [wxAlerts, setWxAlerts] = useState<WeatherAlert[]>([]);
  const [advice, setAdvice] = useState<DistrictAdvice | null>(() => adviceMem.get(adviceKey(user, lang)) || null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceErr, setAdviceErr] = useState(false);
  const [adviceSlow, setAdviceSlow] = useState(false);
  const hold = useHoldToSpeak(lang);

  useEffect(() => { if (farm) getFarmWeather(farm).then(setWx).catch(() => {}); }, [farm?.lat, farm?.lon]);
  useEffect(() => {
    Promise.all([PlatformService.getAlerts(), PlatformService.getEdges()]).then(([alerts, edges]) => {
      setPestNear(alerts.filter((a: any) => a.status === 'ACTIVE' && Object.values(zonesFor(a.reportedDistrictId, edges, DEPTH[a.severity])).some((ids) => ids.includes(user.districtId!))));
    }).catch(() => {});
  }, [user.districtId]);
  useEffect(() => {
    if (user.districtId) PlatformService.weatherAlerts({ districtId: user.districtId, lang }).then((r) => setWxAlerts(r.alerts)).catch(() => {});
  }, [user.districtId, lang]);

  // District advice: instant from memory, otherwise from the server (cached there per day)
  const loadAdvice = (refresh = false) => {
    if (!user.districtId) return;
    const k = adviceKey(user, lang);
    const hit = !refresh && adviceMem.get(k);
    if (hit) { setAdvice(hit); return; }
    setAdviceLoading(true); setAdviceErr(false); setAdviceSlow(false);
    const slow = window.setTimeout(() => setAdviceSlow(true), 8000);
    PlatformService.advice(user.districtId, user.crops || [], lang)
      .then((raw) => { const a = normalizeAdvice(raw); if (!a) throw new Error('empty'); setAdvice(a); adviceMem.set(k, a); })
      .catch(() => setAdviceErr(true))
      .finally(() => { window.clearTimeout(slow); setAdviceLoading(false); setAdviceSlow(false); });
  };
  useEffect(() => { loadAdvice(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [lang, user.districtId, (user.crops || []).join(',')]);

  // Farmer Library shelf (newest books first)
  const [shelf, setShelf] = useState<Book[]>([]);
  const [shelfState, setShelfState] = useState<'loading' | 'ok' | 'off'>('loading');
  useEffect(() => { LibraryService.list().then((r) => { setShelf(r.books.slice(0, 10)); setShelfState('ok'); }).catch(() => setShelfState('off')); }, []);

  // "Today on your farm": most urgent first, at most three
  const today: TodayItem[] = useMemo(() => {
    const items: TodayItem[] = [];
    if (pestNear.length) {
      const names = [...new Set(pestNear.map((a) => sentenceCase(pestLabel(lang, a.pestType))))];
      items.push({ id: 'pest', icon: Bug, tone: 'red', level: 'danger', text: fmt(t.todayPest, { pest: names.slice(0, 2).join(', ') }), action: t.seeWhatToDo, go: 'alerts' });
    }
    const w = wxAlerts.find((a) => a.level === 'RED') || wxAlerts.find((a) => a.level === 'ORANGE') || wxAlerts[0];
    if (w) items.push({ id: 'wx', icon: CloudLightning, tone: w.level === 'YELLOW' ? 'gold' : 'rust', level: w.level === 'YELLOW' ? 'warning' : 'danger', text: `${w.title}. ${w.advice || w.message}`, action: t.seeWeather, go: 'weather' });
    if (wx) {
      const spray = farmVerdicts(wx)[0];
      items.push({
        id: 'spray', icon: SprayBottle, tone: 'plum', level: spray.level === 'yes' ? 'ok' : 'warning',
        text: `${spray.level === 'yes' ? t.sprayGoodToday : spray.level === 'no' ? t.sprayNotToday : t.sprayWaitToday} ${spray.level === 'yes' ? '' : fmt(t[spray.reason], spray.vars)}`.trim(),
        action: t.seeWeather, go: 'weather',
      });
    }
    return items.slice(0, 3);
  }, [pestNear, wxAlerts, wx, lang, t]);

  const screenSpeech = [
    fmt(t.helloName, { name: user.name.split(' ')[0] }), place,
    wx ? `${wx.now.temp} °C, ${wxWord(t, wx.now.code)}. ${fmt(t.rainChance, { n: wx.now.rainPctToday })}` : '',
    t.farmToday, ...(today.length ? today.map((x) => x.text) : [t.nothingUrgent]),
    ...[...PRIMARY, ...SECONDARY].map((x) => `${t[x.key]}: ${t[x.sub]}`),
  ].filter(Boolean).join('. ');
  const adviceSpeech = advice ? [advice.headline, ...advice.tips.map((x) => `${x.title}. ${x.text}`)].join('. ') : '';

  const first = !entrancePlayed;
  useEffect(() => { entrancePlayed = true; }, []);
  const rise = (i: number) => (first ? { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.06 + i * 0.05, duration: 0.36, ease: [0.22, 1, 0.36, 1] as const } } : {});
  const WxIcon = wx ? weatherIcon(wx.now.code) : null;

  const tileProps = (id: NavView, text: string) => ({
    id: `tile-${id}`,
    onClick: () => { if (!hold.wasHeld()) onNavigate(id); },
    onPointerDown: () => hold.start(text),
    onPointerUp: hold.cancel, onPointerLeave: hold.cancel, onPointerCancel: hold.cancel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  useEffect(() => () => { hold.cancel(); stopSpeaking(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      {/* 1. The field card: where the farmer is and the sky above it right now */}
      <motion.section id="farm-card" {...(first ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4 } } : {})}
        className="relative overflow-hidden rounded-[28px] bg-agri-700 text-white shadow-lift min-h-[236px]">
        {wx ? <LivingSky {...skyProps(wx)} /> : <div className="furrows absolute inset-0" aria-hidden />}
        <div className="relative p-5 md:p-7">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-agri-50 text-base">{fmt(t.helloName, { name: user.name.split(' ')[0] })}</p>
              <button onClick={onEditFarm} className="mt-1 group flex items-center gap-2 text-left min-h-[44px]">
                <MapPin size={24} weight="duotone" className="shrink-0 text-gold-300" aria-hidden />
                <span className="font-display text-[1.65rem] md:text-3xl font-semibold leading-tight">{place}</span>
                <PencilSimple size={18} className="opacity-70 group-hover:opacity-100 shrink-0" aria-label={t.myFarm} />
              </button>
            </div>
            <SpeakButton text={screenSpeech} lang={lang} tone="dark" />
          </div>
          {wx && WxIcon ? (
            <button onClick={() => onNavigate('weather')} className="mt-5 w-full flex items-center gap-4 text-left group">
              <WxIcon size={60} weight="duotone" className="text-gold-300 shrink-0 drop-shadow" aria-hidden />
              <span className="flex-1 min-w-0">
                <span className="flex items-baseline gap-3 flex-wrap">
                  <span className="font-display text-5xl font-semibold leading-none tabular-nums">{wx.now.temp}°</span>
                  <span className="text-xl font-semibold">{wxWord(t, wx.now.code)}</span>
                </span>
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-black/20 px-3 py-1 text-agri-50 whitespace-nowrap">
                  <Drop size={18} weight="duotone" className="text-sky-200" aria-hidden />{fmt(t.rainChance, { n: wx.now.rainPctToday })}
                </span>
              </span>
              <CaretRight size={26} className="opacity-70 group-hover:translate-x-0.5 transition-transform shrink-0" aria-label={t.seeWeather} />
            </button>
          ) : <div className="mt-5 h-[76px] rounded-2xl bg-white/10 animate-pulse" />}
        </div>
      </motion.section>

      {/* 2. Today on your farm */}
      <motion.section {...rise(1)} aria-labelledby="today-h">
        <h2 id="today-h" className="text-xl md:text-2xl font-semibold text-ink mb-3">{t.farmToday}</h2>
        {today.length === 0 ? (
          <p className="flex items-center gap-3 bg-agri-50 border border-agri-200 rounded-[20px] p-4 text-lg text-agri-900">
            <CheckCircle size={28} weight="duotone" className="text-agri-700 shrink-0" aria-hidden />{t.nothingUrgent}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {today.map((it) => (
              <li key={it.id} className={`flex flex-col sm:flex-row sm:items-center gap-3 bg-paper border border-gray-200 border-l-[6px] rounded-[20px] p-4 shadow-soft ${it.level === 'danger' ? 'border-l-clay-600' : it.level === 'warning' ? 'border-l-gold-500' : 'border-l-agri-600'}`}>
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <IconChip icon={it.icon} tone={it.tone} />
                  <p className={`flex-1 text-lg leading-snug ${it.level === 'danger' ? 'text-clay-700 font-semibold' : 'text-ink'}`}>{it.text}</p>
                </div>
                <button type="button" onClick={() => onNavigate(it.go)}
                  className={`shrink-0 min-h-[48px] px-4 rounded-2xl font-bold flex items-center justify-center gap-1.5 ${it.level === 'danger' ? 'bg-agri-700 text-white hover:bg-agri-800' : 'bg-paper border-2 border-agri-700 text-agri-800'}`}>
                  {it.id === 'pest' ? <Eye size={20} aria-hidden /> : <CloudSun size={20} aria-hidden />}{it.action}
                </button>
              </li>
            ))}
          </ul>
        )}
      </motion.section>

      {/* 3. Tools: three big, three compact */}
      <section aria-label={t.moreTools}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PRIMARY.map((tile, i) => {
            const sc = SCREEN[tile.id];
            return (
              <motion.button key={tile.id} {...rise(2 + i)} whileTap={{ scale: 0.97 }} {...tileProps(tile.id, `${t[tile.key]}. ${t[tile.sub]}`)}
                className="select-none flex sm:flex-col items-center sm:items-start gap-4 text-left bg-paper border border-gray-200 rounded-[20px] p-4 md:p-5 min-h-[92px] sm:min-h-[168px] shadow-soft hover:border-agri-300 hover:shadow-lift transition-[box-shadow,border-color]">
                <IconChip icon={sc.icon} tone={sc.tone} size="lg" />
                <span className="min-w-0">
                  <span className="block font-display text-[1.35rem] font-semibold text-ink leading-tight">{t[tile.key]}</span>
                  <span className="block text-gray-600 mt-1 leading-snug">{t[tile.sub]}</span>
                </span>
              </motion.button>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {SECONDARY.map((tile, i) => {
            const sc = SCREEN[tile.id];
            return (
              <motion.button key={tile.id} {...rise(5 + i)} whileTap={{ scale: 0.96 }} {...tileProps(tile.id, `${t[tile.key]}. ${t[tile.sub]}`)}
                className="select-none relative flex flex-col items-center justify-center gap-2 text-center bg-paper border border-gray-200 rounded-[20px] p-3 min-h-[112px] shadow-soft hover:border-agri-300 transition-colors">
                <IconChip icon={sc.icon} tone={sc.tone} />
                <span className="font-semibold text-ink leading-tight">{t[tile.key]}</span>
                {tile.id === 'alerts' && pestNear.length > 0 && (
                  <span className="absolute top-2 right-2 min-w-7 h-7 px-2 rounded-full bg-clay-600 text-white text-[15px] font-bold flex items-center justify-center ring-4 ring-paper" aria-label={plural(t, lang, 'pestNear', pestNear.length)}>{pestNear.length}</span>
                )}
              </motion.button>
            );
          })}
        </div>
        <p className="mt-2 text-[15px] text-gray-600 text-center">{t.holdToHear}</p>
      </section>

      {/* 4. Farmer Library shelf (always shown: the App Tour points at it) */}
      {shelfState !== 'off' && (
        <motion.section {...rise(8)} id="library-shelf" className="relative overflow-hidden rounded-[20px] bg-paper border border-gray-200 shadow-soft p-5 md:p-6">
          <div className="flex items-start gap-3 mb-4">
            <IconChip icon={Books} tone="soil" />
            <div className="flex-1 min-w-0">
              <h2 className="text-xl md:text-2xl font-semibold text-ink leading-tight">{t.libHomeTitle}</h2>
              <p className="text-gray-600 mt-0.5">{t.libHomeSub}</p>
            </div>
            <button id="tile-library" onClick={() => onNavigate('library')} aria-label={t.libOpenLibrary}
              className="shrink-0 min-h-[48px] inline-flex items-center gap-1 px-4 rounded-2xl bg-agri-700 text-white font-semibold hover:bg-agri-800">
              <span className="hidden sm:inline">{t.libOpenLibrary}</span><CaretRight size={20} weight="bold" aria-hidden />
            </button>
          </div>
          {shelf.length > 0 ? (
            <div className="relative -mx-5 md:-mx-6">
              <div className="no-scrollbar flex gap-4 overflow-x-auto snap-x px-5 md:px-6 pb-1">
                {shelf.map((b) => <BookCover key={b.id} book={b} lang={lang} size="sm" onClick={() => { requestOpenBook(b.id); onNavigate('library'); }} />)}
              </div>
              <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-paper to-transparent" />
            </div>
          ) : shelfState === 'loading' ? (
            <div className="flex gap-4 overflow-hidden">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="w-28 h-40 shrink-0 rounded-xl shimmer" />)}</div>
          ) : <p className="text-gray-600">{t.askLibraryEmpty}</p>}
        </motion.section>
      )}

      {/* 5. This week's advice for the district */}
      <motion.section {...rise(9)} id="advice-card" className="bg-paper rounded-[20px] border border-gray-200 shadow-soft p-5 md:p-6">
        <div className="flex items-start gap-3 mb-4">
          <IconChip icon={ClipboardText} tone="gold" />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl md:text-2xl font-semibold text-ink leading-tight">{fmt(t.adviceTitle, { district: place })}</h2>
            {advice && <p className="text-agri-700 font-semibold mt-0.5">{advice.headline}</p>}
          </div>
          {advice && <SpeakButton text={adviceSpeech} lang={lang} label />}
        </div>
        {adviceLoading && advice && <p className="text-[15px] text-gray-600 mb-2 flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2 border-agri-600 border-t-transparent animate-spin" aria-hidden />{t.updating}</p>}
        {adviceLoading && !advice && (
          <WorkingOn lang={lang} expectedMs={14000} onRetry={() => loadAdvice(true)}
            stages={[{ icon: CloudSun, text: t.stageAdvice1 }, { icon: Sparkle, text: t.stageAdvice2 }, { icon: Notebook, text: t.stageAlmost }]} />
        )}
        {adviceErr && !advice && <InlineError message={t.adviceFailed} onRetry={() => loadAdvice(true)} retryLabel={t.retry} />}
        {!advice && (adviceSlow || adviceErr) && (
          <div className="mt-4">
            <p className="text-gray-700 mb-2">{t.adviceSlow}</p>
            <TipList lang={lang} tips={[
              { icon: Bug, tone: 'rust', title: t.fallbackTip1T, text: t.fallbackTip1 },
              { icon: SprayBottle, tone: 'plum', title: t.fallbackTip2T, text: t.fallbackTip2 },
              { icon: Notebook, tone: 'gold', title: t.fallbackTip3T, text: t.fallbackTip3 },
            ]} />
          </div>
        )}
        {advice && (
          <div className={`transition-opacity ${adviceLoading ? 'opacity-60' : ''}`}>
            <TipList lang={lang} tips={advice.tips.map((tip) => {
              const ti = tipIcon(`${(tip as any).topic || ''} ${tip.icon || ''} ${tip.title}`);
              return { icon: ti.icon, tone: ti.tone, title: tip.title, text: tip.text };
            })} />
          </div>
        )}
      </motion.section>
    </div>
  );
};

const TipList: React.FC<{ lang: Language; tips: { icon: PhIcon; tone: Tone; title: string; text: string }[] }> = ({ lang, tips }) => (
  <ul className="divide-y divide-gray-200">
    {tips.map((tip, i) => (
      <li key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
        <IconChip icon={tip.icon} tone={tip.tone} size="sm" className="mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink">{tip.title}</p>
          <p className="text-gray-700 leading-relaxed">{tip.text}</p>
        </div>
        <SpeakButton text={`${tip.title}. ${tip.text}`} lang={lang} size="sm" />
      </li>
    ))}
  </ul>
);

export default Home;
