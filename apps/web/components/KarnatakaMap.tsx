import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { geoMercator, geoPath } from 'd3-geo';
import type { FeatureCollection, Geometry } from 'geojson';
import geo from '../data/karnataka-districts.json';

// District boundaries: Census 2011 (via udit-001/india-maps-data, CC BY 4.0) with the
// 2021 Vijayanagara district taken from OpenStreetMap (ODbL) and cut out of Ballari/Davanagere.
const FC = geo as unknown as FeatureCollection<Geometry, { id: string; name: string }>;

export type Zone = 'RED' | 'ORANGE' | 'YELLOW';

export const ZONE_FILL: Record<Zone | 'NONE', string> = {
  RED: '#C8402F',
  ORANGE: '#E58C3A',
  YELLOW: '#E9C84A',
  NONE: '#E3EBDF',
};

interface Props {
  zones: Record<string, Zone>;          // districtId -> zone colour
  labels: Record<string, string>;       // districtId -> localised name
  selected?: string | null;
  onSelect?: (id: string) => void;
  markers?: Record<string, number>;     // districtId -> count badge (e.g. farmers)
  pulse?: string[];                     // districts where a new alert was just reported
}

const W = 560;
const H = 640;

/** Interactive SVG choropleth of Karnataka's 31 districts — no map tiles or internet needed. */
const KarnatakaMap: React.FC<Props> = ({ zones, labels, selected, onSelect, markers, pulse = [] }) => {
  const [hover, setHover] = useState<string | null>(null);

  const { paths, centroids } = useMemo(() => {
    const projection = geoMercator().fitSize([W, H], FC);
    const path = geoPath(projection);
    return {
      paths: FC.features.map((f) => ({ id: f.properties.id, d: path(f) || '' })),
      centroids: Object.fromEntries(FC.features.map((f) => [f.properties.id, path.centroid(f)])),
    };
  }, []);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-h-[70vh]" role="img" aria-label="Karnataka districts map">
      {paths.map(({ id, d }) => {
        const z = zones[id];
        const isSel = selected === id;
        return (
          <path
            key={id}
            d={d}
            fill={ZONE_FILL[z || 'NONE']}
            stroke={isSel ? '#1F4D3A' : '#FFFDF8'}
            strokeWidth={isSel ? 3 : 1.2}
            style={{ transition: 'fill 700ms cubic-bezier(.22,1,.36,1), opacity 150ms' }}
            className="cursor-pointer"
            opacity={hover && hover !== id && !isSel ? 0.75 : 1}
            onMouseEnter={() => setHover(id)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSelect?.(id)}
          >
            <title>{labels[id]}</title>
          </path>
        );
      })}
      {/* labels last so they sit on top of every district */}
      {paths.map(({ id }) => {
        const [x, y] = centroids[id];
        if (!Number.isFinite(x)) return null;
        const small = ['BNU', 'BNR', 'RMG', 'CKB', 'KLR', 'UDP', 'GDG', 'YDG', 'KDG'].includes(id);
        return (
          <g key={`l-${id}`} pointerEvents="none">
            <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
              fontSize={small ? 9 : 11} fontWeight={selected === id ? 800 : 600}
              fill="#1E2A24" stroke="#FFFDF8" strokeWidth={3} paintOrder="stroke" fontFamily="Inter, 'Noto Sans Kannada', 'Noto Sans Telugu', 'Noto Sans Devanagari', sans-serif">
              {labels[id]}
            </text>
            {markers?.[id] ? (
              <g transform={`translate(${x}, ${y + 13})`}>
                <circle r={8} fill="#1F4D3A" />
                <text textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={700} fill="#fff">{markers[id]}</text>
              </g>
            ) : null}
          </g>
        );
      })}
      {/* New alert: rings ripple out from the district where the pest was reported */}
      <AnimatePresence>
        {pulse.map((id) => {
          const c = centroids[id];
          if (!c || !Number.isFinite(c[0])) return null;
          return (
            <g key={`p-${id}`} pointerEvents="none">
              {[0, 0.6, 1.2].map((delay) => (
                <motion.circle key={delay} cx={c[0]} cy={c[1]} fill="none" stroke="#B3261E" strokeWidth={3}
                  initial={{ r: 6, opacity: 0.9 }} animate={{ r: 70, opacity: 0 }} exit={{ opacity: 0 }}
                  transition={{ duration: 1.8, delay, repeat: 2, ease: 'easeOut' }} />
              ))}
              <motion.circle cx={c[0]} cy={c[1]} r={7} fill="#B3261E" stroke="#FFFDF8" strokeWidth={2.5}
                initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }} />
            </g>
          );
        })}
      </AnimatePresence>
    </svg>
  );
};

export default KarnatakaMap;
