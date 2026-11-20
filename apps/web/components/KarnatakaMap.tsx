import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { geoMercator, geoPath } from 'd3-geo';
import type { FeatureCollection, Geometry } from 'geojson';
import { Plus, Minus, ArrowsIn } from '@phosphor-icons/react';
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
/** Pattern drawn over the zone colour so zones differ without colour too (red = stripes, orange = dots). */
export const ZONE_PATTERN: Partial<Record<Zone, string>> = { RED: 'url(#zone-red)', ORANGE: 'url(#zone-orange)' };

interface Props {
  zones: Record<string, Zone>;          // districtId -> zone colour
  labels: Record<string, string>;       // districtId -> localised name
  selected?: string | null;
  onSelect?: (id: string) => void;
  markers?: Record<string, number>;     // districtId -> count badge (e.g. farmers)
  pulse?: string[];                     // districts where a new alert was just reported
  home?: string | null;                 // the farmer's own district ("You are here")
  homeLabel?: string;
  zoomLabels?: { in: string; out: string; reset: string };
}

const W = 560;
const H = 640;
const LABEL_PX = 13; // on-screen size of district names

/** Interactive SVG choropleth of Karnataka's 31 districts — no map tiles or internet needed.
 *  Zoom with the buttons or a two-finger pinch; drag to move once zoomed in.
 *  At full view one finger still scrolls the page (touch-action: pan-y). */
