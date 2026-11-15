import type { CSSProperties } from 'react';
import type { Tone } from '../mock/data';

/** Integer with thousands separators. */
export const fi = (n: number) => Math.round(n).toLocaleString('en-US');
/** Ratio as percent with one decimal. */
export const fp = (r: number) => (r * 100).toFixed(1) + '%';
/** Ratio as whole percent. */
export const fp0 = (r: number) => Math.round(r * 100) + '%';
/** Seconds as m:ss. */
export const mmss = (s: number) => {
  const t = Math.round(s);
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
};

export const TONE: Record<Tone, string> = { good: '#0F7A63', warn: '#A14B0A', info: '#2B4FB3' };

/** Change vs. previous period: percentage points for rates, percent otherwise. */
export function change(cur: number, prev: number, isRate?: boolean): { text: string; cls?: 'up' | 'down' } {
  if (isRate) {
    const pp = (cur - prev) * 100;
    if (Math.abs(pp) < 0.05) return { text: '±0.0 pts' };
    return { text: (pp >= 0 ? '+' : '−') + Math.abs(pp).toFixed(1) + ' pts', cls: pp >= 0 ? 'up' : 'down' };
  }
  const pc = prev ? ((cur - prev) / prev) * 100 : 0;
  if (Math.abs(pc) < 0.5) return { text: '±0%' };
  return { text: (pc >= 0 ? '+' : '−') + Math.abs(pc).toFixed(0) + '%', cls: pc >= 0 ? 'up' : 'down' };
}

/** Inline style carrying CSS custom properties, e.g. cssVars({ '--c': '#fff' }). */
export const cssVars = (vars: Record<string, string>, extra?: CSSProperties) => ({ ...vars, ...extra }) as CSSProperties;
