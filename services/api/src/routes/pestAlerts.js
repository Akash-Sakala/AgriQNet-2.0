// District graph, farmers (alert recipients), alerts, pests and YOLO detection.
// Paths are identical to the original farmer-pest-alert-system backend, so its dashboard works unchanged.
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { Alert, AlertRecipient, District, Edge, Farmer, Pest, nextId } from '../models/index.js';
import { applyActiveAlertsToFarmer, reportAlert, submitFarmerReport, approveAlert } from '../lib/alertEngine.js';
import { optionalAuth, requireOfficer } from '../lib/auth.js';
import { bfs } from '../lib/graph.js';
import { normalizePhone } from '../lib/sms.js';
import { matchDistrict } from '../lib/districts.js';
import { analyzePestImage } from '../lib/gemini.js';
import { localisePest, normLang } from '../lib/i18n.js';
import { ah, fetchWithTimeout } from '../lib/http.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// ---------- Districts ----------
router.get('/districts', ah(async (req, res) => res.json(await District.find().sort({ name: 1 }).lean())));
router.get('/districts/edges', ah(async (req, res) => res.json(await Edge.find().lean())));
router.get('/districts/match', ah(async (req, res) => res.json((await matchDistrict(req.query.q)) || null)));
router.post('/districts', ah(async (req, res) => res.json(await District.create(req.body))));
router.post('/districts/edges', ah(async (req, res) => res.json(await Edge.create(req.body))));

// ---------- Farmers (alert recipients) ----------
router.get('/farmers', ah(async (req, res) => {
  const q = { active: true };
  if (req.query.districtId) q.districtId = req.query.districtId;
  res.json(await Farmer.find(q).sort({ createdAt: 1 }).lean());
}));

router.post('/farmers', ah(async (req, res) => {
  const { name, districtId } = req.body;
  const phone = normalizePhone(req.body.phone);
  if (!name || !phone || !districtId) return res.status(400).json({ error: 'name, phone and districtId are required' });
  if (!(await District.exists({ id: districtId }))) return res.status(400).json({ error: `Unknown district ${districtId}` });
  if (await Farmer.exists({ phone, districtId })) return res.status(409).json({ error: 'This phone is already registered for that district' });

  const farmer = await Farmer.create({ id: await nextId('farmer', 'F'), name, phone, districtId, source: req.body.source || 'dashboard', lang: normLang(req.body.lang || 'kn') });
  const matched = await applyActiveAlertsToFarmer(farmer);
  res.json({ farmer, matchedAlerts: matched.length, message: `Farmer added. ${matched.length} active alerts applied.` });
}));

router.delete('/farmers/:id', ah(async (req, res) => {
  const f = await Farmer.findOneAndUpdate({ id: req.params.id }, { active: false }, { new: true });
  if (!f) return res.status(404).json({ error: 'Farmer not found' });
  res.json({ success: true });
}));

// Main-app subscription (after OTP verification on the client).
router.post('/subscriptions', ah(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const district = (await District.findOne({ id: req.body.districtId }).lean()) || (await matchDistrict(req.body.district));
  if (!phone || !district) return res.status(400).json({ error: 'phone and a valid district are required' });
  let farmer = await Farmer.findOne({ phone, districtId: district.id });
  if (farmer) {
    farmer.active = true;
    if (req.body.lang) farmer.lang = normLang(req.body.lang);
    await farmer.save();
  }
  if (!farmer) {
    farmer = await Farmer.create({
      id: await nextId('farmer', 'F'), name: req.body.name || 'AgriQNet subscriber', phone, districtId: district.id, userId: req.body.userId || null, source: 'app-subscribe', lang: normLang(req.body.lang),
    });
    await applyActiveAlertsToFarmer(farmer);
  }
  res.json({ success: true, farmer, district: { id: district.id, name: district.name } });
}));
router.get('/subscriptions', ah(async (req, res) => {
  const phone = normalizePhone(req.query.phone);
  res.json(await Farmer.find({ phone, active: true }).lean());
}));

// ---------- Alerts ----------
router.get('/alerts', ah(async (req, res) => res.json(await Alert.find().sort({ reportedAt: -1 }).lean())));

// Farmers: the "auto if confident" rule decides (send now or wait for an officer).
// Officers (Bearer token with role=officer): broadcast immediately.
router.post('/alerts', optionalAuth, ah(async (req, res) => {
  const { districtId, severity, pestType, confidence, model } = req.body;
  const district = (await District.findOne({ id: districtId }).lean()) || (await matchDistrict(districtId));
  if (!district) return res.status(400).json({ error: `Unknown district ${districtId}` });
  if (req.auth?.role === 'officer') {
    const r = await reportAlert({
      districtId: district.id, severity, pestType, source: 'officer', reportedBy: req.auth.uid, reason: 'officer',
      detection: confidence !== undefined ? { model: model || 'yolov8-ip102', confidence } : undefined,
    });
    return res.json({ outcome: 'sent', ...r });
  }
  const reportedBy = req.auth?.uid || req.body.reportedBy || null;
  res.json(await submitFarmerReport({ districtId: district.id, severity, pestType, confidence, reportedBy, model }));
}));

