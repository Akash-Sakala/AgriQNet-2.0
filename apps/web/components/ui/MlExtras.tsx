import React from 'react';
import { fmt } from '../../utils/translations';
import { Atom } from '@phosphor-icons/react';

export interface MlTop { label: string; probability: number }
export interface MlDetails {
  confidence?: number;
  top3?: MlTop[];
  conformal_set?: string[];
  model?: { id?: string; name?: string; qubits?: number; description?: string };
}

/** Alternatives the model also rates (≥5 %) and which model answered (quantum-hybrid v3 or the old classical one). */
export const MlExtras: React.FC<{ details?: MlDetails; prediction: string; t: Record<string, any>; nameOf: (s: string) => string }> = ({ details, prediction, t, nameOf }) => {
  if (!details) return null;
  const others = (details.top3 || []).filter((o) => o.label !== prediction && o.probability >= 0.05);
  const qubits = details.model?.qubits || 0;
  return (
    <div className="space-y-3">
      {others.length > 0 && (
        <div>
          <span className="block text-sm font-semibold text-gray-600 mb-1.5">{t.mlAlsoSuitable}</span>
          <div className="flex flex-wrap gap-2">
            {others.map((o) => (
              <span key={o.label} className="text-sm bg-cream border border-gray-200 rounded-full px-3 py-1 text-gray-800">
                {nameOf(o.label)} · {Math.round(o.probability * 100)}%
              </span>
            ))}
          </div>
        </div>
      )}
      {qubits > 0 && (
        <div title={details.model?.description} className="inline-flex items-center gap-1.5 text-xs font-semibold text-agri-800 bg-agri-50 border border-agri-200 rounded-full px-3 py-1">
          <Atom size={16} weight="duotone" aria-hidden /> {fmt(t.mlQuantumModel, { n: qubits })}
        </div>
      )}
    </div>
  );
};
