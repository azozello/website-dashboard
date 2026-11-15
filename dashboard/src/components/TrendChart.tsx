import { useLayoutEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react';
import type { Flag } from '../lib/analysis';
import { cssVars } from '../lib/format';
import { METRICS } from '../lib/metrics';
import type { Week } from '../mock/data';
import type { ShowState } from '../state';

interface Props {
  cur: Week[];
  show: ShowState;
  flags: Flag[];
}

/** Weekly trend lines, each metric scaled to its own min/max, with change markers and a hover tooltip. */
export function TrendChart({ cur, show, flags }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ i: number; px: number; width: number } | null>(null);

  const n = cur.length;
  const active = METRICS.filter((m) => show[m.k]);
  const X = (i: number) => (n === 1 ? 500 : (i * 1000) / (n - 1));

  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!hover || !tip) return;
    const tw = tip.offsetWidth || 180;
    tip.style.left = (hover.px + 14 + tw > hover.width ? Math.max(0, hover.px - tw - 14) : hover.px + 14) + 'px';
  }, [hover]);

  if (!active.length) {
    return (
      <div className="chart">
        <div className="empty">Click a number above to show it on the chart.</div>
      </div>
    );
  }

  const onMove = (e: MouseEvent | TouchEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const i = Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left) / r.width) * (n - 1))));
    setHover({ i, px: n === 1 ? r.width / 2 : (i / (n - 1)) * r.width, width: r.width });
  };

  const step = Math.max(1, Math.round((n - 1) / 5));
  const ticks: number[] = [];
  for (let j = 0; j < n; j += step) ticks.push(j);
  const w = hover ? cur[Math.min(hover.i, n - 1)] : null;

  return (
    <div
      ref={ref}
      className={'chart' + (hover ? ' active' : '')}
      onMouseMove={onMove}
      onTouchStart={onMove}
      onTouchMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg viewBox="0 0 1000 250" preserveAspectRatio="none" role="img" aria-label={'Weekly trend: ' + active.map((m) => m.label).join(', ')}>
        {[10, 70, 130, 190].map((y) => (
          <line key={y} x1="0" x2="1000" y1={y} y2={y} stroke="#ECF0EE" vectorEffect="non-scaling-stroke" />
        ))}
        <line x1="0" x2="1000" y1="250" y2="250" stroke="#DCE2DF" vectorEffect="non-scaling-stroke" />
        {active.map((m) => {
          const v = cur.map((wk) => wk[m.k]);
          const mn = Math.min(...v);
          const sp = Math.max(...v) - mn || 1;
          const points = v.map((y, i) => X(i).toFixed(1) + ',' + (236 - ((y - mn) / sp) * 210).toFixed(1)).join(' ');
          return (
            <polyline
              key={m.k}
              points={points}
              fill="none"
              stroke={m.c}
              strokeWidth={m.k === 'r1' ? 3 : 2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      {flags.map((f) => (
        <div key={f.num} className="flag" style={{ left: (X(f.idx) / 10).toFixed(2) + '%' }}>
          <span title={f.title}>{f.num}</span>
        </div>
      ))}
      {ticks.map((j) => (
        <span key={j} className={'xl' + (X(j) === 0 ? ' first' : X(j) === 1000 ? ' last' : '')} style={{ left: (X(j) / 10).toFixed(2) + '%' }}>
          {cur[j].label}
        </span>
      ))}
      <div className="cursor" style={hover ? { left: hover.px } : undefined} />
      <div ref={tipRef} className="tip" role="status" aria-live="polite">
        {w && (
          <>
            <b>Week of {w.label}</b>
            {active.map((m) => (
              <div key={m.k}>
                <span>
                  <i style={cssVars({ '--c': m.c })} />
                  {m.label}
                </span>
                <span>{m.f(w[m.k])}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
