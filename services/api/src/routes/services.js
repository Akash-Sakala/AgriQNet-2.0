// Gateways to the Python micro-services + weather alerts + platform health.
import { Router } from 'express';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { District, Farmer } from '../models/index.js';
import { ah, fetchWithTimeout, ping } from '../lib/http.js';
import { fetchForecast, computeAlerts } from '../lib/weatherAlerts.js';
import { sendSms, smsStatus } from '../lib/sms.js';
import { matchDistrict } from '../lib/districts.js';
import { tr, normLang, districtLabel } from '../lib/i18n.js';
import { getDistrictAdvice } from '../lib/advice.js';
import { synthesize, ttsStatus } from '../lib/tts.js';
import { optionalAuth, requireOfficer } from '../lib/auth.js';
import { twilioSetup } from '../lib/sms.js';

const router = Router();

// ---------- Crop / fertilizer recommender (AgriQNet v3 quantum-hybrid models, FastAPI) ----------
async function callRecommender(path, body) {
  const attempts = [
    { source: 'local', base: config.services.recommender, timeout: 20000 },
    ...(config.fallbacks.recommender ? [{ source: 'hosted', base: config.fallbacks.recommender, timeout: 90000 }] : []),
  ];
  let lastErr;
  for (const a of attempts) {
    try {
      const r = await fetchWithTimeout(`${a.base}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }, a.timeout);
      const data = await r.json();
      if (!r.ok) {
        const detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail || data);
        throw Object.assign(new Error(detail || `HTTP ${r.status}`), { status: r.status, final: r.status === 422 });
      }
      return { ...data, source: a.source };
    } catch (e) {
      lastErr = e;
      if (e.final) break; // validation errors won't improve on the fallback
    }
  }
  if (lastErr?.final) throw Object.assign(new Error(`Invalid input: ${lastErr.message}`), { status: 422 });
  throw Object.assign(new Error(`Recommender unavailable: ${lastErr?.message}`), { status: 503 });
}

router.post('/recommend/crop', ah(async (req, res) => res.json(await callRecommender('/api/crop_recommender/predict', req.body))));
router.post('/recommend/fertilizer', ah(async (req, res) => res.json(await callRecommender('/api/fertilizer_recommender/predict', req.body))));

// ---------- AgriRAG (documents Q&A) ----------
// Older callers: "Agri Docs" chat over the whole Farmer Library. New screens use /api/library/*.
router.post('/rag/chat', ah(async (req, res) => {
  const message = req.body.message;
  const lang = normLang(req.body.lang);
  if (!message) return res.status(400).json({ error: 'message is required' });
  const r = await fetchWithTimeout(`${config.services.rag}/library/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, lang, bookIds: req.body.bookIds || null, history: req.body.history || [] }),
  }, 180000).catch((e) => { throw Object.assign(new Error(`AgriRAG unreachable at ${config.services.rag} (${e.cause?.code || e.message})`), { status: 503 }); });
  const data = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: data.detail || data.error || 'AgriRAG failed' });
  res.json({ response: data.answer, sources: data.sources || [] });
}));
router.get('/rag/processed', ah(async (req, res) => {
  const r = await fetchWithTimeout(`${config.services.rag}/processed`, {}, 10000);
  res.status(r.status).json(await r.json());
}));

// ---------- Weather alerts ----------
async function resolveLocation(q) {
  if (q.lat && q.lon) return { lat: Number(q.lat), lon: Number(q.lon), label: q.label || `${q.lat},${q.lon}` };
  const d = (await District.findOne({ id: q.districtId }).lean()) || (await matchDistrict(q.district || q.districtId));
  if (!d) throw Object.assign(new Error('Provide lat & lon, or a districtId / district'), { status: 400 });
  return { lat: d.geo.lat, lon: d.geo.lon, label: d.name, districtId: d.id };
}

router.get('/weather/forecast', ah(async (req, res) => {
  const loc = await resolveLocation(req.query);
  res.json({ location: loc, ...(await fetchForecast(loc.lat, loc.lon, Number(req.query.days) || 16)) });
}));

// Weather right now for the home screen (district based; cached 10 min per place)
const nowCache = new Map();
router.get('/weather/now', ah(async (req, res) => {
  const loc = await resolveLocation(req.query);
  const k = `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
  const hit = nowCache.get(k);
  if (hit && hit.at > Date.now() - 600000) return res.json(hit.data);
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,relative_humidity_2m,weather_code&daily=precipitation_probability_max&forecast_days=1&timezone=auto`);
  if (!r.ok) throw Object.assign(new Error(`Open-Meteo HTTP ${r.status}`), { status: 502 });
  const w = await r.json();
  const data = { location: loc, temp: Math.round(w.current.temperature_2m), code: w.current.weather_code, hum: w.current.relative_humidity_2m, rain: w.daily?.precipitation_probability_max?.[0] ?? 0 };
  nowCache.set(k, { at: Date.now(), data });
  res.json(data);
}));

