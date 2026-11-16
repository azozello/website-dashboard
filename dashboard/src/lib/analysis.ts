import { CHANNEL_NAME, DEVICE_NAME, WEEKS, type Breakdown, type Funnel, type Page, type SiteData, type Tone, type Week } from '../data/model';
import { fi, fp, fp0 } from './format';

export type Range = 4 | 13 | 26;
export const RANGES: [Range, string][] = [
  [4, '4 weeks'],
  [13, '3 months'],
  [26, '6 months'],
];
export const rangeName = (range: Range) => RANGES.find((r) => r[0] === range)![1];

/** Below this many visits a rate is too uncertain to call a finding on. */
export const MIN_VIS = 30;
/** Engaged page views needed before time and scroll findings. */
const MIN_ENG = 20;

export interface Totals {
  vis: number;
  conv: number;
  inq: number;
  cta: number;
  pvs: number;
  eng: number;
  time: number;
  scroll: number;
  r1: number;
  /** Share of page views with engagement data (§11 "coverage"). */
  coverage: number;
}

export function totals(a: Week[]): Totals {
  const t = { vis: 0, conv: 0, inq: 0, cta: 0, pvs: 0, eng: 0, activeMs: 0, s75: 0 };
  a.forEach((w) => {
    t.vis += w.vis;
    t.conv += w.conv;
    t.inq += w.inq;
    t.cta += w.cta;
    t.pvs += w.pvs;
    t.eng += w.eng;
    t.activeMs += w.activeMs;
    t.s75 += w.s75;
  });
  return {
    vis: t.vis,
    conv: t.conv,
    inq: t.inq,
    cta: t.cta,
    pvs: t.pvs,
    eng: t.eng,
    time: t.eng ? t.activeMs / t.eng / 1000 : 0,
    scroll: t.eng ? t.s75 / t.eng : 0,
    r1: t.vis ? t.conv / t.vis : 0,
    coverage: t.pvs ? t.eng / t.pvs : 0,
  };
}

/** 95 % Wilson score interval for k successes out of n (§11 "Range"). */
export function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 1];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
export const rangeText = (k: number, n: number) => {
  const [lo, hi] = wilson(k, n);
  return n ? `95% range ${fp(lo)}–${fp(hi)} (${fi(k)} of ${fi(n)})` : 'No visits';
};

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

export interface DeviceRow {
  key: string;
  name: string;
  vis: number;
  conv: number;
  share: number;
  r1: number;
  time: number;
  scroll: number;
  /** Mean load time in seconds; null without measurements. */
  load: number | null;
}

export function deviceRows(bd: Breakdown): DeviceRow[] {
  const tot = bd.devices.reduce((a, d) => a + d.vis, 0);
  return ['mobile', 'desktop', 'tablet']
    .map((k) => bd.devices.find((d) => d.name === k))
    .filter((d) => d && (d.vis || d.pvs))
    .map((d) => ({
      key: d!.name,
      name: DEVICE_NAME[d!.name] ?? d!.name,
      vis: d!.vis,
      conv: d!.conv,
      share: tot ? d!.vis / tot : 0,
      r1: d!.vis ? d!.conv / d!.vis : 0,
      time: d!.eng ? d!.activeMs / d!.eng / 1000 : 0,
      scroll: d!.eng ? d!.s75 / d!.eng : 0,
      load: d!.loadN ? d!.loadMs / d!.loadN / 1000 : null,
    }));
}

export interface ContactRow {
  name: string;
  /** Null: this option has no button to click (forms) or no request to count (calls). */
  clicks: number | null;
  inq: number | null;
}

/** Contact clicks (tracker) and counted requests (forms, bookings) side by side; options without either are left out. */
export function contactRows(bd: Breakdown): ContactRow[] {
  const c = bd.clicks;
  const r = bd.requests;
  const rows: ContactRow[] = [
    { name: 'Phone call', clicks: c.call ?? 0, inq: null },
    { name: 'WhatsApp', clicks: c.whatsapp ?? 0, inq: null },
    { name: 'Email', clicks: c.email ?? 0, inq: null },
    { name: CHANNEL_NAME.booking, clicks: c.booking_cta ?? 0, inq: r.booking ?? 0 },
    { name: CHANNEL_NAME.form, clicks: null, inq: r.form ?? 0 },
    { name: CHANNEL_NAME.calculator, clicks: null, inq: r.calculator ?? 0 },
  ];
  return rows.filter((x) => (x.clicks ?? 0) > 0 || (x.inq ?? 0) > 0);
}

/** Step with the biggest drop from the step before it (index into steps), or -1. */
export function worstStep(f: Funnel): { i: number; drop: number } {
  let i = -1;
  let drop = 0;
  for (let j = 1; j < f.steps.length; j++) {
    const prev = f.steps[j - 1].visits;
    const d = prev ? 1 - f.steps[j].visits / prev : 0;
    if (d > drop) [i, drop] = [j, d];
  }
  return { i, drop };
}

