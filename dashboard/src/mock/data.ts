/**
 * Mock data for the PoC dashboard. Ported from the reference prototype so the
 * numbers match it exactly. Replace with API data once ingest (W3) is live.
 */

export type Tone = 'good' | 'warn' | 'info';

export interface Week {
  label: string;
  vis: number;
  inq: number;
  cta: number;
  time: number;
  scroll: number;
  r1: number;
}

type Steps = [number, number][];

interface PageSeed {
  id: string;
  path: string;
  name: string;
  share: number;
  seed: number;
  visBoost?: [number, number];
  r1: Steps;
  time: Steps;
  scroll: Steps;
  /** [name, share of requests, clicks per request] */
  channels: [string, number, number][];
  /** [element, position on page in %] */
  elements: [string, number][];
  timeBuckets: number[];
  /** [source, share of visitors, Rate 1 factor] */
  sources: [string, number, number][];
  /** [term, position, impressions, clicks] */
  terms: [string, number, number, number][];
  mobile: number;
  mobF: number;
  deskF: number;
  load: [number, number];
  calc: [string, number][] | null;
  paths: [string, number][];
}

export interface Page extends PageSeed {
  slug: string;
  series: Week[];
}

export interface Change {
  at: number;
  num: number;
  date: string;
  pages: string[];
  title: string;
  metric: string;
  before: string;
  after: string;
  verdict: 'Clear' | 'Likely';
}

/** [n, received, channel, page id, source, device, time on site before contact] */
export type Inquiry = [number, string, string, string, string, string, string];

