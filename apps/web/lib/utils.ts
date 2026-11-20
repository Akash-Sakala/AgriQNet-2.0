import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui helper: join class names and let later Tailwind classes win. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { useEffect, useState } from 'react';
/** true while the media query matches (e.g. '(min-width: 1024px)'). */
export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}
