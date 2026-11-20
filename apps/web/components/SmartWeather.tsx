// Native Weather screen. Answers the farmer's questions first ("Can I spray / water / harvest /
// work today?"), then shows now, the next 24 hours and 7 days. Replaces the embedded weather app.
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  SprayBottle, Drop, Barn, Tractor, CheckCircle, Clock, XCircle, MagnifyingGlass, MapPin, Wind, Thermometer,
  CloudSun, ArrowCounterClockwise, SunHorizon, type Icon as PhIcon,
} from '@phosphor-icons/react';
import { Farmer, Language } from '../types';
import { getTranslation, districtName, fmt, LOCALES } from '../utils/translations';
import { loadDistricts } from './DistrictPicker';
import { ScreenTitle, SpeakButton, VoiceField } from './ui/Kit';
import { IconChip, weatherIcon, CloudLightning, Tone } from './ui/Icons';
import { WorkingOn, InlineError } from './ui/WorkingOn';
import { Sheet, SheetContent } from './ui/sheet';
import { Skeleton } from './ui/progress';
import { PlatformService, WeatherAlert } from '../services/platformService';
import { FarmWeather, Place, Verdict, Level, farmVerdicts, getFarmWeather, searchPlaces, wxWord } from '../services/weatherService';
import { SeverityMeter } from './ui/Severity';

export { useFarmPlace } from '../utils/farmPlace';
import { useFarmPlace } from '../utils/farmPlace';

const VERDICT_META: Record<Verdict['id'], { icon: PhIcon; tone: Tone; q: string }> = {
  spray: { icon: SprayBottle, tone: 'plum', q: 'vSpray' },
  water: { icon: Drop, tone: 'sky', q: 'vWater' },
  harvest: { icon: Barn, tone: 'soil', q: 'vHarvest' },
  field: { icon: Tractor, tone: 'leaf', q: 'vField' },
};
const LEVEL: Record<Level, { icon: PhIcon; word: string; cls: string; stripe: string }> = {
  yes: { icon: CheckCircle, word: 'ansYes', cls: 'bg-agri-700 text-white', stripe: 'border-l-agri-600' },
  wait: { icon: Clock, word: 'ansWait', cls: 'bg-gold-100 text-ink border border-gold-500', stripe: 'border-l-gold-500' },
  no: { icon: XCircle, word: 'ansNo', cls: 'bg-clay-50 text-clay-700 border border-clay-600/40', stripe: 'border-l-clay-600' },
};

