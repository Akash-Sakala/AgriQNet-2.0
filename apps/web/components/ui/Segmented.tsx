// Two or three big options in one bar (role="radiogroup"). Used for "who answers" / "which mode".
import React from 'react';
import type { Icon as PhIcon } from '@phosphor-icons/react';
import { cn } from '../../lib/utils';

export function Segmented<V extends string>({ value, onChange, options, label, className }: {
  value: V; onChange: (v: V) => void; options: { value: V; label: string; icon?: PhIcon }[]; label: string; className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('grid gap-1 p-1 rounded-2xl bg-gray-100 border border-gray-200', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={cn('min-h-[48px] px-2 py-1.5 rounded-xl flex items-center justify-center gap-2 font-semibold leading-tight text-center transition-colors', on ? 'bg-paper text-agri-900 shadow-soft' : 'text-gray-700 hover:text-ink')}>
            {o.icon && <o.icon size={22} weight={on ? 'fill' : 'duotone'} className="shrink-0" aria-hidden />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Big number field with − / + buttons and a numeric keypad (soil test values). */
export const NumberStepper: React.FC<{
  id: string; label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string; hint?: string; decLabel: string; incLabel: string;
}> = ({ id, label, value, onChange, step = 1, min = 0, max = 9999, unit, hint, decLabel, incLabel }) => {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  return (
    <div>
      <label htmlFor={id} className="block font-semibold text-ink mb-1">{label}</label>
      <div className="flex items-stretch gap-2">
        <button type="button" aria-label={`${decLabel} ${label}`} onClick={() => onChange(clamp(value - step))} className="w-12 shrink-0 rounded-2xl bg-gray-100 border border-gray-300 text-2xl font-bold text-gray-800">−</button>
        <div className="flex-1 min-w-0 flex items-center bg-paper border-2 border-gray-300 rounded-2xl px-3 focus-within:border-agri-600">
          <input id={id} type="number" inputMode="decimal" step={step} min={min} max={max} value={Number.isFinite(value) ? value : ''}
            onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} onBlur={() => onChange(clamp(Number.isFinite(value) ? value : min))}
            className="w-full min-w-0 bg-transparent outline-hidden text-xl font-semibold tabular-nums text-ink py-2.5" />
          {unit && <span className="text-gray-600 shrink-0 ml-1">{unit}</span>}
        </div>
        <button type="button" aria-label={`${incLabel} ${label}`} onClick={() => onChange(clamp(value + step))} className="w-12 shrink-0 rounded-2xl bg-gray-100 border border-gray-300 text-2xl font-bold text-gray-800">+</button>
      </div>
      {hint && <p className="text-[15px] text-gray-600 mt-1">{hint}</p>}
    </div>
  );
};
