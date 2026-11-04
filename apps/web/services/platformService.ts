import type { MlDetails } from '../components/ui/MlExtras';
import { api } from "./config";
import { pestLabel, cropGroupLabel, pestTips } from "../utils/pests";
import type { Language } from "../types";

export interface District { id: string; name: string; geo?: { lat: number; lon: number }; majorCrops?: string[]; meta?: { population: number; area_sq_km: number } }
export interface Edge { districtAId: string; districtBId: string }
export interface PestDetection {
  pestType: string | null;
  localName?: string;
  localCrop?: string;
  confidence?: number;
  model?: string;
  crop?: string;
  defaultSeverity?: 'RED' | 'ORANGE' | 'YELLOW';
  management?: string[];
  detections?: { pestType: string; confidence: number }[];
  yoloError?: string;
  gemini?: any;
}
export interface AlertReport {
  /** sent = farmers warned now; pending = waiting for an officer; already_active = same pest already alerted here */
  outcome: 'sent' | 'pending' | 'already_active';
  newAlert: { id: string; pestType: string; reportedDistrictId: string; severity: string; status: string };
  stats?: { red: number; orange: number; yellow: number; smsSent: number; smsSimulated: number; smsFailed: number };
  affectedDistricts?: { id: string; name: string; hops: number; zone: string }[];
  summary?: string;
}
export interface TwilioSetup { configured: boolean; mode: string; from: string | null; accountType: string | null; status: string | null; verifiedNumbers: string[]; error: string | null }
export interface DistrictAdvice { districtId: string; season: string; month: string; headline: string; tips: { icon: string; title: string; text: string }[]; cached?: boolean }
export interface FarmerRow { id: string; name: string; phone: string; districtId: string; lang?: string; createdAt?: string }
export interface PestInfo { classId: number; name: string; localName: string; crop: string; localCrop: string; defaultSeverity: 'RED' | 'ORANGE' | 'YELLOW'; management: string[] }

let pestList: Promise<PestInfo[]> | null = null;
/** English pest name -> info in the farmer's language. One download, then names come from the
 *  bundled translations, so switching language is instant. */
export function pestDictionary(lang: string) {
  pestList ||= PlatformService.getPests('en').catch(() => { pestList = null; return []; });
  const l = lang as Language;
  return pestList.then((list) => Object.fromEntries(list.map((p) => [p.name.toLowerCase(), {
    ...p, localName: pestLabel(l, p.name), localCrop: cropGroupLabel(l, p.crop), management: pestTips(l, p.crop, p.management),
  }])) as Record<string, PestInfo>);
}
export const localPestName = (dict: Record<string, PestInfo>, english: string) => dict[String(english || '').toLowerCase()]?.localName || english;

export interface WeatherAlert { type: string; level: 'RED' | 'ORANGE' | 'YELLOW'; date: string; title: string; message: string; advice: string }

/** Pest-alert network, YOLO detection, ML recommenders, RAG and weather alerts. */
export const PlatformService = {
  getDistricts: () => api<District[]>('/districts'),
  getEdges: () => api<Edge[]>('/districts/edges'),
  getAlerts: () => api<any[]>('/alerts'),
  health: () => api<any>('/health'),

  async detectPest(file: File, lang = 'en'): Promise<PestDetection> {
    const form = new FormData();
    form.append('image', file);
    return api<PestDetection>(`/pest/detect?fallback=gemini&lang=${lang}`, { method: 'POST', body: form });
  },

  /** Farmers: sent at once when the photo check is confident (or 2+ farmers report it), else an officer checks. */
  reportAlert: (districtId: string, severity: string, pestType: string, confidence?: number, reportedBy?: string, model?: string) =>
    api<AlertReport>('/alerts', { method: 'POST', json: { districtId, severity, pestType, confidence, reportedBy, model } }),
  approveAlert: (id: string, severity?: string) => api<AlertReport>(`/alerts/${id}/approve`, { method: 'POST', json: { severity } }),
  rejectAlert: (id: string) => api<{ success: boolean }>(`/alerts/${id}/reject`, { method: 'POST', json: {} }),
  cancelAlert: (id: string) => api<{ success: boolean }>(`/alerts/${id}/cancel`, { method: 'PUT' }),
  smsSetup: () => api<TwilioSetup>('/sms/setup'),
  smsTest: (to: string, lang: string) => api<{ status: string; error?: string }>('/sms/test', { method: 'POST', json: { to, lang } }),
  advice: (districtId: string, crops: string[] = [], lang = 'en') => api<DistrictAdvice>(`/advice?districtId=${districtId}&crops=${encodeURIComponent(crops.join(','))}&lang=${lang}`),
  getFarmers: () => api<FarmerRow[]>('/farmers'),
  getRecipients: () => api<{ alertId: string; farmerId: string; districtId: string; zone: string }[]>('/recipients'),
  addFarmer: (f: { name: string; phone: string; districtId: string; lang?: string }) => api<{ farmer: FarmerRow; message: string }>('/farmers', { method: 'POST', json: f }),
  getPests: (lang = 'en') => api<PestInfo[]>(`/pests?lang=${lang}`),

  recommendCrop: (payload: Record<string, number | string>) => api<{ prediction: string; details?: MlDetails; source?: string }>('/recommend/crop', { method: 'POST', json: payload }),
  recommendFertilizer: (payload: Record<string, number | string>) => api<{ prediction: string; details?: MlDetails; source?: string }>('/recommend/fertilizer', { method: 'POST', json: payload }),

  ragChat: (message: string, lang = 'en') => api<{ response: string; sources?: { n: number; title: string; page: number; bookId: string }[] }>('/rag/chat', { method: 'POST', json: { message, lang } }),

  weatherAlerts: (q: { lat?: number; lon?: number; districtId?: string; district?: string; lang?: string }) => {
    const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
    return api<{ location: any; highest: string; alerts: WeatherAlert[] }>(`/weather/alerts?${p}`);
  },
};

/** BFS with hop distance (client-side preview of alert zones). */
export function zonesFor(start: string, edges: Edge[], depth = 2) {
  const adj = new Map<string, string[]>();
  for (const { districtAId: a, districtBId: b } of edges) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }
  const dist = new Map<string, number>([[start, 0]]);
  const q = [start];
  while (q.length) {
    const n = q.shift()!;
    const d = dist.get(n)!;
    if (d >= depth) continue;
    for (const m of adj.get(n) || []) if (!dist.has(m)) { dist.set(m, d + 1); q.push(m); }
  }
  const by = (h: number) => [...dist.entries()].filter(([, v]) => v === h).map(([k]) => k);
  return { red: by(0), orange: by(1), yellow: by(2) };
}
