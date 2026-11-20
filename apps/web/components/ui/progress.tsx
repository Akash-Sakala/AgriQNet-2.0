// shadcn/ui-style Progress bar. `value` 0–100; transform-only animation.
import React from 'react';
import { cn } from '../../lib/utils';

export const Progress: React.FC<{ value: number; className?: string; label?: string }> = ({ value, className, label }) => (
  <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-label={label}
    className={cn('relative h-2.5 w-full overflow-hidden rounded-full bg-agri-100', className)}>
    <div className="h-full w-full origin-left rounded-full bg-agri-700 transition-transform duration-500 ease-out"
      style={{ transform: `scaleX(${Math.max(0, Math.min(100, value)) / 100})` }} />
  </div>
);

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div aria-hidden className={cn('shimmer rounded-xl', className)} />
);
