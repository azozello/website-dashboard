import { BOOK, CHANGES, PAGES, SITE, WEEKS, type Page, type Tone, type Week } from '../data/model';
import { fi, fp, fp0 } from './format';

export type Range = 4 | 13 | 26;
export const RANGES: [Range, string][] = [
  [4, '4 weeks'],
  [13, '3 months'],
  [26, '6 months'],
];
export const rangeName = (range: Range) => RANGES.find((r) => r[0] === range)![1];

export interface Totals {
  vis: number;
  inq: number;
  cta: number;
  time: number;
  scroll: number;
  r1: number;
}

export function totals(a: Week[]): Totals {
  const t = { vis: 0, inq: 0, cta: 0, time: 0, scroll: 0, r1: 0 };
  a.forEach((w) => {
    t.vis += w.vis;
    t.inq += w.inq;
    t.cta += w.cta;
    t.time += w.time * w.vis;
    t.scroll += w.scroll * w.vis;
  });
  t.time = t.vis ? t.time / t.vis : 0;
  t.scroll = t.vis ? t.scroll / t.vis : 0;
  t.r1 = t.vis ? t.inq / t.vis : 0;
  return t;
}

export interface Period {
  cur: Week[];
  T: Totals;
  P: Totals;
}

/** Current range vs. the equally long range before it. */
export function periods(series: Week[], range: Range): Period {
  const cur = series.slice(WEEKS - range);
  return { cur, T: totals(cur), P: totals(series.slice(WEEKS - 2 * range, WEEKS - range)) };
}

export const perMonth = (range: Range) => 4.33 / range;

/** Share of visitors reaching a position (0–100 %) on the page, interpolated from the 75 % value. */
export function reachAt(T: Totals, pos: number): number {
  const s75 = T.scroll;
  const pts: [number, number][] = [
    [0, 1],
    [25, Math.min(0.97, s75 + 0.42)],
    [50, Math.min(0.92, s75 + 0.2)],
    [75, s75],
    [100, s75 * 0.55],
  ];
  for (let i = 1; i < pts.length; i++) {
    if (pos <= pts[i][0]) {
      const a = pts[i - 1];
      const b = pts[i];
      return a[1] + ((b[1] - a[1]) * (pos - a[0])) / (b[0] - a[0]);
    }
  }
  return pts[pts.length - 1][1];
}

export interface DeviceRow {
  name: 'Mobile' | 'Desktop' | 'Tablet';
  share: number;
  r1: number;
  time: number;
  scroll: number;
  load: number;
}

export function deviceRates(p: Page, T: Totals): DeviceRow[] {
  const m = p.mobile;
  const t = 0.03;
  const d = 1 - m - t;
  const k = T.r1 / (m * p.mobF + d * p.deskF + t);
  return [
    { name: 'Mobile', share: m, r1: k * p.mobF, time: T.time * 0.85, scroll: T.scroll * 0.9, load: p.load[0] },
    { name: 'Desktop', share: d, r1: k * p.deskF, time: T.time * 1.35, scroll: Math.min(0.95, T.scroll * 1.25), load: p.load[1] },
    { name: 'Tablet', share: t, r1: k, time: T.time, scroll: T.scroll, load: (p.load[0] + p.load[1]) / 2 },
  ];
}

export interface Diagnosis {
  tone: Tone;
  title: string;
  text: string;
}

