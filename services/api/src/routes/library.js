// Farmer Library: thin, streaming proxy to the AgriRAG service (services/agri-rag, port 8003).
// The gateway checks the login token and passes who is asking as X-User-* headers, so the
// library knows who uploaded a book and who may hide one (officers only).
import { Router } from 'express';
import { Readable } from 'node:stream';
import { config } from '../config.js';
import { optionalAuth } from '../lib/auth.js';
import { User } from '../models/index.js';

const router = Router();
const names = new Map(); // uid -> display name (small cache)

async function userHeaders(req) {
  const a = req.auth;
  if (!a?.uid) return {};
  let name = names.get(a.uid);
  if (name === undefined) {
    name = (await User.findById(a.uid).select('name').lean().catch(() => null))?.name || '';
    names.set(a.uid, name);
  }
  return { 'X-User-Id': a.uid, 'X-User-Name': encodeURIComponent(name), 'X-User-Role': a.role || 'farmer' };
}

const unreachable = (e) => Object.assign(
  new Error(`The library service is not running (${config.services.rag}). Start it with "npm start" (${e.cause?.code || e.message}).`),
  { status: 503 },
);

router.use('/library', optionalAuth, async (req, res, next) => {
  try {
    const target = `${config.services.rag}/library${req.url}`; // req.url keeps the query string
    const headers = { ...(await userHeaders(req)) };
    const init = { method: req.method, headers };
    const isUpload = (req.headers['content-type'] || '').startsWith('multipart/form-data');
    if (isUpload) {
      // stream the PDF straight through (no buffering in the gateway)
      headers['content-type'] = req.headers['content-type'];
      if (req.headers['content-length']) headers['content-length'] = req.headers['content-length'];
      init.body = req;
      init.duplex = 'half';
    } else if (!['GET', 'HEAD'].includes(req.method)) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(req.body ?? {});
    }
    // chat answers and uploads can take a while; everything else is quick
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), isUpload || req.url.startsWith('/chat') ? 180000 : 30000);
    let r;
    try {
      r = await fetch(target, { ...init, signal: ctrl.signal, redirect: 'manual' });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw Object.assign(new Error('The library took too long to answer. Please try again.'), { status: 504 });
      throw unreachable(e);
    }
    clearTimeout(timer);
    res.status(r.status);
    for (const h of ['content-type', 'content-length', 'cache-control', 'content-disposition', 'location']) {
      const v = r.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (!r.body || r.status === 204 || (r.status >= 300 && r.status < 400)) return res.end();
    const ctype = r.headers.get('content-type') || '';
    if (ctype.includes('application/json')) {
      const data = await r.json();
      // FastAPI errors are {detail}; the app expects {error}
      if (r.status >= 400 && data && data.detail && !data.error) return res.json({ error: typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail) });
      return res.json(data);
    }
    Readable.fromWeb(r.body).pipe(res);
  } catch (e) {
    next(e);
  }
});

export default router;