const KarnatakaMap: React.FC<Props> = ({ zones, labels, selected, onSelect, markers, pulse = [], home, homeLabel, zoomLabels }) => {
  const [hover, setHover] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [pxPerUnit, setPxPerUnit] = useState(0.6);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ moved: number; pinch?: number } | null>(null);

  const { paths, centroids } = useMemo(() => {
    const projection = geoMercator().fitSize([W, H], FC);
    const path = geoPath(projection);
    return {
      paths: FC.features.map((f) => ({ id: f.properties.id, d: path(f) || '' })),
      centroids: Object.fromEntries(FC.features.map((f) => [f.properties.id, path.centroid(f)])),
    };
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPxPerUnit(el.getBoundingClientRect().width / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clampView = (v: { k: number; x: number; y: number }) => {
    const k = Math.min(5, Math.max(1, v.k));
    return { k, x: Math.min(0, Math.max(W - W * k, v.x)), y: Math.min(0, Math.max(H - H * k, v.y)) };
  };
  /** zoom by factor around an SVG point */
  const zoomAt = (f: number, cx = W / 2, cy = H / 2) => setView((v) => {
    const k = Math.min(5, Math.max(1, v.k * f));
    const r = k / v.k;
    return clampView({ k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r });
  });
  const toSvg = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current = { moved: 0 };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      drag.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !drag.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && drag.current.pinch) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = toSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
      zoomAt(dist / drag.current.pinch, mid.x, mid.y);
      drag.current.pinch = dist;
      drag.current.moved += 10;
      return;
    }
    if (view.k === 1) return; // nothing to pan at full view
    const dx = ((e.clientX - prev.x) / pxPerUnit), dy = ((e.clientY - prev.y) / pxPerUnit);
    drag.current.moved += Math.abs(dx) + Math.abs(dy);
    setView((v) => clampView({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const onPointerUp = (e: React.PointerEvent) => { pointers.current.delete(e.pointerId); if (pointers.current.size === 0) window.setTimeout(() => { drag.current = null; }, 0); };
  const pick = (id: string) => { if ((drag.current?.moved || 0) > 6) return; onSelect?.(id); };

  const unit = pxPerUnit * view.k;           // screen px per map unit
  const fs = LABEL_PX / unit;                 // label size in map units for 13px on screen
  const showAll = unit >= 1.0;                // enough room for every name

  return (
    <div className="relative">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className={`w-full h-auto max-h-[70vh] select-none ${view.k > 1 ? 'touch-none' : 'touch-pan-y'}`} role="img" aria-label="Karnataka districts map"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <defs>
          <pattern id="zone-red" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#7A1E12" strokeOpacity="0.45" strokeWidth="3" />
          </pattern>
          <pattern id="zone-orange" width="9" height="9" patternUnits="userSpaceOnUse">
            <circle cx="4.5" cy="4.5" r="1.6" fill="#7A3A0B" fillOpacity="0.45" />
          </pattern>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`} style={{ transition: drag.current ? 'none' : 'transform 220ms cubic-bezier(.22,1,.36,1)' }}>
          {paths.map(({ id, d }) => {
            const z = zones[id];
            const isSel = selected === id;
            return (
              <g key={id} className="cursor-pointer" onClick={() => pick(id)} onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}>
                <path d={d} fill={ZONE_FILL[z || 'NONE']} stroke="#FFFDF8" strokeWidth={1.2 / view.k}
                  style={{ transition: 'fill 700ms cubic-bezier(.22,1,.36,1), opacity 150ms' }} opacity={hover && hover !== id && !isSel ? 0.8 : 1}>
                  <title>{labels[id]}</title>
                </path>
                {z && ZONE_PATTERN[z] && <path d={d} fill={ZONE_PATTERN[z]} pointerEvents="none" />}
              </g>
            );
          })}
          {/* outlines on top: the farmer's district (thick, dark) and the selected one */}
          {paths.filter((p) => p.id === home || p.id === selected).map(({ id, d }) => (
            <path key={`o-${id}`} d={d} fill="none" pointerEvents="none" stroke={id === home ? '#0F1A14' : '#1F4D3A'} strokeWidth={(id === home ? 3.5 : 2.5) / view.k} strokeDasharray={id === home || id !== selected ? undefined : `${6 / view.k} ${4 / view.k}`} />
          ))}
          {/* names: all of them once there is room, otherwise only home + selected */}
          {paths.map(({ id }) => {
            const [x, y] = centroids[id];
            if (!Number.isFinite(x)) return null;
            if (!showAll && id !== home && id !== selected) return null;
            return (
              <g key={`l-${id}`} pointerEvents="none">
                <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fontWeight={id === selected || id === home ? 800 : 600}
                  fill="#1E2A24" stroke="#FFFDF8" strokeWidth={3 / unit} paintOrder="stroke" fontFamily="Inter, 'Noto Sans Kannada', 'Noto Sans Telugu', 'Noto Sans Devanagari', sans-serif">
                  {labels[id]}
                </text>
                {markers?.[id] ? (
                  <g transform={`translate(${x}, ${y + fs * 1.3})`}>
                    <circle r={fs * 0.75} fill="#1F4D3A" />
                    <text textAnchor="middle" dominantBaseline="central" fontSize={fs * 0.8} fontWeight={700} fill="#fff">{markers[id]}</text>
                  </g>
                ) : null}
              </g>
            );
          })}
          {/* You are here */}
          {home && centroids[home] && Number.isFinite(centroids[home][0]) && (
            <g transform={`translate(${centroids[home][0]}, ${centroids[home][1] - fs * 1.1}) scale(${1 / unit})`} pointerEvents="none">
              <path d="M0 0 C -9 -12, -14 -18, -14 -26 A 14 14 0 1 1 14 -26 C 14 -18, 9 -12, 0 0Z" fill="#0F1A14" stroke="#FFFDF8" strokeWidth="2.5" />
              <circle cx="0" cy="-26" r="5.5" fill="#E2C766" />
              {homeLabel && (
                <g transform="translate(0 -52)">
                  <rect x={-(homeLabel.length * 4 + 12)} y="-13" width={homeLabel.length * 8 + 24} height="26" rx="13" fill="#0F1A14" />
                  <text textAnchor="middle" dominantBaseline="central" fontSize="13" fontWeight="700" fill="#FFFFFF" fontFamily="Inter, 'Noto Sans Kannada', 'Noto Sans Telugu', 'Noto Sans Devanagari', sans-serif">{homeLabel}</text>
                </g>
              )}
            </g>
          )}
          {/* New alert: rings ripple out from the district where the pest was reported */}
          <AnimatePresence>
            {pulse.map((id) => {
              const c = centroids[id];
              if (!c || !Number.isFinite(c[0])) return null;
              return (
                <g key={`p-${id}`} pointerEvents="none">
                  {[0, 0.6, 1.2].map((delay) => (
                    <motion.circle key={delay} cx={c[0]} cy={c[1]} fill="none" stroke="#B3261E" strokeWidth={3 / view.k}
                      initial={{ r: 6, opacity: 0.9 }} animate={{ r: 70, opacity: 0 }} exit={{ opacity: 0 }}
                      transition={{ duration: 1.8, delay, repeat: 2, ease: 'easeOut' }} />
                  ))}
                  <motion.circle cx={c[0]} cy={c[1]} r={7 / view.k} fill="#B3261E" stroke="#FFFDF8" strokeWidth={2.5 / view.k}
                    initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }} />
                </g>
              );
            })}
          </AnimatePresence>
        </g>
      </svg>
      {/* zoom controls */}
      <div className="absolute right-2 top-2 flex flex-col gap-2">
        <button type="button" onClick={() => { const c = home && centroids[home]; if (view.k === 1 && c && Number.isFinite(c[0])) zoomAt(1.8, c[0], c[1]); else zoomAt(1.5); }} aria-label={zoomLabels?.in || 'Zoom in'} className="w-12 h-12 rounded-2xl bg-paper border border-gray-300 shadow-soft flex items-center justify-center text-ink"><Plus size={22} weight="bold" aria-hidden /></button>
        <button type="button" onClick={() => zoomAt(1 / 1.5)} disabled={view.k <= 1} aria-label={zoomLabels?.out || 'Zoom out'} className="w-12 h-12 rounded-2xl bg-paper border border-gray-300 shadow-soft flex items-center justify-center text-ink disabled:opacity-40"><Minus size={22} weight="bold" aria-hidden /></button>
        {view.k > 1 && <button type="button" onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label={zoomLabels?.reset || 'Show all'} className="w-12 h-12 rounded-2xl bg-paper border border-gray-300 shadow-soft flex items-center justify-center text-ink"><ArrowsIn size={22} weight="bold" aria-hidden /></button>}
      </div>
    </div>
  );
};

export default KarnatakaMap;
