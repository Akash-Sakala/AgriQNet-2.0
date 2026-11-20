// Display preferences kept on this device: Sunlight (high-contrast) theme and Reduce motion.
// Applied to <html> as data-theme="sun" / data-motion="reduce" (see styles/index.css and tokens.css).
import { useEffect, useState } from 'react';

export interface DisplayPrefs { sun: boolean; reduceMotion: boolean }
const KEY = 'agriqnet_display';

export function readPrefs(): DisplayPrefs {
  try { return { sun: false, reduceMotion: false, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { sun: false, reduceMotion: false }; }
}

export function applyPrefs(p: DisplayPrefs) {
  const el = document.documentElement;
  if (p.sun) el.setAttribute('data-theme', 'sun'); else el.removeAttribute('data-theme');
  if (p.reduceMotion) el.setAttribute('data-motion', 'reduce'); else el.removeAttribute('data-motion');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.sun ? '#FFFFFF' : '#1F4D3A');
}

export function useDisplayPrefs() {
  const [prefs, setPrefs] = useState<DisplayPrefs>(readPrefs);
  useEffect(() => {
    applyPrefs(prefs);
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
  }, [prefs]);
  return {
    prefs,
    toggleSun: () => setPrefs((p) => ({ ...p, sun: !p.sun })),
    toggleMotion: () => setPrefs((p) => ({ ...p, reduceMotion: !p.reduceMotion })),
  };
}