export function diagnose(p: Page, T: Totals, S: Totals, range: Range): Diagnosis[] {
  const out: Diagnosis[] = [];
  const dev = deviceRates(p, T);
  const contact = p.elements.filter((e) => e[0] === 'Contact form' || e[0] === BOOK).sort((a, b) => a[1] - b[1])[0];
  const formReach = contact ? reachAt(T, contact[1]) : 1;
  const monthlyVis = T.vis * perMonth(range);
  if (T.time < 45)
    out.push({ tone: 'warn', title: 'Visitors leave after ' + Math.round(T.time) + ' seconds', text: 'The first screen doesn’t convince. Put treatment and location in the headline, and move insurance, cost info and reviews up.' });
  if (contact && formReach < 0.25)
    out.push({ tone: 'warn', title: 'Only ' + fp0(formReach) + ' see ' + (contact[0] === BOOK ? 'the online booking' : 'the contact form'), text: 'Move contact options up: a sticky call and booking bar on mobile, booking in the first third of the page.' });
  if (T.time >= 100 && T.r1 < S.r1)
    out.push({ tone: 'warn', title: 'Read for a long time, but few requests', text: 'The interest is there. Booking higher up and a shorter form make the next step easier.' });
  if (dev[0].r1 < 0.65 * dev[1].r1)
    out.push({ tone: 'warn', title: 'Mobile much weaker than desktop', text: 'Rate 1 on mobile ' + fp(dev[0].r1) + ' vs. ' + fp(dev[1].r1) + ' on desktop. Check mobile load time (' + p.load[0].toFixed(1) + ' s) and buttons.' });
  if (p.calc) {
    let worst: { drop: number; step: string } | null = null;
    for (let i = 1; i < p.calc.length - 1; i++) {
      const drop = 1 - p.calc[i][1] / p.calc[i - 1][1];
      if (!worst || drop > worst.drop) worst = { drop, step: p.calc[i - 1][0] };
    }
    if (worst && worst.drop > 0.22)
      out.push({ tone: 'warn', title: fp0(worst.drop) + ' drop out of booking after “' + worst.step + '”', text: 'Simplify the next step or make it optional.' });
  }
  const top = p.terms.slice().sort((a, b) => b[2] - a[2])[0];
  if (top && top[3] / top[2] < 0.025 && top[2] > 3000)
    out.push({ tone: 'info', title: '“' + top[0] + '”: seen often, rarely clicked', text: top[2].toLocaleString('en-US') + ' impressions, only ' + fp(top[3] / top[2]) + ' click rate. Rewrite the title and description for Google.' });
  if (monthlyVis < 150)
    out.push({ tone: 'info', title: 'Few visitors', text: 'About ' + fi(monthlyVis) + ' visitors a month. Build visibility on Google first, then optimize.' });
  if (T.r1 > S.r1 * 1.5)
    out.push({ tone: 'good', title: 'One of the strongest pages', text: 'Rate 1 well above the site average. Link to it more from other pages.' });
  if (!out.length)
    out.push({ tone: 'good', title: 'No major issues', text: 'The page is doing fine. Next test: move reviews or insurance and cost info higher up.' });
  const order: Record<Tone, number> = { warn: 0, info: 1, good: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

export interface PageStats extends Period {
  p: Page;
  dev: DeviceRow[];
  /** Extra requests per month if the page reached the site's Rate 1. */
  potential: number;
  diag: Diagnosis[];
}

export function pageStats(p: Page, S: Totals, range: Range): PageStats {
  const pr = periods(p.series, range);
  return {
    p,
    ...pr,
    dev: deviceRates(p, pr.T),
    potential: Math.max(0, (S.r1 - pr.T.r1) * pr.T.vis * perMonth(range)),
    diag: diagnose(p, pr.T, S, range),
  };
}

export function allStats(range: Range) {
  const S = periods(SITE, range);
  return { S, stats: PAGES.map((p) => pageStats(p, S.T, range)) };
}

/** Scale factor from the page's last-4-weeks baseline to the selected range. */
export const baseK = (p: Page, T: Totals) => T.vis / totals(p.series.slice(48)).vis;

export interface Flag {
  idx: number;
  num: number;
  title: string;
  date: string;
}

/** Change markers inside the selected range, optionally for one page only. */
export function flagsFor(range: Range, pageId?: string): Flag[] {
  const first = WEEKS - range;
  return CHANGES.filter((c) => c.at >= first && (!pageId || c.pages.includes(pageId))).map((c) => ({
    idx: c.at - first,
    num: c.num,
    title: c.title,
    date: c.date,
  }));
}
