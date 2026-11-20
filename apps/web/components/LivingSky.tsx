// The one ambient animation in AgriQNet: a sky over the farmer's field that matches the real
// weather and time of day. Sun moves along its arc between sunrise and sunset; clouds drift when
// it is cloudy; rain falls when rain is likely; stars at night. Transform/opacity only, paused
// when off-screen or the tab is hidden, a still frame under reduced motion.
import React, { useEffect, useMemo, useRef, useState } from 'react';

export type SkyPhase = 'day' | 'dusk' | 'night';
export interface SkyState { code: number; rainPct: number; sunrise: number; sunset: number; now?: number }

export function skyPhase({ sunrise, sunset, now = Date.now() }: SkyState): SkyPhase {
  if (!sunrise || !sunset) { const h = new Date(now).getHours(); return h >= 19 || h < 5 ? 'night' : h >= 17 || h < 7 ? 'dusk' : 'day'; }
  const H = 3600_000;
  if (now < sunrise - 0.5 * H || now > sunset + 0.5 * H) return 'night';
  if (Math.abs(now - sunrise) < H || Math.abs(now - sunset) < H) return 'dusk';
  return 'day';
}

const SKY: Record<SkyPhase | 'grey', [string, string]> = {
  day: ['#2E6C70', '#1F4D3A'],
  dusk: ['#7B4A38', '#2A4636'],
  night: ['#0D1D24', '#10291F'],
  grey: ['#3E524B', '#213A2F'],
};

// fixed pseudo-random layout so the scene doesn't jump between renders
const RAIN = Array.from({ length: 28 }, (_, i) => ({ x: (i * 37) % 400, y: (i * 53) % 120, d: ((i * 13) % 10) / 10 }));
const STARS = Array.from({ length: 22 }, (_, i) => ({ x: (i * 71) % 400, y: 8 + ((i * 29) % 90), r: i % 3 === 0 ? 1.4 : 0.9, d: (i % 5) * 0.6 }));

export const LivingSky: React.FC<SkyState & { className?: string }> = ({ code, rainPct, sunrise, sunset, now, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    const onVis = () => setVisible(!document.hidden && el.getBoundingClientRect().bottom > 0);
    document.addEventListener('visibilitychange', onVis);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const s = useMemo(() => {
    const t = now ?? Date.now();
    const phase = skyPhase({ code, rainPct, sunrise, sunset, now: t });
    const rainy = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95 || rainPct >= 60;
    const cloudy = code >= 2 || rainy;
    const overcast = code === 3 || code === 45 || code === 48 || rainy;
    const p = sunrise && sunset ? Math.min(1, Math.max(0, (t - sunrise) / (sunset - sunrise))) : 0.5;
    // the sun keeps to the right part of the sky so the district name and temperature stay readable
    return { phase, rainy, cloudy, overcast, sunX: 236 + p * 140, sunY: 158 - Math.sin(p * Math.PI) * 100 };
  }, [code, rainPct, sunrise, sunset, now]);

  const [top, bottom] = s.overcast && s.phase !== 'night' ? SKY.grey : SKY[s.phase];
  const cloudFill = s.phase === 'night' ? '#9FB3AA' : '#FFFFFF';

  return (
    <div ref={ref} aria-hidden className={`living-sky absolute inset-0 overflow-hidden ${className || ''}`} data-paused={!visible}>
      <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
        <defs>
          <linearGradient id="sky-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={top} />
            <stop offset="1" stopColor={bottom} />
          </linearGradient>
          <radialGradient id="sun-g">
            <stop offset="0" stopColor="#F6EDCB" stopOpacity="0.9" />
            <stop offset="1" stopColor="#E2C766" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="shade-g" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#000" stopOpacity="0.28" />
            <stop offset="0.55" stopColor="#000" stopOpacity="0.08" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </linearGradient>
          <pattern id="furrow-p" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
            <line x1="0" y1="0" x2="0" y2="14" stroke="#FFFFFF" strokeOpacity="0.06" strokeWidth="3" />
          </pattern>
        </defs>
        <rect width="400" height="240" fill="url(#sky-g)" />

        {s.phase === 'night' && (
          <g>
            {STARS.map((st, i) => <circle key={i} className="sky-twinkle" style={{ animationDelay: `${st.d}s` }} cx={st.x} cy={st.y} r={st.r} fill="#F6EDCB" />)}
            <circle cx="268" cy="70" r="15" fill="#EDE7D3" opacity="0.85" />
            <circle cx="274" cy="65" r="13" fill={top} />
          </g>
        )}

        {s.phase !== 'night' && !s.overcast && (
          <g transform={`translate(${s.sunX} ${s.sunY})`}>
            <circle r="58" fill="url(#sun-g)" className="sky-glow" />
            <circle r="20" fill="#E2C766" />
          </g>
        )}

        {s.cloudy && (
          <g fill={cloudFill}>
            <g className="sky-drift" style={{ animationDuration: '46s' }} opacity={s.overcast ? 0.26 : 0.2}>
              <ellipse cx="90" cy="58" rx="46" ry="15" /><ellipse cx="116" cy="48" rx="28" ry="16" /><ellipse cx="70" cy="52" rx="20" ry="12" />
            </g>
            <g className="sky-drift" style={{ animationDuration: '62s', animationDelay: '-20s' }} opacity={s.overcast ? 0.22 : 0.15}>
              <ellipse cx="270" cy="84" rx="56" ry="16" /><ellipse cx="298" cy="72" rx="30" ry="17" />
            </g>
            {s.overcast && (
              <g className="sky-drift" style={{ animationDuration: '54s', animationDelay: '-8s' }} opacity="0.18">
                <ellipse cx="190" cy="34" rx="70" ry="17" /><ellipse cx="350" cy="40" rx="44" ry="14" />
              </g>
            )}
          </g>
        )}

        {s.rainy && (
          <g stroke="#DCE8DF" strokeOpacity="0.38" strokeWidth="1.4" strokeLinecap="round">
            {RAIN.map((r, i) => <line key={i} className="sky-rain" style={{ animationDelay: `${-r.d}s` }} x1={r.x} y1={r.y} x2={r.x - 4} y2={r.y + 12} />)}
          </g>
        )}

        {/* shade behind the text block (left side) */}
        <rect width="400" height="240" fill="url(#shade-g)" />
        {/* the field: two rolling hills with furrows */}
        <path d="M0 196 C 70 170, 150 176, 220 188 S 340 200, 400 178 L400 240 L0 240Z" fill="#183D2E" />
        <path d="M0 214 C 90 196, 170 206, 250 214 S 360 222, 400 206 L400 240 L0 240Z" fill="#112C21" />
        <path d="M0 196 C 70 170, 150 176, 220 188 S 340 200, 400 178 L400 240 L0 240Z" fill="url(#furrow-p)" />
      </svg>
    </div>
  );
};
