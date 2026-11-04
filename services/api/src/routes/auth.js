// Accounts, OTP and SMS.
// New paths live under /api/auth, /api/otp and /api/sms; the original main-app paths
// (/api/check-user, /api/register, /api/login, /api/send-sms) are kept as aliases.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { User, Farmer, Otp, SmsLog, nextId } from '../models/index.js';
import { normalizePhone, sendSms, smsStatus } from '../lib/sms.js';
import { matchDistrict } from '../lib/districts.js';
import { applyActiveAlertsToFarmer } from '../lib/alertEngine.js';
import { tr, normLang } from '../lib/i18n.js';
import { ah } from '../lib/http.js';
import { issueToken, optionalAuth } from '../lib/auth.js';

const router = Router();
const hashOtp = (phone, code) => crypto.createHash('sha256').update(`${phone}:${code}`).digest('hex');

// ---------------- Accounts ----------------
const checkUser = ah(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  res.json({ exists: Boolean(await User.exists({ phone })) });
});

const register = ah(async (req, res) => {
  const { name, location = '', password } = req.body;
  const phone = normalizePhone(req.body.phone);
  if (!name || !phone || !password) return res.status(400).json({ message: 'name, phone and password are required' });
  if (password.length < 4) return res.status(400).json({ message: 'Password must be at least 4 characters' });
  if (await User.exists({ phone })) return res.status(400).json({ message: 'User already exists' });

  if (config.otp.requireForSignup) {
    const verified = await Otp.findOne({
      phone, purpose: 'signup', verifiedAt: { $gte: new Date(Date.now() - 30 * 60000) },
    });
    if (!verified) return res.status(403).json({ message: 'Phone number not verified. Please complete OTP verification.' });
  }

  const lang = normLang(req.body.lang);
  // District is required: it drives district-specific weather, pest alerts and advice (no GPS needed)
  const district = await matchDistrict(req.body.districtId || location);
  if (!district) return res.status(400).json({ message: 'Please choose your district' });
  const crops = Array.isArray(req.body.crops) ? req.body.crops.slice(0, 8).map(String) : [];
  const user = await User.create({
    name, phone, location: location || district.name, lang, crops, districtId: district.id, passwordHash: await bcrypt.hash(password, 10),
  });

  // Every registered farmer automatically becomes a pest-alert recipient for their district.
  let subscription = null;
  if (district) {
    const existing = await Farmer.findOne({ phone, districtId: district.id });
    subscription = existing || (await Farmer.create({
      id: await nextId('farmer', 'F'), name, phone, districtId: district.id, userId: String(user._id), source: 'app-signup', lang,
    }));
    if (!existing) await applyActiveAlertsToFarmer(subscription);
  }
  await Otp.deleteMany({ phone, purpose: 'signup' });

  res.status(201).json({ success: true, user: user.toPublic(), token: issueToken(user), subscription, district: { id: district.id, name: district.name } });
});

const login = ah(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const user = await User.findOne({ phone });
  if (!user) return res.status(404).json({ message: 'Phone number not found' });
  if (!(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) {
    return res.status(401).json({ message: 'Incorrect password' });
  }
  res.json({ success: true, user: user.toPublic(), token: issueToken(user) });
});

router.post('/auth/check-user', checkUser);
router.post('/auth/register', register);
router.post('/auth/login', login);
// Update language / district / crops / name of the logged-in user (keeps the alert subscription in sync)
router.put('/auth/profile', optionalAuth, ah(async (req, res) => {
  if (!req.auth) return res.status(401).json({ message: 'Please log in again' });
  const user = await User.findById(req.auth.uid);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const { lang, districtId, crops, name } = req.body;
  if (lang) user.lang = normLang(lang);
  if (name) user.name = String(name).slice(0, 80);
  if (Array.isArray(crops)) user.crops = crops.slice(0, 8).map(String);
  if (districtId && districtId !== user.districtId) {
    const d = await matchDistrict(districtId);
    if (!d) return res.status(400).json({ message: 'Unknown district' });
    user.districtId = d.id;
    user.location = d.name;
  }
  await user.save();
  if (user.districtId) {
    const f = await Farmer.findOne({ userId: String(user._id) });
    if (f) {
      f.districtId = user.districtId; f.lang = user.lang; f.name = user.name; await f.save();
    } else if (!user.isDemo || user.role === 'farmer') {
      const nf = await Farmer.create({ id: await nextId('farmer', 'F'), name: user.name, phone: user.phone, districtId: user.districtId, userId: String(user._id), source: 'app-signup', lang: user.lang, isDemo: user.isDemo }).catch(() => null);
      if (nf) await applyActiveAlertsToFarmer(nf);
    }
  }
  res.json({ success: true, user: user.toPublic() });
}));