const SmartWeather: React.FC<{ lang: Language; user?: Farmer | null; onBack: () => void }> = ({ lang, user, onBack }) => {
  const t = getTranslation(lang) as any;
  const farm = useFarmPlace(user, lang);
  const [other, setOther] = useState<Place | null>(null);
  const place = other || farm;
  const [wx, setWx] = useState<FarmWeather | null>(null);
  const [err, setErr] = useState(false);
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  const load = (force = false) => {
    if (!place) return;
    setErr(false);
    setWx(null);
    getFarmWeather(place, force).then(setWx).catch(() => setErr(true));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [place?.lat, place?.lon]);
  useEffect(() => {
    if (other) { setAlerts([]); return; }
    if (user?.districtId) PlatformService.weatherAlerts({ districtId: user.districtId, lang }).then((r) => setAlerts(r.alerts)).catch(() => setAlerts([]));
  }, [user?.districtId, lang, other]);

  const verdicts = useMemo(() => (wx ? farmVerdicts(wx) : []), [wx]);
  const locale = LOCALES[lang];
  const hourFmt = new Intl.DateTimeFormat(locale, { hour: 'numeric' });
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const dateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });

  const speech = wx && place ? [
    place.name,
    `${wx.now.temp} °C, ${wxWord(t, wx.now.code)}`,
    ...verdicts.map((v) => `${t[VERDICT_META[v.id].q]} ${t[LEVEL[v.level].word]}. ${fmt(t[v.reason], v.vars)}`),
  ].join('. ') : '';

  const week = wx?.days || [];
  const lo = Math.min(...week.map((d) => d.tMin)), hi = Math.max(...week.map((d) => d.tMax));
  const span = Math.max(1, hi - lo);

  return (
    <div className="space-y-5">
      <ScreenTitle lang={lang} icon="weather" title={t.tileWeather} desc={t.weatherDesc} onBack={onBack}
        right={speech ? <SpeakButton text={speech} lang={lang} /> : undefined} />

      {/* Where: farm district, or a place the farmer looked up */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-lg font-semibold text-ink mr-auto">
          <MapPin size={22} weight="duotone" className="text-agri-700" aria-hidden />{place?.name || '…'}
        </span>
        {other && (
          <button type="button" onClick={() => setOther(null)} className="min-h-[48px] px-4 rounded-2xl bg-agri-50 border border-agri-200 text-agri-800 font-semibold flex items-center gap-2">
            <ArrowCounterClockwise size={20} aria-hidden />{t.backToFarm}
          </button>
        )}
        <button type="button" onClick={() => setSearchOpen(true)} className="min-h-[48px] px-4 rounded-2xl bg-paper border border-gray-300 text-gray-800 font-semibold flex items-center gap-2 hover:border-agri-400">
          <MagnifyingGlass size={20} aria-hidden />{t.otherPlace}
        </button>
      </div>

      {err && <InlineError message={t.weatherFail} onRetry={() => load(true)} retryLabel={t.retry} />}
      {!wx && !err && (
        <WorkingOn lang={lang} expectedMs={4000} stages={[{ icon: CloudSun, text: t.stageWeather }]} onRetry={() => load(true)}
          skeleton={<div className="grid sm:grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-[20px]" />)}</div>} />
      )}

      {wx && (
        <>
          {/* 1. Farm verdicts: the reason this screen exists */}
          <section aria-labelledby="wx-today">
            <h2 id="wx-today" className="text-xl font-semibold text-ink mb-3">{t.farmToday}</h2>
            <ul className="grid sm:grid-cols-2 gap-3">
              {verdicts.map((v, i) => {
                const m = VERDICT_META[v.id], L = LEVEL[v.level];
                return (
                  <motion.li key={v.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                    className={`bg-paper border border-gray-200 border-l-[6px] ${L.stripe} rounded-[20px] p-4 flex items-start gap-3 shadow-soft`}>
                    <IconChip icon={m.icon} tone={m.tone} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                        <p className="text-lg font-semibold text-ink leading-tight">{t[m.q]}</p>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-bold ${L.cls}`}>
                          <L.icon size={18} weight="fill" aria-hidden />{t[L.word]}
                        </span>
                      </div>
                      <p className="text-gray-700 mt-1">{fmt(t[v.reason], v.vars)}</p>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          </section>

          {/* 2. Now */}
          <section className="bg-paper border border-gray-200 rounded-[20px] p-5 shadow-soft">
            <div className="flex items-center gap-4">
              {React.createElement(weatherIcon(wx.now.code), { size: 64, weight: 'duotone', className: 'text-gold-700 shrink-0', 'aria-hidden': true })}
              <div className="min-w-0">
                <p className="flex items-baseline gap-3 flex-wrap">
                  <span className="font-display text-5xl font-semibold text-ink tabular-nums leading-none">{wx.now.temp}°</span>
                  <span className="text-xl font-semibold text-ink">{wxWord(t, wx.now.code)}</span>
                </p>
                <p className="text-gray-600 mt-1">{fmt(t.feelsLike, { t: wx.now.feels })}</p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2">
              {[
                { icon: Drop, label: t.rainChanceShort, value: `${wx.now.rainPctToday}%` },
                { icon: Thermometer, label: t.humidity, value: `${wx.now.humidity}%` },
                { icon: Wind, label: t.wind, value: `${wx.now.wind} km/h` },
              ].map((s) => (
                <div key={s.label} className="bg-cream rounded-2xl p-3">
                  <dt className="flex items-center gap-1.5 text-gray-600 text-[15px]"><s.icon size={18} aria-hidden />{s.label}</dt>
                  <dd className="text-xl font-semibold text-ink tabular-nums mt-0.5 whitespace-nowrap">{s.value}</dd>
                </div>
              ))}
            </dl>
            {wx.sunrise > 0 && (
              <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-600">
                <span className="flex items-center gap-1.5"><SunHorizon size={20} aria-hidden />{fmt(t.sunrise, { t: timeFmt.format(wx.sunrise) })}</span>
                <span>{fmt(t.sunset, { t: timeFmt.format(wx.sunset) })}</span>
              </p>
            )}
          </section>

          {/* 3. Next 24 hours: temperature + rain chance bars */}
          <section className="bg-paper border border-gray-200 rounded-[20px] p-5 shadow-soft" aria-labelledby="wx-24">
            <h2 id="wx-24" className="text-xl font-semibold text-ink mb-3">{t.next24}</h2>
            <div className="relative -mx-5">
              <ol className="no-scrollbar flex gap-1 overflow-x-auto snap-x px-5 pb-1">
                {wx.hours.map((h, i) => {
                  const I = weatherIcon(h.code);
                  return (
                    <li key={h.time} className={`snap-start shrink-0 w-[64px] flex flex-col items-center gap-1 rounded-2xl py-2 ${i === 0 ? 'bg-agri-50 border border-agri-200' : ''}`}>
                      <span className={`text-[15px] whitespace-nowrap ${i === 0 ? 'font-bold text-agri-800' : 'text-gray-600'}`}>{i === 0 ? t.nowLabel : hourFmt.format(h.time)}</span>
                      <I size={26} weight="duotone" className="text-gold-700" aria-hidden />
                      <span className="text-lg font-semibold text-ink tabular-nums">{h.temp}°</span>
                      <span className="h-10 w-3 rounded-full bg-sky-100 flex items-end overflow-hidden" aria-hidden>
                        <span className="w-full rounded-full bg-sky-600" style={{ height: `${Math.max(4, h.rainPct)}%` }} />
                      </span>
                      <span className="text-[15px] text-sky-800 tabular-nums">{h.rainPct}%</span>
                    </li>
                  );
                })}
              </ol>
              <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-paper to-transparent" />
            </div>
          </section>

          {/* 4. Next 7 days: temperature range like a thermometer, rain chance */}
          <section className="bg-paper border border-gray-200 rounded-[20px] p-5 shadow-soft" aria-labelledby="wx-7">
            <h2 id="wx-7" className="text-xl font-semibold text-ink mb-2">{t.next7}</h2>
            <ul className="divide-y divide-gray-200">
              {week.map((d, i) => {
                const I = weatherIcon(d.code);
                const day = i === 0 ? t.today : i === 1 ? t.tomorrow : dayFmt.format(d.date);
                return (
                  <li key={d.date} className="py-3 grid grid-cols-[5.5rem_3.25rem_1fr] items-center gap-3">
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink leading-tight">{day}</span>
                      <span className="block text-[15px] text-gray-600">{dateFmt.format(d.date)}</span>
                    </span>
                    <span className="flex flex-col items-center">
                      <I size={28} weight="duotone" className="text-gold-700" aria-label={wxWord(t, d.code)} />
                      <span className="flex items-center gap-0.5 text-[15px] text-sky-800 tabular-nums" title={t.rainChanceShort}>
                        <Drop size={14} weight={d.rainPct >= 50 ? 'fill' : 'regular'} aria-hidden />{d.rainPct}%
                      </span>
                    </span>
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-gray-600 tabular-nums w-8 text-right">{d.tMin}°</span>
                      <span className="relative flex-1 h-2.5 rounded-full bg-gray-100" aria-hidden>
                        <span className="absolute inset-y-0 rounded-full bg-gradient-to-r from-sky-400 via-gold-300 to-orange-400"
                          style={{ left: `${((d.tMin - lo) / span) * 100}%`, right: `${100 - ((d.tMax - lo) / span) * 100}%` }} />
                      </span>
                      <span className="font-semibold text-ink tabular-nums w-8">{d.tMax}°</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* 5. Official-style warnings for the district */}
          {!other && (
            <section className="bg-paper border border-gray-200 rounded-[20px] p-5 shadow-soft" aria-labelledby="wx-warn">
              <h2 id="wx-warn" className="text-xl font-semibold text-ink mb-3 flex items-center gap-3"><IconChip icon={CloudLightning} tone="sky" size="sm" />{t.weatherAlertsTitle}</h2>
              {alerts.length === 0 ? (
                <p className="flex items-center gap-2 text-lg text-agri-800 bg-agri-50 border border-agri-100 rounded-2xl p-4"><CheckCircle size={24} weight="duotone" aria-hidden />{t.noWeatherRisk}</p>
              ) : (
                <ul className="space-y-2">
                  {alerts.slice(0, 4).map((a, i) => (
                    <li key={i} className="flex items-start gap-3 border border-gray-200 rounded-2xl p-3">
                      <span className="w-8 flex justify-center mt-1"><SeverityMeter level={a.level} size="sm" /></span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-ink">{a.title}</p>
                        <p className="text-[15px] text-gray-600">{dateFmt.format(new Date(a.date))}</p>
                        <p className="text-gray-700 mt-1">{a.message} {a.advice}</p>
                      </div>
                      <SpeakButton text={`${a.title}. ${a.message} ${a.advice}`} lang={lang} size="sm" />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      <PlaceSearch lang={lang} open={searchOpen} onOpenChange={setSearchOpen} onPick={(p) => { setOther(p); setSearchOpen(false); }} />
    </div>
  );
};

const PlaceSearch: React.FC<{ lang: Language; open: boolean; onOpenChange: (o: boolean) => void; onPick: (p: Place) => void }> = ({ lang, open, onOpenChange, onPick }) => {
  const t = getTranslation(lang) as any;
  const [q, setQ] = useState('');
  const [res, setRes] = useState<(Place & { region: string })[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    const id = window.setTimeout(() => {
      setBusy(true); setErr(false);
      searchPlaces(q.trim(), lang).then(setRes).catch(() => setErr(true)).finally(() => setBusy(false));
    }, 400);
    return () => window.clearTimeout(id);
  }, [q, lang]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={t.otherPlace} closeLabel={t.close}>
        <VoiceField lang={lang} value={q} onChange={setQ} placeholder={t.placeName} icon={<MagnifyingGlass size={20} />} />
        <div className="mt-3 min-h-[120px]" aria-live="polite">
          {busy && <p className="text-gray-600 p-2">{t.search}…</p>}
          {err && <p role="alert" className="text-clay-700 p-2">{t.wxSearchFail}</p>}
          {res && !busy && res.length === 0 && <p className="text-gray-600 p-2">{t.noPlaces}</p>}
          <ul className="space-y-1.5">
            {(res || []).map((p, i) => (
              <li key={i}>
                <button type="button" onClick={() => onPick(p)} className="w-full min-h-[56px] text-left px-4 py-2 rounded-2xl hover:bg-agri-50 border border-transparent hover:border-agri-200 flex items-center gap-3">
                  <MapPin size={22} weight="duotone" className="text-agri-700 shrink-0" aria-hidden />
                  <span className="min-w-0"><span className="block font-semibold text-ink">{p.name}</span>{p.region && <span className="block text-[15px] text-gray-600">{p.region}</span>}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default SmartWeather;