export interface Diagnosis {
  tone: Tone;
  title: string;
  text: string;
}

export function diagnose(p: Page, T: Totals, S: Totals, range: Range, funnels: Funnel[]): Diagnosis[] {
  const out: Diagnosis[] = [];
  const [lo, hi] = wilson(T.conv, T.vis);
  const monthlyVis = T.vis * perMonth(range);
  const enough = T.vis >= MIN_VIS;

  if (!enough && T.pvs)
    out.push({
      tone: 'info',
      title: T.vis ? 'Too few visits to judge Rate 1' : 'Rarely the first page of a visit',
      text: T.vis
        ? `${fi(T.vis)} visits started on this page in this period. Rates become reliable from about ${MIN_VIS}.`
        : 'Rate 1 is credited to the page a visit starts on. This page is mostly reached from other pages.',
    });
  if (T.eng >= MIN_ENG && T.time < 45)
    out.push({ tone: 'warn', title: 'Visitors leave after ' + Math.round(T.time) + ' seconds', text: 'The first screen doesn’t convince. Put treatment and location in the headline, and move insurance, cost info and reviews up.' });
  const sc = p.bd.scroll;
  if (sc.eng >= MIN_ENG && sc.s50 / sc.eng < 0.4)
    out.push({ tone: 'warn', title: 'Only ' + fp0(sc.s50 / sc.eng) + ' read half of the page', text: 'Whatever sits below the middle is rarely seen. Move contact options and booking into the first third.' });
  if (enough && T.time >= 100 && hi < S.r1)
    out.push({ tone: 'warn', title: 'Read for a long time, but few requests', text: 'The interest is there. Booking higher up and a shorter form make the next step easier.' });
  const dev = deviceRows(p.bd);
  const mob = dev.find((d) => d.key === 'mobile');
  const desk = dev.find((d) => d.key === 'desktop');
  if (mob && desk && mob.vis >= MIN_VIS && desk.vis >= MIN_VIS && wilson(mob.conv, mob.vis)[1] < wilson(desk.conv, desk.vis)[0])
    out.push({
      tone: 'warn',
      title: 'Mobile much weaker than desktop',
      text: 'Rate 1 on mobile ' + fp(mob.r1) + ' vs. ' + fp(desk.r1) + ' on desktop. Check mobile load time' + (mob.load !== null ? ' (' + mob.load.toFixed(1) + ' s)' : '') + ' and buttons.',
    });
  for (const f of funnels.filter((x) => x.startPath === p.path && (x.steps[0]?.visits ?? 0) >= 10)) {
    const w = worstStep(f);
    if (w.drop > 0.22)
      out.push({ tone: 'warn', title: fp0(w.drop) + ' drop out after “' + (f.steps[w.i - 1].name ?? 'step ' + f.steps[w.i - 1].step) + '”', text: 'Simplify the next step or make it optional.' });
  }
  if (T.vis && monthlyVis < 150)
    out.push({ tone: 'info', title: 'Few visitors', text: 'About ' + fi(monthlyVis) + ' visits a month start here. Build visibility on Google first, then optimize.' });
  if (enough && lo > S.r1)
    out.push({ tone: 'good', title: 'One of the strongest pages', text: 'Rate 1 clearly above the site average (' + fp(S.r1) + '). Link to it more from other pages.' });
  if (!out.length)
    out.push({ tone: 'good', title: 'No major issues', text: 'Nothing stands out on this page. Next test: move reviews or insurance and cost info higher up.' });
  const order: Record<Tone, number> = { warn: 0, info: 1, good: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

export interface PageStats extends Period {
  p: Page;
  /** Extra requests per month if the page reached the site's Rate 1; only when it is clearly below it. */
  potential: number;
  diag: Diagnosis[];
}

export function pageStats(p: Page, S: Totals, range: Range, funnels: Funnel[]): PageStats {
  const pr = periods(p.series, range);
  const below = pr.T.vis >= MIN_VIS && wilson(pr.T.conv, pr.T.vis)[1] < S.r1;
  return {
    p,
    ...pr,
    potential: below ? (S.r1 - pr.T.r1) * pr.T.vis * perMonth(range) : 0,
    diag: diagnose(p, pr.T, S, range, funnels),
  };
}

export function allStats(d: SiteData, range: Range) {
  const S = periods(d.site, range);
  return { S, stats: d.pages.map((p) => pageStats(p, S.T, range, d.funnels)) };
}

/** Numbered change marker on a chart. There is no change log yet, so charts get none. */
export interface Flag {
  idx: number;
  num: number;
  title: string;
  date: string;
}
