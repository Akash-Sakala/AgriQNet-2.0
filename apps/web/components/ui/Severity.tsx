import React from 'react';

/** How bad: 1, 2 or 3 filled bars — readable without colour, coloured for quick scanning. */
const LEVEL = { YELLOW: { n: 1, c: '#C9A227' }, ORANGE: { n: 2, c: '#C2620A' }, RED: { n: 3, c: '#B3261E' } } as const;
export const SeverityMeter: React.FC<{ level: keyof typeof LEVEL; size?: 'sm' | 'md' }> = ({ level, size = 'md' }) => {
  const { n, c } = LEVEL[level];
  const h = size === 'sm' ? [8, 12, 16] : [14, 22, 30];
  return (
    <span aria-hidden className={`inline-flex items-end ${size === 'sm' ? 'gap-[3px]' : 'gap-1.5'}`}>
      {h.map((hh, i) => (
        <span key={i} className={`${size === 'sm' ? 'w-[5px]' : 'w-2.5'} rounded-full`} style={{ height: hh, background: i < n ? c : 'rgba(30,42,36,.12)' }} />
      ))}
    </span>
  );
};