export const BOOK = 'Online booking';
const BK = ['Treatment chosen', 'Time slot chosen', 'Insurance or self-pay', 'Contact details', 'Booked'];
function funnel(a: number[]): [string, number][] {
  return BK.map((s, i) => [s, a[i]]);
}
const SRC_SEARCH: [string, number, number][] = [['Google search', 0.72, 1.0], ['Google Business Profile', 0.16, 1.35], ['Direct', 0.07, 1.1], ['Other websites', 0.05, 0.6]];
const PAGE_SEEDS: PageSeed[] = [
  { id: 'p1', path: '/', name: 'Home page', share: 0.14, seed: 0.7,
    r1: [[0, 0.038]], time: [[0, 52]], scroll: [[0, 0.24]],
    channels: [['Call', 0.38, 2.8], [BOOK, 0.32, 2.4], ['Contact form', 0.14, 1.5], ['WhatsApp', 0.1, 1.8], ['Email', 0.06, 1.2]],
    elements: [['Headline and offer', 0], ['Treatments overview', 20], ['Team', 45], ['Reviews', 60], ['Contact form', 86]],
    timeBuckets: [0.27, 0.22, 0.21, 0.2, 0.1],
    sources: [['Google Business Profile', 0.46, 1.2], ['Direct', 0.24, 1.15], ['Google search', 0.25, 0.8], ['Social media', 0.05, 0.5]],
    terms: [['physiotherapy near me', 8.4, 4210, 118], ['physiotherapy schwabing', 4.2, 1380, 96]],
    mobile: 0.71, mobF: 0.88, deskF: 1.25, load: [2.2, 1.2], calc: null,
    paths: [['Requested directly on this page', 9], ['This page, then /prices-self-pay, then request', 5], ['This page, then /team, then request', 3]] },
  { id: 'p2', path: '/physiotherapy-munich', name: 'Physiotherapy', share: 0.18, seed: 1.1,
    r1: [[0, 0.030], [42, 0.041]], time: [[0, 70], [42, 88]], scroll: [[0, 0.30], [42, 0.42]],
    channels: [[BOOK, 0.44, 2.6], ['Call', 0.28, 3.0], ['WhatsApp', 0.14, 1.9], ['Contact form', 0.1, 1.4], ['Email', 0.04, 1.3]],
    elements: [['Headline and offer', 0], ['How treatment works', 22], ['Insurance and prescription', 38], ['Online booking', 50], ['Reviews', 65], ['Contact form', 88]],
    timeBuckets: [0.18, 0.17, 0.2, 0.28, 0.17],
    sources: SRC_SEARCH,
    terms: [['physiotherapy munich', 3.4, 6820, 452], ['physiotherapist munich', 4.6, 2940, 161], ['physiotherapy munich insurance', 7.2, 1180, 44]],
    mobile: 0.69, mobF: 0.82, deskF: 1.42, load: [2.3, 1.3],
    calc: funnel([140, 112, 98, 61, 55]),
    paths: [['Requested directly on this page', 24], ['This page, then /prices-self-pay, then request', 8], ['Home page, then this page, then request', 6]] },
  { id: 'p3', path: '/osteopathy-munich', name: 'Osteopathy', share: 0.12, seed: 2.3, visBoost: [40, 1.3],
    r1: [[0, 0.016], [44, 0.022]], time: [[0, 118]], scroll: [[0, 0.58]],
    channels: [[BOOK, 0.34, 3.0], ['Contact form', 0.26, 1.7], ['Call', 0.24, 3.0], ['WhatsApp', 0.16, 2.0]],
    elements: [['Headline and offer', 0], ['What is osteopathy?', 15], ['Process and duration', 35], ['Costs and reimbursement', 55], ['Online booking', 72], ['Contact form', 90]],
    timeBuckets: [0.11, 0.11, 0.16, 0.33, 0.29],
    sources: [['Google search', 0.86, 1.0], ['Google Business Profile', 0.08, 1.3], ['Direct', 0.06, 1.1]],
    terms: [['osteopathy munich', 6.1, 5480, 214], ['osteopath munich', 7.8, 3120, 96], ['osteopathy cost insurance', 9.4, 3940, 71]],
    mobile: 0.62, mobF: 0.9, deskF: 1.2, load: [2.1, 1.2],
    calc: funnel([70, 58, 41, 30, 27]),
    paths: [['This page, then /prices-self-pay, then request', 6], ['Requested directly on this page', 5]] },
  { id: 'p4', path: '/chiropractic-munich', name: 'Chiropractic', share: 0.10, seed: 3.1,
    r1: [[0, 0.012]], time: [[0, 36]], scroll: [[0, 0.14]],
    channels: [['Call', 0.48, 3.4], ['WhatsApp', 0.26, 2.2], ['Contact form', 0.2, 1.6], ['Email', 0.06, 1.3]],
    elements: [['Headline and offer', 0], ['Treatment description', 20], ['Reviews', 72], ['Contact form', 92]],
    timeBuckets: [0.47, 0.23, 0.14, 0.11, 0.05],
    sources: SRC_SEARCH,
    terms: [['chiropractor munich', 4.4, 4380, 286], ['chiropractic munich', 5.9, 2210, 118], ['chiropractor munich cost', 8.8, 960, 22]],
    mobile: 0.75, mobF: 0.6, deskF: 1.9, load: [3.6, 1.5], calc: null,
    paths: [['Requested directly on this page', 4], ['This page, then home page, then request', 2]] },
  { id: 'p5', path: '/manual-therapy', name: 'Manual therapy', share: 0.07, seed: 1.9,
    r1: [[0, 0.024]], time: [[0, 66]], scroll: [[0, 0.33]],
    channels: [[BOOK, 0.4, 2.6], ['Call', 0.34, 3.0], ['Contact form', 0.16, 1.5], ['WhatsApp', 0.1, 1.9]],
    elements: [['Headline and offer', 0], ['Who it’s for', 25], ['Insurance and prescription', 45], ['Contact form', 86]],
    timeBuckets: [0.24, 0.2, 0.22, 0.22, 0.12],
    sources: SRC_SEARCH,
    terms: [['manual therapy munich', 5.2, 2160, 104], ['manual therapist munich', 9.1, 720, 19]],
    mobile: 0.68, mobF: 0.88, deskF: 1.25, load: [2.3, 1.2], calc: null,
    paths: [['Requested directly on this page', 4], ['This page, then /physiotherapy-munich, then request', 2]] },
  { id: 'p6', path: '/exercise-therapy', name: 'Exercise therapy', share: 0.06, seed: 2.7,
    r1: [[0, 0.034]], time: [[0, 60]], scroll: [[0, 0.31]],
    channels: [['Call', 0.44, 3.0], [BOOK, 0.3, 2.6], ['WhatsApp', 0.16, 1.9], ['Contact form', 0.1, 1.5]],
    elements: [['Headline and offer', 0], ['Coming with a prescription', 22], ['Reviews', 52], ['Contact form', 86]],
    timeBuckets: [0.26, 0.2, 0.22, 0.21, 0.11],
    sources: SRC_SEARCH,
    terms: [['exercise therapy munich', 4.8, 1840, 98], ['physio prescription munich', 7.6, 690, 23]],
    mobile: 0.74, mobF: 0.55, deskF: 2.0, load: [3.8, 1.4], calc: null,
    paths: [['Requested directly on this page', 4], ['Home page, then this page, then request', 2]] },
  { id: 'p7', path: '/lymphatic-drainage', name: 'Lymphatic drainage', share: 0.05, seed: 0.4,
    r1: [[0, 0.029]], time: [[0, 72]], scroll: [[0, 0.36]],
    channels: [['Call', 0.42, 3.0], [BOOK, 0.36, 2.5], ['Contact form', 0.14, 1.5], ['WhatsApp', 0.08, 1.9]],
    elements: [['Headline and offer', 0], ['How it works', 25], ['Insurance and prescription', 45], ['Contact form', 88]],
    timeBuckets: [0.22, 0.19, 0.22, 0.24, 0.13],
    sources: SRC_SEARCH,
    terms: [['lymphatic drainage munich', 5.6, 1520, 71], ['manual lymphatic drainage schwabing', 6.9, 410, 18]],
    mobile: 0.7, mobF: 0.88, deskF: 1.25, load: [2.2, 1.2], calc: null,
    paths: [['Requested directly on this page', 3], ['This page, then /prices-self-pay, then request', 1]] },
  { id: 'p8', path: '/sports-physiotherapy', name: 'Sports physiotherapy', share: 0.05, seed: 1.5,
    r1: [[0, 0.021]], time: [[0, 74]], scroll: [[0, 0.35]],
    channels: [[BOOK, 0.46, 2.6], ['WhatsApp', 0.24, 1.9], ['Call', 0.2, 3.0], ['Contact form', 0.1, 1.5]],
    elements: [['Headline and offer', 0], ['Common sports injuries', 25], ['Team', 50], ['Contact form', 88]],
    timeBuckets: [0.21, 0.19, 0.22, 0.25, 0.13],
    sources: [['Google search', 0.78, 1.0], ['Social media', 0.12, 0.7], ['Google Business Profile', 0.1, 1.3]],
    terms: [['sports physiotherapy munich', 6.4, 1290, 58], ['sports physio munich', 8.2, 620, 21]],
    mobile: 0.72, mobF: 0.88, deskF: 1.25, load: [2.4, 1.3], calc: null,
    paths: [['Requested directly on this page', 2], ['This page, then /team, then request', 1]] },
  { id: 'p9', path: '/tmj-jaw', name: 'TMJ and jaw', share: 0.04, seed: 2.9,
    r1: [[0, 0.019]], time: [[0, 96]], scroll: [[0, 0.5]],
    channels: [['Contact form', 0.34, 1.6], ['Call', 0.34, 3.0], [BOOK, 0.32, 2.6]],
    elements: [['Headline and offer', 0], ['What is TMJ disorder?', 15], ['Working with dentists', 40], ['Contact form', 88]],
    timeBuckets: [0.14, 0.13, 0.18, 0.32, 0.23],
    sources: SRC_SEARCH,
    terms: [['tmj therapy munich', 7.3, 1060, 39], ['jaw physiotherapy munich', 9.8, 540, 12]],
    mobile: 0.64, mobF: 0.9, deskF: 1.2, load: [2.1, 1.2], calc: null,
    paths: [['Requested directly on this page', 2]] },
  { id: 'p10', path: '/massage-schwabing', name: 'Massage', share: 0.05, seed: 0.9,
    r1: [[0, 0.045]], time: [[0, 58]], scroll: [[0, 0.4]],
    channels: [[BOOK, 0.58, 2.2], ['Call', 0.2, 2.8], ['WhatsApp', 0.16, 1.8], ['Email', 0.06, 1.2]],
    elements: [['Headline and offer', 0], ['Prices', 20], ['Online booking', 35], ['Reviews', 60]],
    timeBuckets: [0.2, 0.2, 0.24, 0.25, 0.11],
    sources: SRC_SEARCH,
    terms: [['massage schwabing', 3.9, 1670, 132], ['massage schwabing prices', 6.2, 480, 27]],
    mobile: 0.78, mobF: 0.95, deskF: 1.15, load: [1.9, 1.1],
    calc: funnel([88, 79, 70, 63, 60]),
    paths: [['Requested directly on this page', 8], ['Home page, then this page, then request', 2]] },
  { id: 'p11', path: '/home-visits', name: 'Home visits', share: 0.03, seed: 2.1,
    r1: [[0, 0.052]], time: [[0, 64]], scroll: [[0, 0.38]],
    channels: [['Call', 0.66, 2.4], ['Contact form', 0.22, 1.4], ['Email', 0.12, 1.2]],
    elements: [['Headline and offer', 0], ['Service area', 25], ['Home visits with prescription', 45], ['Contact form', 85]],
    timeBuckets: [0.2, 0.2, 0.23, 0.25, 0.12],
    sources: SRC_SEARCH,
    terms: [['physiotherapy home visit munich', 4.1, 980, 66]],
    mobile: 0.6, mobF: 0.95, deskF: 1.1, load: [2.0, 1.1], calc: null,
    paths: [['Requested directly on this page', 3]] },
  { id: 'p12', path: '/prices-self-pay', name: 'Prices and self-pay', share: 0.06, seed: 1.3,
    r1: [[0, 0.068]], time: [[0, 88]], scroll: [[0, 0.56]],
    channels: [[BOOK, 0.46, 2.3], ['Call', 0.26, 2.6], ['WhatsApp', 0.16, 1.7], ['Contact form', 0.12, 1.3]],
    elements: [['Headline and offer', 0], ['Price list', 15], ['Private insurance reimbursement', 35], ['Online booking', 50], ['Contact form', 82]],
    timeBuckets: [0.1, 0.12, 0.2, 0.36, 0.22],
    sources: [['Internal links', 0.64, 1.0], ['Google search', 0.28, 0.9], ['Direct', 0.08, 1.2]],
    terms: [['self-pay physiotherapy cost munich', 7.9, 760, 26]],
    mobile: 0.65, mobF: 0.9, deskF: 1.2, load: [1.9, 1.1],
    calc: funnel([60, 54, 49, 41, 38]),
    paths: [['Service page, then this page, then request', 16], ['Home page, then this page, then request', 5]] }
];

