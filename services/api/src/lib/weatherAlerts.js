// Rule-based agro-weather alerts from the free Open-Meteo forecast API (no key needed).
// Thresholds follow IMD rainfall categories and common Karnataka agro-advisory practice.
// All text comes from src/i18n (en/hi/kn/te) so farmers read advisories in their language.
import { tr } from './i18n.js';

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const DAILY = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'precipitation_probability_max',
  'wind_speed_10m_max', 'wind_gusts_10m_max', 'relative_humidity_2m_mean', 'et0_fao_evapotranspiration',
].join(',');

const LEVEL_ORDER = { RED: 3, ORANGE: 2, YELLOW: 1 };

export async function fetchForecast(lat, lon, days = 16) {
  const url = `${OPEN_METEO}?latitude=${lat}&longitude=${lon}&daily=${DAILY}&forecast_days=${days}&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`);
  return r.json();
}

export function computeAlerts(forecast, horizonDays = 7, lang = 'en') {
  const d = forecast.daily;
  const n = Math.min(horizonDays, d.time.length);
  const alerts = [];
  // a = { type, level, date, value?, key (i18n prefix), msgKey, vars }
  const push = ({ key, msgKey, vars = {}, ...a }) => alerts.push({
    ...a,
    title: tr(lang, `wa_${key}_title`),
    message: msgKey ? tr(lang, msgKey, vars) : '',
    advice: tr(lang, `wa_${key}_advice`),
  });

  for (let i = 0; i < n; i++) {
    const date = d.time[i];
    const rain = d.precipitation_sum[i] ?? 0;
    const tmax = d.temperature_2m_max[i];
    const tmin = d.temperature_2m_min[i];
    const gust = d.wind_gusts_10m_max?.[i] ?? 0;
    const code = d.weather_code[i];

    const mm = { mm: rain.toFixed(0) };
    if (rain >= 115.6) push({ type: 'heavy_rain', level: 'RED', date, value: rain, key: 'veryHeavyRain', msgKey: 'wa_rain_msg', vars: mm });
    else if (rain >= 64.5) push({ type: 'heavy_rain', level: 'ORANGE', date, value: rain, key: 'heavyRain', msgKey: 'wa_rain_msg', vars: mm });
    else if (rain >= 35.5) push({ type: 'rain', level: 'YELLOW', date, value: rain, key: 'rain', msgKey: 'wa_rain_msg', vars: mm });

    if (tmax >= 45) push({ type: 'heat', level: 'RED', date, value: tmax, key: 'severeHeat', msgKey: 'wa_heat_msg', vars: { t: tmax.toFixed(1) } });
    else if (tmax >= 40) push({ type: 'heat', level: 'ORANGE', date, value: tmax, key: 'heatwave', msgKey: 'wa_heat_msg', vars: { t: tmax.toFixed(1) } });

    if (tmin <= 8) push({ type: 'cold', level: 'ORANGE', date, value: tmin, key: 'cold', msgKey: 'wa_cold_msg', vars: { t: tmin.toFixed(1) } });

    if (gust >= 70) push({ type: 'wind', level: 'RED', date, value: gust, key: 'damagingWind', msgKey: 'wa_wind_msg', vars: { kmh: gust.toFixed(0) } });
    else if (gust >= 50) push({ type: 'wind', level: 'ORANGE', date, value: gust, key: 'strongWind', msgKey: 'wa_wind_msg', vars: { kmh: gust.toFixed(0) } });

    if ([95, 96, 99].includes(code)) {
      alerts.push({
        type: 'thunderstorm', level: code === 95 ? 'YELLOW' : 'ORANGE', date,
        title: tr(lang, code === 95 ? 'wa_thunder_title' : 'wa_thunderHail_title'),
        message: tr(lang, 'wa_thunder_msg'), advice: tr(lang, 'wa_thunder_advice'),
      });
    }
  }

  // Multi-day patterns
  const rh = d.relative_humidity_2m_mean || [];
  let humidRun = 0;
  for (let i = 0; i < n; i++) {
    const warm = d.temperature_2m_max[i] >= 22 && d.temperature_2m_max[i] <= 32;
    humidRun = rh[i] >= 85 && warm ? humidRun + 1 : 0;
    if (humidRun === 3) {
      push({ type: 'disease_risk', level: 'YELLOW', date: d.time[i - 2], key: 'disease', msgKey: 'wa_disease_msg' });
    }
  }
  const dry = d.precipitation_sum.slice(0, n).every((r) => (r ?? 0) < 1);
  const hot = d.temperature_2m_max.slice(0, n).filter((t) => t >= 33).length >= 4;
  if (n >= 7 && dry && hot) {
    push({ type: 'dry_spell', level: 'YELLOW', date: d.time[0], key: 'dry', msgKey: 'wa_dry_msg' });
  }

  alerts.sort((a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level] || a.date.localeCompare(b.date));
  const highest = alerts[0]?.level || 'GREEN';
  return { highest, alerts };
}