router.get('/weather/alerts', ah(async (req, res) => {
  const loc = await resolveLocation(req.query);
  const fc = await fetchForecast(loc.lat, loc.lon, 16);
  res.json({ location: loc, generatedAt: new Date().toISOString(), ...computeAlerts(fc, Number(req.query.days) || 7, normLang(req.query.lang)) });
}));

// All districts at a glance (used by the dashboards).
router.get('/weather/alerts/districts', ah(async (req, res) => {
  const districts = await District.find().lean();
  const out = await Promise.all(districts.map(async (d) => {
    try {
      const { highest, alerts } = computeAlerts(await fetchForecast(d.geo.lat, d.geo.lon, 7), 7, normLang(req.query.lang));
      return { districtId: d.id, name: d.name, highest, count: alerts.length, top: alerts[0] || null };
    } catch (e) {
      return { districtId: d.id, name: d.name, highest: 'UNKNOWN', error: e.message };
    }
  }));
  res.json(out);
}));

// Push RED/ORANGE weather alerts for a district to its subscribed farmers.
router.post('/weather/alerts/notify', ah(async (req, res) => {
  const loc = await resolveLocation(req.body);
  if (!loc.districtId) return res.status(400).json({ error: 'districtId required' });
  const fc = await fetchForecast(loc.lat, loc.lon, 7);
  const { alerts } = computeAlerts(fc, 7, 'en');
  const serious = alerts.filter((a) => a.level === 'RED' || a.level === 'ORANGE');
  if (!serious.length) return res.json({ sent: 0, message: 'No orange/red weather alerts for this district.' });
  const farmers = await Farmer.find({ districtId: loc.districtId, active: true }).lean();
  const results = [];
  for (const f of farmers) {
    // each farmer gets the advisory in their own language
    const a = computeAlerts(fc, 7, f.lang || 'en').alerts.find((x) => x.type === serious[0].type && x.date === serious[0].date) || serious[0];
    const body = tr(f.lang, 'sms_weather', { district: districtLabel(f.lang, loc.districtId, loc.label), date: a.date, title: a.title, message: a.message, advice: a.advice });
    results.push((await sendSms({ to: f.phone, body, context: `weather:${loc.districtId}`, forceSimulate: f.isDemo })).status);
  }
  res.json({ alert: serious[0], recipients: farmers.length, sent: results.filter((s) => s === 'sent').length });
}));

// ---------- District advice (this week, for this district + crops) ----------
router.get('/advice', ah(async (req, res) => {
  const crops = String(req.query.crops || '').split(',').map((c) => c.trim()).filter(Boolean);
  res.json(await getDistrictAdvice({ districtId: req.query.districtId, crops, lang: req.query.lang, refresh: req.query.refresh === '1' }));
}));

// ---------- Read-aloud (Sarvam Bulbul) — used when the device has no voice for the language ----------
router.get('/tts/status', (req, res) => res.json(ttsStatus()));
router.post('/tts', ah(async (req, res) => {
  const { text, lang = 'en' } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text is required' });
  const wav = await synthesize(String(text), normLang(lang));
  res.set('Content-Type', 'audio/wav').set('Cache-Control', 'private, max-age=86400').send(wav);
}));

// ---------- SMS setup (Twilio trial) — officers only ----------
router.get('/sms/setup', optionalAuth, requireOfficer, ah(async (req, res) => res.json(await twilioSetup())));
router.post('/sms/test', optionalAuth, requireOfficer, ah(async (req, res) => {
  const to = req.body?.to;
  if (!to) return res.status(400).json({ error: 'to is required' });
  const r = await sendSms({ to, body: tr(normLang(req.body.lang), 'sms_test'), context: 'test', strict: true });
  res.status(r.status === 'sent' ? 200 : 502).json(r);
}));

// ---------- Health ----------
router.get('/health', ah(async (req, res) => {
  const [pestDetector, recommender, rag] = await Promise.all([
    ping(`${config.services.pestDetector}/health`),
    ping(`${config.services.recommender}/health`),
    ping(`${config.services.rag}/health`),
  ]);
  const mongoStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({
    api: 'up',
    mongo: mongoStates[mongoose.connection.readyState] || 'unknown',
    services: { pestDetector, recommender, rag },
    sms: smsStatus(),
    gemini: { configured: Boolean(config.gemini.apiKey), model: config.gemini.model },
    tts: ttsStatus(),
    time: new Date().toISOString(),
  });
}));

export default router;
