// Farm weather for the native Weather screen and the Home card.
// Data: Open-Meteo (free, no key, CORS-enabled; the API server uses the same source for alerts).
// Cached per place for 10 minutes so Home and Weather share one download.

/** Weather code (WMO) → word in the farmer's language. */
export const wxWord = (t: any, code: number) =>
  code === 0 ? t.wxClear : code <= 3 ? t.wxPartlyCloudy : code <= 48 ? t.wxFog : code <= 67 ? t.wxRain : code <= 77 ? t.wxSnow : code <= 82 ? t.wxShowers : t.wxThunder;

export interface HourPoint { time: number; temp: number; rainPct: number; code: number; wind: number }
export interface DayPoint { date: number; /* local midnight, epoch ms */ code: number; tMax: number; tMin: number; rainPct: number; rainMm: number; windMax: number }
export interface FarmWeather {
  now: { temp: number; feels: number; humidity: number; wind: number; code: number; isDay: boolean; rainPctToday: number };
  hours: HourPoint[]; // next 24 hours, starting with the current hour
  days: DayPoint[];   // 7 days, today first
  sunrise: number; sunset: number; // epoch ms, today
  fetchedAt: number;
}
export interface Place { lat: number; lon: number; name: string }

const cache = new Map<string, { at: number; data: Promise<FarmWeather> }>();
const TTL = 10 * 60 * 1000;

export function getFarmWeather({ lat, lon }: { lat: number; lon: number }, force = false): Promise<FarmWeather> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL) return hit.data;
  const data = fetchFarmWeather(lat, lon);
  cache.set(key, { at: Date.now(), data });
  data.catch(() => cache.delete(key));
  return data;
}

async function fetchFarmWeather(lat: number, lon: number): Promise<FarmWeather> {
  const p = new URLSearchParams({
    latitude: String(lat), longitude: String(lon), timezone: 'auto', forecast_days: '7', timeformat: 'unixtime', wind_speed_unit: 'kmh',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
    hourly: 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset',
  });
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`, { signal: ctl.signal });
    if (!r.ok) throw new Error(`Weather service HTTP ${r.status}`);
    const w = await r.json();
    const nowSec = Date.now() / 1000;
    const firstHour = Math.max(0, (w.hourly.time as number[]).findIndex((t) => t + 3600 > nowSec));
    const hours: HourPoint[] = (w.hourly.time as number[]).slice(firstHour, firstHour + 24).map((t, j) => {
      const i = firstHour + j;
      return { time: t * 1000, temp: Math.round(w.hourly.temperature_2m[i]), rainPct: w.hourly.precipitation_probability[i] ?? 0, code: w.hourly.weather_code[i], wind: Math.round(w.hourly.wind_speed_10m[i] ?? 0) };
    });
    const days: DayPoint[] = (w.daily.time as number[]).map((t, i) => ({
      date: t * 1000,
      code: w.daily.weather_code[i],
      tMax: Math.round(w.daily.temperature_2m_max[i]), tMin: Math.round(w.daily.temperature_2m_min[i]),
      rainPct: w.daily.precipitation_probability_max[i] ?? 0, rainMm: w.daily.precipitation_sum[i] ?? 0,
      windMax: Math.round(w.daily.wind_speed_10m_max[i] ?? 0),
    }));
    return {
      now: {
        temp: Math.round(w.current.temperature_2m), feels: Math.round(w.current.apparent_temperature), humidity: Math.round(w.current.relative_humidity_2m),
        wind: Math.round(w.current.wind_speed_10m), code: w.current.weather_code, isDay: !!w.current.is_day, rainPctToday: days[0]?.rainPct ?? 0,
      },
      hours, days,
      sunrise: (w.daily.sunrise?.[0] ?? 0) * 1000, sunset: (w.daily.sunset?.[0] ?? 0) * 1000,
      fetchedAt: Date.now(),
    };
  } finally { window.clearTimeout(timer); }
}

/** Place search for "Check another place" (Open-Meteo geocoding, India first). */
export async function searchPlaces(query: string, lang: string): Promise<(Place & { region: string })[]> {
  const p = new URLSearchParams({ name: query, count: '8', language: lang === 'en' ? 'en' : lang, format: 'json', countryCode: 'IN' });
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${p}`);
  if (!r.ok) throw new Error(`Search HTTP ${r.status}`);
  const d = await r.json();
  return (d.results || []).map((x: any) => ({ lat: x.latitude, lon: x.longitude, name: x.name, region: [x.admin2, x.admin1].filter(Boolean).join(', ') }));
}