export const CHANGES: Change[] = [
  { at: 40, num: 1, date: 'Jul 27', pages: ['p3'], title: 'Title and description for Google rewritten', metric: 'Click rate', before: '2,8 %', after: '3,9 %', verdict: 'Likely' },
  { at: 42, num: 2, date: 'Aug 10', pages: ['p2'], title: 'Online booking and reviews moved up', metric: 'Rate 1', before: '3,0 %', after: '4,1 %', verdict: 'Clear' },
  { at: 44, num: 3, date: 'Aug 24', pages: ['p3'], title: 'Section on costs and reimbursement added', metric: 'Rate 1', before: '1,6 %', after: '2,2 %', verdict: 'Likely' }
];

export const INQUIRIES: Inquiry[] = [
  [16, 'Oct 21, 20:41', BOOK, 'p2', 'Google search', 'Mobile', '2:50'],
  [15, 'Oct 21, 13:12', 'Call', 'p1', 'Google Business Profile', 'Mobile', '0:41'],
  [14, 'Oct 21, 08:05', BOOK, 'p10', 'Google search', 'Mobile', '1:35'],
  [13, 'Oct 20, 19:27', 'Contact form', 'p3', 'Google search', 'Desktop', '5:12'],
  [12, 'Oct 20, 11:48', BOOK, 'p12', 'Internal links', 'Desktop', '3:20'],
  [11, 'Oct 20, 07:52', 'Call', 'p4', 'Google search', 'Mobile', '0:29'],
  [10, 'Oct 19, 21:15', BOOK, 'p2', 'Google search', 'Mobile', '2:05'],
  [9, 'Oct 19, 16:30', 'WhatsApp', 'p8', 'Social media', 'Mobile', '1:18'],
  [8, 'Oct 18, 18:02', 'Call', 'p11', 'Google search', 'Desktop', '1:44'],
  [7, 'Oct 18, 09:40', BOOK, 'p3', 'Google search', 'Desktop', '4:31'],
  [6, 'Oct 17, 17:55', 'Call', 'p6', 'Google search', 'Mobile', '0:52'],
  [5, 'Oct 17, 10:21', 'Contact form', 'p9', 'Google search', 'Desktop', '3:48'],
  [4, 'Oct 16, 15:09', BOOK, 'p5', 'Google search', 'Mobile', '1:57'],
  [3, 'Oct 16, 08:33', 'Call', 'p7', 'Google Business Profile', 'Mobile', '0:46']
];

