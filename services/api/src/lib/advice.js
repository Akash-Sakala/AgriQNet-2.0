// District-specific weekly advice (the most common complaint about farm apps is generic advice).
// Context = district + its usual crops + farmer's crops + season + 7-day forecast + pest alerts
// reaching the district. Cached for a day per district/crops/language to save AI quota.
import { Advice, Alert, District, Edge } from '../models/index.js';
import { fetchForecast, computeAlerts } from './weatherAlerts.js';
import { bfsWithDistance, SeverityConfig } from './graph.js';
import { districtAdvice, translateJson } from './gemini.js';
import { normLang } from './i18n.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Karnataka cropping seasons: Kharif (Jun–Sep), Rabi (Oct–Jan), Summer (Feb–May). */
export function seasonOf(date) {
  const m = date.getMonth();
  const season = m >= 5 && m <= 8 ? 'Kharif (monsoon)' : m >= 9 || m === 0 ? 'Rabi (winter)' : 'Summer';
  return { month: MONTHS[m], season };
}

async function weatherSummary(d) {
  try {
    const fc = await fetchForecast(d.geo.lat, d.geo.lon, 7);
    const dd = fc.daily;
    const rain = dd.precipitation_sum.reduce((a, b) => a + (b || 0), 0);
    const rainyDays = dd.precipitation_sum.filter((r) => r >= 2.5).length;
    const tmax = Math.max(...dd.temperature_2m_max);
    const tmin = Math.min(...dd.temperature_2m_min);
    const alerts = computeAlerts(fc, 7, 'en').alerts.map((a) => `${a.title} on ${a.date}`);
    return `${tmin.toFixed(0)}–${tmax.toFixed(0)} °C, ${rain.toFixed(0)} mm rain over ${rainyDays} rainy days${alerts.length ? `; warnings: ${alerts.slice(0, 3).join(', ')}` : ''}`;
  } catch {
    return 'forecast unavailable';
  }
}

async function pestsReaching(districtId) {
  const [active, edges] = await Promise.all([Alert.find({ status: 'ACTIVE' }).lean(), Edge.find().lean()]);
  return active
    .filter((a) => bfsWithDistance(a.reportedDistrictId, edges, SeverityConfig[a.severity].propagationDepth).has(districtId))
    .map((a) => `${a.pestType} (reported in ${a.reportedDistrictId})`);
}

export async function getDistrictAdvice({ districtId, crops = [], lang = 'en', refresh = false }) {
  const d = await District.findOne({ id: districtId }).lean();
  if (!d) throw Object.assign(new Error('Unknown district'), { status: 400 });
  lang = normLang(lang);
  const day = new Date().toISOString().slice(0, 10);
  const key = `${day}|${d.id}|${[...crops].sort().join(',')}|${lang}`;
  if (!refresh) {
    const hit = await Advice.findOne({ key }).lean();
    if (hit) return { ...hit.data, cached: true };
  }
  const { month, season } = seasonOf(new Date());
  // Same advice already written today in another language? Translate it (faster, and every
  // language shows the same advice) instead of generating new advice.
  if (!refresh) {
    const prefix = key.slice(0, key.lastIndexOf('|') + 1);
    const other = await Advice.findOne({ key: { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } }).lean();
    if (other) {
      try {
        const { headline, tips } = other.data;
        const tr = await translateJson({ headline, tips: tips.map(({ icon, topic, ...rest }) => rest) }, lang);
        const data = { ...other.data, headline: tr.headline, tips: tips.map((tip, i) => ({ icon: tip.icon, topic: tip.topic, title: tr.tips?.[i]?.title || tip.title, text: tr.tips?.[i]?.text || tip.text })) };
        await Advice.updateOne({ key }, { $set: { key, data, createdAt: new Date() } }, { upsert: true });
        return data;
      } catch { /* fall back to generating */ }
    }
  }
  const ctx = {
    district: d.name, majorCrops: d.majorCrops || [], crops, month, season,
    weather: await weatherSummary(d), pests: await pestsReaching(d.id),
  };
  const advice = await districtAdvice(ctx, lang);
  const data = { districtId: d.id, season, month, ...advice, generatedAt: new Date().toISOString() };
  await Advice.updateOne({ key }, { $set: { key, data, createdAt: new Date() } }, { upsert: true });
  return data;
}
