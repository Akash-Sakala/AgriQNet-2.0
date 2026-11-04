// Farmer Library API (gateway: /api/library/* -> AgriRAG service)
import { api, API_BASE, authToken } from './config';
import type { Language } from '../types';

export type L10n = Partial<Record<Language, string>>;
export type L10nList = Partial<Record<Language, string[]>>;

export interface Book {
  id: string;
  kind: 'pdf' | 'article';
  status: 'ready' | 'hidden';
  title: L10n;
  summary: L10n;
  questions: L10nList;
  category: string;
  docType?: string;
  publisher: string;
  year: string;
  pages?: number;
  chunks?: number;
  crops: string[];
  topics: string[];
  headings: string[];
  language: string;
  legacyKannada?: boolean;
  cover: 'art' | 'page' | 'photo' | 'none';
  coverUrl: string | null;
  pageUrl: string;
  fileUrl: string;
  sourceUrl: string;
  origin: 'seed' | 'crawl' | 'upload' | 'url' | 'legacy';
  uploadedBy: string;
  mine: boolean;
  createdAt: number;
}

export interface Job {
  id: string;
  kind: 'file' | 'url';
  status: 'queued' | 'running' | 'ready' | 'duplicate' | 'rejected' | 'failed' | 'cancelled';
  stage: string;
  progress: number;
  message: string;
  name: string;
  url?: string;
  origin?: string;
  dupReason?: 'same_file' | 'same_text' | 'near_copy' | 'same_link' | null;
  mine?: boolean;
  book?: Book;
}

export interface AddResult { status: 'queued' | 'duplicate'; job?: Job; book?: Book; reason?: Job['dupReason'] }

export interface Source { n: number; bookId: string; page: number; section: string; title: string; titleEn: string; snippet: string; kind: string; sourceUrl?: string }
export interface Answer { answer: string; sources: Source[]; queryEn?: string; extractive?: boolean }
export interface LastCheck { checkedAt: number; sources: { name: string; new: number; found?: number; error?: string }[]; baseline?: boolean }

export const pick = (m: L10n | undefined, lang: Language) => (m && (m[lang] || m.en)) || '';
export const pickList = (m: L10nList | undefined, lang: Language) => (m && ((m[lang] && m[lang]!.length ? m[lang] : m.en) || [])) || [];

/** Upload with progress (fetch has no upload progress, so XMLHttpRequest). */
function uploadPdf(file: File, onProgress: (f: number) => void): Promise<AddResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/library/upload`);
    const token = authToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let data: any = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      const err: any = new Error(data?.error || data?.detail || `Upload failed (${xhr.status})`);
      err.status = xhr.status;
      reject(err);
    };
    xhr.onerror = () => reject(Object.assign(new Error('network'), { status: 0 }));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

export const LibraryService = {
  list: (all = false) => api<{ books: Book[]; queue: Job[]; lastCheck: LastCheck | null }>(`/library/books${all ? '?all=true' : ''}`),
  get: (id: string) => api<Book>(`/library/books/${id}`),
  upload: uploadPdf,
  addUrl: (url: string) => api<AddResult>('/library/url', { method: 'POST', json: { url } }),
  job: (id: string) => api<Job>(`/library/jobs/${id}`),
  myJobs: () => api<{ jobs: Job[] }>('/library/jobs'),
  hide: (id: string, hidden: boolean) => api<{ ok: boolean }>(`/library/books/${id}/hide`, { method: 'POST', json: { hidden } }),
  cancelJob: (id: string) => api<{ cancelled: boolean }>(`/library/jobs/${id}/cancel`, { method: 'POST', json: {} }),
  cancelAutomatic: () => api<{ cancelled: number }>('/library/jobs/cancel-automatic', { method: 'POST', json: {} }),
  checkSources: () => api<{ started: boolean; lastCheck: LastCheck | null }>('/library/sources/check', { method: 'POST', json: {} }),
  chat: (message: string, lang: Language, bookIds: string[] | null, history: { role: string; text: string }[]) =>
    api<Answer>('/library/chat', { method: 'POST', json: { message, lang, bookIds, history } }),
};