/* ---------- weekly series (52 weeks, deterministic) ---------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKS = 52;
export const LABELS: string[] = Array.from({ length: WEEKS }, (_, i) => {
  const d = new Date(Date.UTC(2025, 9, 20) + i * 7 * 864e5);
  return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate();
});

type RawWeek = Omit<Week, 'label' | 'r1'>;

function stepAt(steps: Steps, i: number): number {
  let v = steps[0][1];
  steps.forEach((s) => {
    if (i >= s[0]) v = s[1];
  });
  return v;
}

function buildSeries(p: PageSeed): RawWeek[] {
  return Array.from({ length: WEEKS }, (_, i) => {
    const site = 470 + i * 1.2 + 35 * Math.sin(i * 0.9) + 20 * Math.cos(i * 0.37);
    const boost = p.visBoost && i >= p.visBoost[0] ? p.visBoost[1] : 1;
    const vis = Math.max(1, Math.round(((site * p.share) / 0.85) * boost * (1 + 0.07 * Math.sin(i * p.seed))));
    const r1 = stepAt(p.r1, i) * (1 + 0.1 * Math.sin(i * 1.7 + p.seed));
    const inq = Math.round(vis * r1);
    const time = stepAt(p.time, i) * (1 + 0.06 * Math.sin(i * 1.3 + p.seed));
    const scroll = Math.min(0.95, stepAt(p.scroll, i) * (1 + 0.07 * Math.sin(i * 0.8 + p.seed)));
    return { vis, inq, time, scroll, cta: Math.round(inq * 1.7 + vis * 0.004) };
  });
}

function withRates(arr: RawWeek[]): Week[] {
  return arr.map((x, i) => ({ label: LABELS[i], r1: x.vis ? x.inq / x.vis : 0, ...x }));
}

const RAW = PAGE_SEEDS.map(buildSeries);

export const PAGES: Page[] = PAGE_SEEDS.map((p, i) => ({
  ...p,
  slug: p.path === '/' ? 'home' : p.path.slice(1),
  series: withRates(RAW[i]),
}));

export const BY_ID: Record<string, Page> = Object.fromEntries(PAGES.map((p) => [p.id, p]));
export const BY_SLUG: Record<string, Page> = Object.fromEntries(PAGES.map((p) => [p.slug, p]));

/** Whole-site weekly series: sums, with time and scroll weighted by visitors. */
export const SITE: Week[] = withRates(
  Array.from({ length: WEEKS }, (_, w) => {
    const o = { vis: 0, inq: 0, cta: 0, time: 0, scroll: 0 };
    RAW.forEach((series) => {
      const x = series[w];
      o.vis += x.vis;
      o.inq += x.inq;
      o.cta += x.cta;
      o.time += x.time * x.vis;
      o.scroll += x.scroll * x.vis;
    });
    o.time /= o.vis;
    o.scroll /= o.vis;
    return o;
  }),
);
