// AI results (crop plans, fertilizer plans, pest advice) that follow the language switch instantly:
//  • results are kept per language on this device;
//  • switching to a language seen before shows that copy at once;
//  • a new language is translated from the existing result (one quick call, cached on the server
//    too) instead of asking the AI to think again — and the old text stays visible meanwhile.
import { useEffect, useRef, useState } from 'react';
import { Language } from '../types';
import { api } from '../services/config';

interface Stored<T> { base: Language; byLang: Partial<Record<Language, T>> }

const read = <T,>(key: string): Stored<T> | null => {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
};
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* quota */ } };

export function useLocalized<T>(storageKey: string, lang: Language, empty: T) {
  const [store, setStore] = useState<Stored<T> | null>(() => read<T>(storageKey));
  const [translating, setTranslating] = useState(false);
  const pending = useRef<string | null>(null);

  useEffect(() => {
    if (!store || store.byLang[lang] !== undefined) return;
    const src = store.byLang[store.base];
    if (src === undefined) return;
    const job = `${lang}`;
    pending.current = job;
    setTranslating(true);
    api<{ data: T }>('/ai/translate', { method: 'POST', json: { data: src, lang } })
      .then((r) => {
        if (pending.current !== job) return;
        setStore((s) => {
          const next = s ? { ...s, byLang: { ...s.byLang, [lang]: r.data } } : s;
          if (next) write(storageKey, next);
          return next;
        });
      })
      .catch(() => { /* keep showing the original language */ })
      .finally(() => { if (pending.current === job) setTranslating(false); });
  }, [lang, store, storageKey]);

  const value: T = store ? (store.byLang[lang] ?? store.byLang[store.base] ?? empty) : empty;
  const setValue = (v: T) => {
    const next: Stored<T> = { base: lang, byLang: { [lang]: v } };
    write(storageKey, next);
    pending.current = null;
    setTranslating(false);
    setStore(next);
  };
  return { value, setValue, translating, shownLang: store && store.byLang[lang] === undefined ? store.base : lang };
}
