// Small helpers for calling the Python micro-services.

export async function fetchWithTimeout(url, opts = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function ping(url, timeoutMs = 2500) {
  const started = Date.now();
  try {
    const r = await fetchWithTimeout(url, {}, timeoutMs);
    return { up: r.ok, status: r.status, ms: Date.now() - started };
  } catch (e) {
    return { up: false, error: e.name === 'AbortError' ? 'timeout' : e.cause?.code || e.message };
  }
}

/** Wrap async express handlers so thrown errors become JSON responses. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
