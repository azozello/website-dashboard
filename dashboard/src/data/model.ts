/**
 * Dashboard data model: the report data of one site, from GET /api/sites/:siteId/stats (api/src/stats.ts).
 *
 * The API returns raw counts (visits, converting visits, engaged page views, sums of active time…);
 * lib/analysis.ts turns them into the §11 metrics. Loaded per site and range by data/stats.tsx.
 */

export type Tone = 'good' | 'warn' | 'info';

/* ---------- API response (keep in sync with api/src/stats.ts) ---------- */

export interface RawWeek {
  vis: number;
  conv: number;
  inq: number;
  cta: number;
  pvs: number;
  eng: number;
  activeMs: number;
  s75: number;
}

export interface SourceRow {
  name: string;
  vis: number;
  conv: number;
  inq: number;
}
export interface RawDeviceRow extends SourceRow {
  pvs: number;
  eng: number;
  activeMs: number;
  s75: number;
  loadMs: number;
  loadN: number;
}
export interface Breakdown {
  sources: SourceRow[];
  devices: RawDeviceRow[];
  clicks: Record<string, number>;
  requests: Record<string, number>;
  scroll: { eng: number; s25: number; s50: number; s75: number; s100: number };
  time: number[];
  sections: { name: string; n: number }[];
}
export interface Funnel {
  flow: 'booking' | 'calculator';
  flowId: string;
  startPath: string | null;
  steps: { step: number; name: string | null; visits: number }[];
}
export interface RouteRow {
  path: string | null;
  route: string[];
  n: number;
}
export interface RequestRow {
  at: string;
  channel: string;
  form: string | null;
  path: string | null;
  source: string | null;
  device: string | null;
  secondsBefore: number | null;
}
export interface SearchTerm {
  query: string;
  clicks: number;
  impressions: number;
  /** Average Google position (1 = top); null without impressions. */
  position: number | null;
  /** Site-wide list: the page that gets most of the term's clicks. */
  path?: string;
}
/** Google search from Search Console for the range. Totals include anonymised queries; terms don't. */
export interface PageSearch {
  clicks: number;
  impressions: number;
  position: number | null;
  terms: SearchTerm[];
}
export type SearchStatus = 'unavailable' | 'not_connected' | 'needs_property' | 'active' | 'error';
export interface SearchData extends PageSearch {
  status: SearchStatus;
  property: string | null;
  lastSyncAt: string | null;
  /** Newest day imported (YYYY-MM-DD). */
  through: string | null;
}
export interface StatsResponse {
  timezone: string;
  generatedAt: string;
  weeks: string[];
  range: { weeks: number; from: string };
  site: { series: RawWeek[]; breakdown: Breakdown; unattributed: number };
  pages: { path: string; title: string | null; series: RawWeek[]; breakdown: Breakdown; search: PageSearch }[];
  funnels: Funnel[];
  routes: RouteRow[];
  requests: RequestRow[];
  search: SearchData;
}

/* ---------- What the views render ---------- */

/** One week of a page or of the whole site: raw counts plus the derived metrics. */
export interface Week extends RawWeek {
  label: string;
  /** Mean active seconds per engaged page view. */
  time: number;
  /** Share of engaged page views read to 75 %. */
  scroll: number;
  /** Converting visits ÷ visits. */
  r1: number;
}

export interface Page {
  /** The normalised path; unique per site. */
  id: string;
  slug: string;
  path: string;
  name: string;
  series: Week[];
  bd: Breakdown;
  search: PageSearch;
}

export interface SiteData {
  timezone: string;
  site: Week[];
  bd: Breakdown;
  unattributed: number;
  pages: Page[];
  byId: Record<string, Page>;
  bySlug: Record<string, Page>;
  funnels: Funnel[];
  routes: RouteRow[];
  requests: RequestRow[];
  search: SearchData;
  /** Range the breakdowns cover (weeks). */
  rangeWeeks: number;
}

/** Weeks in every series (the 6-month range compares the last 26 weeks with the 26 before). */
export const WEEKS = 52;

export const SOURCE_NAME: Record<string, string> = {
  google_ads: 'Google Ads',
  google_organic: 'Google search',
  other_search: 'Other search engines',
  social: 'Social media',
  referral: 'Other websites',
  campaign: 'Campaigns',
  direct: 'Direct',
};
export const DEVICE_NAME: Record<string, string> = { mobile: 'Mobile', desktop: 'Desktop', tablet: 'Tablet' };
export const CHANNEL_NAME: Record<string, string> = { form: 'Contact form', booking: 'Online booking', calculator: 'Calculator' };
export const FLOW_NAME: Record<string, string> = { booking: 'Online booking', calculator: 'Calculator' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11-16" → "Nov 16". */
export const weekLabel = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1] + ' ' + Number(iso.slice(8, 10));

export function toWeek(w: RawWeek, label: string): Week {
  return { ...w, label, time: w.eng ? w.activeMs / w.eng / 1000 : 0, scroll: w.eng ? w.s75 / w.eng : 0, r1: w.vis ? w.conv / w.vis : 0 };
}

/** "/" → "home", "/leistungen/rücken/" → "leistungen-r-cken"; unique within the site. */
function slugs(paths: string[]): string[] {
  const used = new Set<string>();
  return paths.map((p) => {
    const base = p === '/' ? 'home' : p.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'page';
    let s = base;
    for (let i = 2; used.has(s); i++) s = `${base}-${i}`;
    used.add(s);
    return s;
  });
}

export function buildSiteData(r: StatsResponse): SiteData {
  const labels = r.weeks.map(weekLabel);
  const series = (s: RawWeek[]) => s.map((w, i) => toWeek(w, labels[i]));
  // Page titles often repeat the site name only; a title shared by several pages says nothing, so use the path.
  const titleCount = new Map<string, number>();
  r.pages.forEach((p) => p.title && titleCount.set(p.title, (titleCount.get(p.title) ?? 0) + 1));
  const sl = slugs(r.pages.map((p) => p.path));
  const pages: Page[] = r.pages.map((p, i) => ({
    id: p.path,
    slug: sl[i],
    path: p.path,
    name: p.title && titleCount.get(p.title) === 1 ? p.title : p.path === '/' ? 'Home page' : p.path,
    series: series(p.series),
    bd: p.breakdown,
    search: p.search ?? { clicks: 0, impressions: 0, position: null, terms: [] },
  }));
  return {
    timezone: r.timezone,
    site: series(r.site.series),
    bd: r.site.breakdown,
    unattributed: r.site.unattributed,
    pages,
    byId: Object.fromEntries(pages.map((p) => [p.id, p])),
    bySlug: Object.fromEntries(pages.map((p) => [p.slug, p])),
    funnels: r.funnels,
    routes: r.routes,
    requests: r.requests,
    search: r.search ?? { status: 'unavailable', property: null, lastSyncAt: null, through: null, clicks: 0, impressions: 0, position: null, terms: [] },
    rangeWeeks: r.range.weeks,
  };
}

/** Any non-test visit or page view in the last 52 weeks. */
export const hasData = (d: SiteData) => d.site.some((w) => w.vis > 0 || w.pvs > 0);