router.post('/alerts/:alertId/approve', optionalAuth, requireOfficer, ah(async (req, res) => {
  res.json({ outcome: 'sent', ...(await approveAlert(req.params.alertId, req.auth.uid, req.body?.severity)) });
}));

router.post('/alerts/:alertId/reject', optionalAuth, requireOfficer, ah(async (req, res) => {
  const a = await Alert.findOneAndUpdate({ id: req.params.alertId, status: 'PENDING' }, { status: 'REJECTED', reviewedBy: req.auth.uid }, { new: true });
  if (!a) return res.status(404).json({ error: 'Pending alert not found' });
  res.json({ success: true });
}));

router.put('/alerts/:alertId/cancel', optionalAuth, requireOfficer, ah(async (req, res) => {
  const alert = await Alert.findOneAndUpdate({ id: req.params.alertId }, { status: 'CANCELLED', reviewedBy: req.auth.uid }, { new: true });
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  res.json({ success: true, canceledAlertId: alert.id });
}));

router.get('/alerts/:alertId/recipients', ah(async (req, res) => res.json(await AlertRecipient.find({ alertId: req.params.alertId }).lean())));

// ---------- Recipients ----------
router.get('/recipients', ah(async (req, res) => res.json(await AlertRecipient.find().lean())));
router.delete('/recipients/:id', ah(async (req, res) => {
  await AlertRecipient.findByIdAndDelete(req.params.id);
  res.json({ message: 'Recipient removed' });
}));

// ---------- Pest catalogue ----------
router.get('/pests', ah(async (req, res) => {
  const q = req.query.crop ? { crop: new RegExp(req.query.crop, 'i') } : {};
  const lang = normLang(req.query.lang);
  res.json((await Pest.find(q).sort({ classId: 1 }).lean()).map((p) => localisePest(p, lang)));
}));
router.get('/pests/:name', ah(async (req, res) => {
  const p = await Pest.findOne({ name: new RegExp(`^${req.params.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean();
  if (!p) return res.status(404).json({ error: 'Pest not found' });
  res.json(localisePest(p, normLang(req.query.lang)));
}));

// ---------- Debug ----------
router.get('/test/bfs', ah(async (req, res) => {
  const edges = await Edge.find().lean();
  res.json({ start: req.query.start, depth: Number(req.query.depth), districts: [...bfs(req.query.start, edges, Number(req.query.depth))] });
}));

// ---------- YOLO pest detection (proxy to the Python service) ----------
// Accepts multipart "image" (or "file"). ?fallback=gemini uses Gemini Vision if YOLO is down / finds nothing.
router.post('/pest/detect', upload.any(), ah(async (req, res) => {
  const file = (req.files || []).find((f) => ['image', 'file'].includes(f.fieldname)) || (req.files || [])[0];
  if (!file || !file.size) return res.status(400).json({ error: 'No image provided (multipart field "image")' });
  const useGeminiFallback = req.query.fallback === 'gemini';

  let yolo = null;
  let yoloError = null;
  try {
    const form = new FormData();
    form.append('image', new Blob([file.buffer], { type: file.mimetype || 'image/jpeg' }), file.originalname || 'upload.jpg');
    const r = await fetchWithTimeout(`${config.services.pestDetector}/detect/`, { method: 'POST', body: form }, 60000);
    yolo = await r.json();
    if (!r.ok || yolo.error) yoloError = yolo.error || `HTTP ${r.status}`;
  } catch (e) {
    yoloError = `Pest detector unreachable at ${config.services.pestDetector} (${e.cause?.code || e.message})`;
  }

  if (!yoloError && yolo?.pestType) {
    const pest = localisePest(await Pest.findOne({ name: yolo.pestType }).lean(), normLang(req.query.lang));
    return res.json({
      ...yolo, model: 'yolov8-ip102', crop: pest?.crop, localName: pest?.localName, localCrop: pest?.localCrop,
      defaultSeverity: pest?.defaultSeverity || 'ORANGE', management: pest?.management || [],
    });
  }

  if (useGeminiFallback && config.gemini.apiKey) {
    try {
      const g = await analyzePestImage(file.buffer.toString('base64'), file.mimetype || 'image/jpeg', req.query.lang || 'en');
      const sev = { Critical: 'RED', High: 'RED', Medium: 'ORANGE', Low: 'YELLOW' }[g.severity] || 'ORANGE';
      // Gemini already answers in the requested language
      if (g?.pestName && !/no pest/i.test(g.pestName)) {
        return res.json({ pestType: g.pestName, localName: g.pestName, confidence: g.confidence, model: 'gemini-vision', defaultSeverity: sev, management: g.treatments || [], gemini: g, yoloError });
      }
    } catch (e) {
      console.warn(`[pest] Gemini vision fallback failed: ${String(e.message).slice(0, 120)}`);
    }
  }

  if (yoloError) return res.status(503).json({ error: 'Pest detection service unavailable', detail: yoloError });
  return res.json({ pestType: null, model: 'yolov8-ip102' });
}));

export default router;
