// Runtime URLs for the sibling apps/services. Values come from VITE_* variables in
// agriqnet-platform/.env (see vite.config.ts `envDir`), with localhost defaults.
const env = (import.meta as any).env || {};

export const API_BASE = '/api'; // proxied to the AgriQNet API by Vite (see vite.config.ts)
export const WEATHER_APP_URL: string = env.VITE_WEATHER_APP_URL || 'http://localhost:5175';
export const AGRI_RAG_URL: string = env.VITE_AGRI_RAG_URL || 'http://localhost:8003';

/** Signed session token saved at login (lets officers approve/cancel alerts). */
export function authToken(): string | null {
  try { return JSON.parse(localStorage.getItem('agriqnet_current_farmer') || 'null')?.token || null; } catch { return null; }
}

/** fetch JSON from the API; throws Error(message) on non-2xx. */
export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const token = authToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((headers as Record<string, string>) || {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err: any = new Error(data?.message || data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}
