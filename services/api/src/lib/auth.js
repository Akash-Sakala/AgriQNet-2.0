// Minimal signed-token auth (HMAC-SHA256), enough to separate farmers from officers.
// The secret comes from AUTH_SECRET in .env, or is generated once and kept in AGRIQNET_HOME.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { runtimeHome } from '../config.js';

function loadSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  const file = path.join(runtimeHome(), 'auth-secret');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const s = crypto.randomBytes(32).toString('hex');
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, s); } catch { /* memory only */ }
    return s;
  }
}
const SECRET = loadSecret();
const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

export function issueToken(user, days = 30) {
  const payload = b64(JSON.stringify({ uid: String(user._id), role: user.role || 'farmer', exp: Date.now() + days * 864e5 }));
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

/** Sets req.auth = { uid, role } when a valid Bearer token is sent (never rejects). */
export function optionalAuth(req, _res, next) {
  const h = req.headers.authorization || '';
  req.auth = h.startsWith('Bearer ') ? verifyToken(h.slice(7)) : null;
  next();
}

export function requireOfficer(req, res, next) {
  if (req.auth?.role === 'officer') return next();
  return res.status(403).json({ error: 'Only an agriculture officer can do this.' });
}