router.post('/check-user', checkUser); // legacy
router.post('/register', register); // legacy
router.post('/login', login); // legacy

// ---------------- OTP ----------------
router.post('/otp/send', ah(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const purpose = req.body.purpose || 'signup';
  if (!/^\+\d{8,15}$/.test(phone)) return res.status(400).json({ success: false, message: 'Invalid phone number' });

  const recent = await Otp.findOne({ phone, purpose, expiresAt: { $gt: new Date() } }).sort({ expiresAt: -1 });
  if (recent && recent.expiresAt - Date.now() > (config.otp.ttlMinutes * 60000 - 30000)) {
    return res.status(429).json({ success: false, message: 'Please wait 30 seconds before requesting another OTP.' });
  }

  const code = String(crypto.randomInt(100000, 1000000));
  await Otp.deleteMany({ phone, purpose, verifiedAt: null });
  await Otp.create({ phone, purpose, codeHash: hashOtp(phone, code), expiresAt: new Date(Date.now() + config.otp.ttlMinutes * 60000) });

  const lang = normLang(req.body.lang);
  const prefix = req.body.message || tr(lang, purpose === 'subscribe' ? 'otp_subscribe' : 'otp_signup');
  const result = await sendSms({ to: phone, body: tr(lang, 'sms_otp', { prefix, code }), context: `otp:${purpose}` });

  if (result.status === 'failed') return res.status(502).json({ success: false, message: 'SMS provider error', error: result.error });
  // In simulation mode the code is returned so the UI can show it (demo banner). Never in real mode.
  // When the SMS could not be delivered the code is returned so the person is not locked out.
  res.json({ success: true, isMock: result.isMock, ...(result.isMock ? { devOtp: code } : {}) });
}));

router.post('/otp/verify', ah(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const purpose = req.body.purpose || 'signup';
  const code = String(req.body.otp || req.body.code || '').trim();
  const otp = await Otp.findOne({ phone, purpose, verifiedAt: null, expiresAt: { $gt: new Date() } }).sort({ expiresAt: -1 });
  if (!otp) return res.status(400).json({ success: false, message: 'OTP expired or not requested' });
  if (otp.attempts >= 5) return res.status(429).json({ success: false, message: 'Too many attempts. Request a new OTP.' });
  if (otp.codeHash !== hashOtp(phone, code)) {
    otp.attempts += 1;
    await otp.save();
    return res.status(400).json({ success: false, message: 'Invalid OTP' });
  }
  otp.verifiedAt = new Date();
  await otp.save();
  res.json({ success: true });
}));

// ---------------- SMS ----------------
const sendSmsRoute = ah(async (req, res) => {
  const to = req.body.to || req.body.phone;
  const body = req.body.body || req.body.message;
  if (!to || !body) return res.status(400).json({ success: false, message: "Missing 'to' or 'body'" });
  const r = await sendSms({ to, body, context: 'manual' });
  res.status(r.status === 'failed' ? 502 : 200).json({ success: r.status !== 'failed', isMock: r.isMock, ...r });
});
router.post('/sms/send', sendSmsRoute);
router.post('/send-sms', sendSmsRoute); // legacy

router.get('/sms/status', (req, res) => res.json(smsStatus()));
router.get('/sms/log', optionalAuth, ah(async (req, res) => {
  if (req.auth?.role !== 'officer') return res.status(403).json({ error: 'Officers only' });
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  res.json(await SmsLog.find().sort({ createdAt: -1 }).limit(limit).lean());
}));

export default router;