// ---------------------------------------------------------------------------------------------
// Farm verdicts: "Can I spray / water / harvest / do field work today?"
// Thresholds in one place so agronomists can tune them. Wind in km/h, rain as probability %.
export const FARM_RULES = {
  spray:   { windOk: 12, windMax: 20, rainOk6h: 30, rainMax6h: 50, hotC: 35 },  // drift above ~12–15 km/h; rain washes off
  water:   { skipRainPct: 60, skipRainMm: 5, dryDaysMm: 2, hotC: 30 },           // skip if rain is coming; water in dry, hot spells
  harvest: { rainOk24h: 20, rainMax24h: 50, humidOk: 75 },                       // drying needs dry air and no rain
  field:   { rainStop6h: 70, rainCaution6h: 40, windStop: 30 },
} as const;
const STORM = (code: number) => code >= 95;

export type Level = 'yes' | 'wait' | 'no';
export interface Verdict { id: 'spray' | 'water' | 'harvest' | 'field'; level: Level; reason: string; vars: Record<string, string | number> }

export function farmVerdicts(w: FarmWeather): Verdict[] {
  const next = (h: number) => w.hours.slice(0, h);
  const rain6 = Math.max(0, ...next(6).map((x) => x.rainPct));
  const rain24 = Math.max(0, ...next(24).map((x) => x.rainPct));
  const wind6 = Math.max(w.now.wind, ...next(6).map((x) => x.wind));
  const storm6 = next(6).some((x) => STORM(x.code)) || STORM(w.now.code);
  const today = w.days[0];
  const next3mm = w.days.slice(0, 3).reduce((s, d) => s + d.rainMm, 0);
  const R = FARM_RULES;

  const spray: Verdict =
    rain6 >= R.spray.rainMax6h ? { id: 'spray', level: 'no', reason: 'rRainSoon', vars: { n: rain6 } }
    : wind6 >= R.spray.windMax ? { id: 'spray', level: 'no', reason: 'rWindHigh', vars: { kmh: wind6 } }
    : rain6 >= R.spray.rainOk6h ? { id: 'spray', level: 'wait', reason: 'rRainSoon', vars: { n: rain6 } }
    : wind6 >= R.spray.windOk ? { id: 'spray', level: 'wait', reason: 'rWindHigh', vars: { kmh: wind6 } }
    : (today?.tMax ?? 0) >= R.spray.hotC ? { id: 'spray', level: 'wait', reason: 'rTooHot', vars: { t: today.tMax } }
    : { id: 'spray', level: 'yes', reason: 'rSprayOk', vars: {} };

  const water: Verdict =
    (today?.rainPct ?? 0) >= R.water.skipRainPct || (today?.rainMm ?? 0) >= R.water.skipRainMm ? { id: 'water', level: 'no', reason: 'rRainExpected', vars: { n: today.rainPct } }
    : next3mm < R.water.dryDaysMm && (today?.tMax ?? 0) >= R.water.hotC ? { id: 'water', level: 'yes', reason: 'rDrySpell', vars: {} }
    : { id: 'water', level: 'wait', reason: 'rCheckSoil', vars: {} };

  const harvest: Verdict =
    rain24 >= R.harvest.rainMax24h ? { id: 'harvest', level: 'no', reason: 'rRainSoon', vars: { n: rain24 } }
    : rain24 >= R.harvest.rainOk24h ? { id: 'harvest', level: 'wait', reason: 'rRainSoon', vars: { n: rain24 } }
    : w.now.humidity >= R.harvest.humidOk ? { id: 'harvest', level: 'wait', reason: 'rHumid', vars: { n: w.now.humidity } }
    : { id: 'harvest', level: 'yes', reason: 'rDryOk', vars: {} };

  const field: Verdict =
    storm6 || rain6 >= R.field.rainStop6h || wind6 >= R.field.windStop ? { id: 'field', level: 'no', reason: 'rStorm', vars: {} }
    : rain6 >= R.field.rainCaution6h ? { id: 'field', level: 'wait', reason: 'rFieldMaybe', vars: {} }
    : { id: 'field', level: 'yes', reason: 'rFieldOk', vars: {} };

  return [spray, water, harvest, field];
}
