import type { FastifyInstance } from 'fastify';
import type { Db } from './db.ts';
import type { Guards } from './tenant.ts';

/**
 * Report data for the dashboard: GET /api/sites/:siteId/stats?weeks=4|13|26.
 *
 * Reads ingest's tracking tables (contract §10) and returns raw counts; the dashboard turns
 * them into the §11 metrics (rates, means, Wilson ranges). Rules applied here:
 *
 *   - test visits, and everything belonging to them, are left out
 *   - a counted request is `counts AND NOT spam`; requests without a visit (Wix webhook,
 *     tracker blocked) count in the site's request total only
 *   - weeks start on Monday in the site's timezone; `series` covers the last 52 weeks,
 *     the current (partial) week last
 *   - pages: Rate 1 by landing page (the PoC default), so a page's visits are the visits
 *     that started on it. Time, scroll, clicks and sections come from the page's own views.
 *   - breakdowns cover the selected range only: the current week and the `weeks - 1` before it
 *
 * Every query filters by the site id from the tenant guard.
 */

export const WEEKS = 52;
export const RANGES = [4, 13, 26] as const;
/** Pages listed: the most viewed paths in the 52 weeks. */
export const MAX_PAGES = 30;
export const MAX_REQUESTS = 200;
export const MAX_ROUTES = 100;
const MAX_SECTIONS = 20;
const ROUTE_STEPS = 4;

/** Upper bounds of the time-on-page buckets in seconds; the last bucket is open. */
export const TIME_BUCKETS = [10, 30, 60, 180] as const;

export interface RawWeek {
  /** Visits started (pages: started on this page). */
  vis: number;
  /** Of those, visits with a counted request. */
  conv: number;
  /** Counted requests (site: received this week, incl. unattributed; pages: of the page's visits). */
  inq: number;
  /** Contact clicks. */
  cta: number;
  /** Page views, and those with engagement data. */
  pvs: number;
  eng: number;
  /** Sum of active_ms over engaged page views. */
  activeMs: number;
  /** Engaged page views that reached 75 % scroll. */
  s75: number;
}

export interface SourceRow {
  name: string;
  vis: number;
  conv: number;
  inq: number;
}
export interface DeviceRow extends SourceRow {
  pvs: number;
  eng: number;
  activeMs: number;
  s75: number;
  loadMs: number;
  loadN: number;
}
export interface Breakdown {
  sources: SourceRow[];
  devices: DeviceRow[];
  /** Contact clicks by kind (call, whatsapp, email, booking_cta). */
  clicks: Record<string, number>;
  /** Counted requests sent from the page, by channel (form, booking, calculator). */
  requests: Record<string, number>;
  /** Engaged page views; how many reached 25/50/75/100 % scroll. */
  scroll: { eng: number; s25: number; s50: number; s75: number; s100: number };
  /** Engaged page views per TIME_BUCKETS bucket (5 entries). */
  time: number[];
  /** Engaged page views on which each section was seen. */
  sections: { name: string; n: number }[];
}

export interface SearchTerm {
  query: string;
  clicks: number;
  impressions: number;
  /** Average position weighted by impressions (1 = top); null without impressions. */
  position: number | null;
  /** Site-wide list: the page that gets most of the term's clicks (impressions on a tie). */
  path?: string;
}

/** Google search for the range, from Search Console (gsc_daily). Totals include anonymised queries; terms don't. */
export interface PageSearch {
  clicks: number;
  impressions: number;
  position: number | null;
  terms: SearchTerm[];
}

export interface SearchData extends PageSearch {
  /** unavailable: this server can't connect Search Console; otherwise the site's connection. */
  status: 'unavailable' | 'not_connected' | 'needs_property' | 'active' | 'error';
  property: string | null;
  lastSyncAt: string | null;
  /** Newest day imported (Search Console days are Pacific Time); null before the first sync. */
  through: string | null;
}

export interface PageData {
  path: string;
  title: string | null;
  series: RawWeek[];
  breakdown: Breakdown;
  search: PageSearch;
}

export interface Funnel {
  flow: 'booking' | 'calculator';
  flowId: string;
  /** Most common page of step 1. */
  startPath: string | null;
  steps: { step: number; name: string | null; visits: number }[];
}

export interface RouteRow {
  /** Page the request was sent from. */
  path: string | null;
  /** Paths viewed in the visit up to the request, repeats collapsed; "…" marks left-out steps. */
  route: string[];
  n: number;
}

export interface RequestRow {
  at: string;
  channel: string;
  /** Form name from the request rules, else the form id the sender gave. */
  form: string | null;
  path: string | null;
  source: string | null;
  device: string | null;
  /** Seconds from the start of the visit to the request; null when unattributed. */
  secondsBefore: number | null;
}

export interface Stats {
  timezone: string;
  generatedAt: string;
  /** Monday of each week (site timezone), YYYY-MM-DD, oldest first. */
  weeks: string[];
  range: { weeks: number; from: string };
  site: { series: RawWeek[]; breakdown: Breakdown; unattributed: number };
  pages: PageData[];
  funnels: Funnel[];
  routes: RouteRow[];
  requests: RequestRow[];
  search: SearchData;
}

export const MAX_TERMS = 200;
export const MAX_PAGE_TERMS = 20;

type Q = Pick<Db, 'query'>;

const emptySearch = (): PageSearch => ({ clicks: 0, impressions: 0, position: null, terms: [] });

/** gsc_daily days within the range: $2 = from, $3 = now (timestamptz), $4 = site timezone. */
const GSC_RANGE = `date >= ($2::timestamptz AT TIME ZONE $4)::date AND date <= ($3::timestamptz AT TIME ZONE $4)::date`;
const POSITION = `(sum(position * impressions) / nullif(sum(impressions), 0))::float8`;

/** The site's Search Console connection, totals and top terms (each with its main landing page). */
async function siteSearch(db: Q, siteId: string, from: Date, now: Date, tz: string, available: boolean): Promise<SearchData> {
  const head = { status: 'unavailable' as SearchData['status'], property: null as string | null, lastSyncAt: null as string | null, through: null as string | null };
  if (!available) return { ...head, ...emptySearch() };
  const D = [siteId, from, now, tz];
  const [conn, tot, terms] = await Promise.all([
    db.query<{ status: SearchData['status']; property: string | null; last_sync_at: Date | null; through: string | null }>(
      `SELECT status, property, last_sync_at, to_char(synced_through, 'YYYY-MM-DD') AS through FROM gsc_connections WHERE site_id = $1`,
      [siteId],
    ),
    db.query<{ clicks: number; impressions: number; position: number | null }>(
      `SELECT coalesce(sum(clicks), 0)::int AS clicks, coalesce(sum(impressions), 0)::int AS impressions, ${POSITION} AS position
         FROM gsc_daily WHERE site_id = $1 AND query IS NULL AND ${GSC_RANGE}`,
      D,
    ),
    db.query<SearchTerm>(
      `WITH qp AS (
         SELECT query, path, sum(clicks) AS c, sum(impressions) AS i, sum(position * impressions) AS pw
           FROM gsc_daily WHERE site_id = $1 AND query IS NOT NULL AND ${GSC_RANGE} GROUP BY query, path)
       SELECT query, sum(c)::int AS clicks, sum(i)::int AS impressions, (sum(pw) / nullif(sum(i), 0))::float8 AS position,
              (array_agg(path ORDER BY c DESC, i DESC, path))[1] AS path
         FROM qp GROUP BY query ORDER BY clicks DESC, impressions DESC, query LIMIT ${MAX_TERMS}`,
      D,
    ),
  ]);
  const c = conn.rows[0];
  return {
    status: c?.status ?? 'not_connected',
    property: c?.status === 'active' ? c.property : null,
    lastSyncAt: c?.last_sync_at?.toISOString() ?? null,
    through: c?.through ?? null,
    ...tot.rows[0],
    terms: terms.rows,
  };
}

/** Per listed page: Search Console totals and its top MAX_PAGE_TERMS terms (§11: joined on the normalised path). */
async function pagesSearch(db: Q, siteId: string, from: Date, now: Date, tz: string, pages: Map<string, PageData>) {
  if (!pages.size) return;
  const D = [siteId, from, now, tz, [...pages.keys()]];
  const [tot, terms] = await Promise.all([
    db.query<{ path: string; clicks: number; impressions: number; position: number | null }>(
      `SELECT path, sum(clicks)::int AS clicks, sum(impressions)::int AS impressions, ${POSITION} AS position
         FROM gsc_daily WHERE site_id = $1 AND query IS NULL AND path = ANY($5) AND ${GSC_RANGE} GROUP BY path`,
      D,
    ),
    db.query<SearchTerm & { path: string }>(
      `SELECT path, query, clicks, impressions, position FROM (
         SELECT path, query, sum(clicks)::int AS clicks, sum(impressions)::int AS impressions, ${POSITION} AS position,
                row_number() OVER (PARTITION BY path ORDER BY sum(clicks) DESC, sum(impressions) DESC, query) AS rn
           FROM gsc_daily WHERE site_id = $1 AND query IS NOT NULL AND path = ANY($5) AND ${GSC_RANGE} GROUP BY path, query) x
        WHERE rn <= ${MAX_PAGE_TERMS} ORDER BY path, rn`,
      D,
    ),
  ]);
  for (const r of tot.rows) Object.assign(pages.get(r.path)!.search, { clicks: r.clicks, impressions: r.impressions, position: r.position });
  for (const { path, ...t } of terms.rows) pages.get(path)?.search.terms.push(t);
}

const emptyWeek = (): RawWeek => ({ vis: 0, conv: 0, inq: 0, cta: 0, pvs: 0, eng: 0, activeMs: 0, s75: 0 });
const emptyBreakdown = (): Breakdown => ({
  sources: [],
  devices: [],
  clicks: {},
  requests: {},
  scroll: { eng: 0, s25: 0, s50: 0, s75: 0, s100: 0 },
  time: [0, 0, 0, 0, 0],
  sections: [],
});

export function validTimezone(tz: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

/** Week index (0 = oldest) of a timestamptz column, in the site's timezone. $2 = timezone, $3 = first week's local start. */
const wk = (col: string) => `floor(extract(epoch FROM (${col} AT TIME ZONE $2) - $3::timestamp) / 604800)::int`;

/** Visits that are not test visits, with their counted requests. $1 = site. */
const COUNTED = `SELECT visit_id, count(*)::int AS n FROM requests WHERE site_id = $1 AND counts AND NOT spam AND visit_id IS NOT NULL GROUP BY visit_id`;
/** Counted requests not belonging to a test visit (unattributed ones included), with the page view they were sent from. */
const COUNTED_REQUESTS = `requests r LEFT JOIN visits rv ON rv.id = r.visit_id
  LEFT JOIN pageviews rp ON rp.site_id = r.site_id AND rp.pv = r.pv
  WHERE r.site_id = $1 AND r.counts AND NOT r.spam AND (rv.id IS NULL OR NOT rv.test)`;

/** opts.gsc: whether this server can connect Search Console (else search.status is 'unavailable'). */
export async function computeStats(db: Q, siteId: string, opts: { weeks: number; now?: Date; gsc?: boolean }): Promise<Stats> {
  const now = opts.now ?? new Date();
  const site = (await db.query<{ timezone: string; request_rules: unknown }>(
    `SELECT s.timezone, c.request_rules FROM sites s LEFT JOIN site_config c ON c.site_id = s.id WHERE s.id = $1`,
    [siteId],
  )).rows[0];
  const tz = validTimezone(site?.timezone ?? 'UTC');

  // Week boundaries in the site's timezone: local timestamps for bucketing, timestamptz for filtering.
  const b = (
    await db.query<{ start_local: string; start: Date; from: Date; weeks: string[] }>(
      `WITH w AS (SELECT date_trunc('week', $1::timestamptz AT TIME ZONE $2) AS cur)
       SELECT to_char(cur - interval '${WEEKS - 1} weeks', 'YYYY-MM-DD HH24:MI:SS') AS start_local,
              (cur - interval '${WEEKS - 1} weeks') AT TIME ZONE $2 AS start,
              (cur - make_interval(weeks => $3::int - 1)) AT TIME ZONE $2 AS "from",
              ARRAY(SELECT to_char(d, 'YYYY-MM-DD') FROM generate_series(cur - interval '${WEEKS - 1} weeks', cur, interval '1 week') d) AS weeks
       FROM w`,
      [now, tz, opts.weeks],
    )
  ).rows[0];

  const tracking = (await db.query<{ ok: boolean }>(`SELECT to_regclass('pageviews') IS NOT NULL AND to_regclass('flow_steps') IS NOT NULL AS ok`)).rows[0].ok;
  const out: Stats = {
    timezone: tz,
    generatedAt: now.toISOString(),
    weeks: b.weeks,
    range: { weeks: opts.weeks, from: b.from.toISOString() },
    site: { series: Array.from({ length: WEEKS }, emptyWeek), breakdown: emptyBreakdown(), unattributed: 0 },
    pages: [],
    funnels: [],
    routes: [],
    requests: [],
    search: await siteSearch(db, siteId, b.from, now, tz, opts.gsc ?? false),
  };
  // Ingest hasn't created its tables (development database): nothing more to report.
  if (!tracking) return out;

  const P = [siteId, tz, b.start_local, b.start, now];
  const R = [siteId, b.from, now];
  const num = (v: unknown) => Number(v ?? 0);

  // ---------------------------------------------------------------- weekly series
  const [visitRows, inqRows, pvRows, clickRows] = await Promise.all([
    db.query<{ path: string | null; site: boolean; wk: number; vis: number; conv: number; inq: number }>(
      `SELECT x.landing_path AS path, grouping(x.landing_path) = 1 AS site, x.wk,
              count(*)::int AS vis, count(x.n)::int AS conv, coalesce(sum(x.n), 0)::int AS inq
         FROM (SELECT v.landing_path, ${wk('v.started_at')} AS wk, r.n
                 FROM visits v LEFT JOIN (${COUNTED}) r ON r.visit_id = v.id
                WHERE v.site_id = $1 AND NOT v.test AND v.started_at >= $4 AND v.started_at <= $5) x
        GROUP BY GROUPING SETS ((x.wk), (x.landing_path, x.wk))`,
      P,
    ),
    db.query<{ wk: number; inq: number }>(
      `SELECT ${wk('r.received_at')} AS wk, count(*)::int AS inq FROM ${COUNTED_REQUESTS} AND r.received_at >= $4 AND r.received_at <= $5 GROUP BY 1`,
      P,
    ),
    db.query<{ path: string | null; site: boolean; wk: number; pvs: number; eng: number; active: string; s75: number }>(
      `SELECT x.path, grouping(x.path) = 1 AS site, x.wk, count(*)::int AS pvs,
              count(*) FILTER (WHERE x.has_engage)::int AS eng,
              coalesce(sum(x.active_ms) FILTER (WHERE x.has_engage), 0)::bigint AS active,
              count(*) FILTER (WHERE x.has_engage AND x.scroll >= 75)::int AS s75
         FROM (SELECT p.path, ${wk('p.received_at')} AS wk, p.has_engage, p.active_ms, p.scroll
                 FROM pageviews p JOIN visits v ON v.id = p.visit_id
                WHERE p.site_id = $1 AND NOT v.test AND p.received_at >= $4 AND p.received_at <= $5) x
        GROUP BY GROUPING SETS ((x.wk), (x.path, x.wk))`,
      P,
    ),
    db.query<{ path: string | null; site: boolean; wk: number; n: number }>(
      `SELECT x.path, grouping(x.path) = 1 AS site, x.wk, count(*)::int AS n
         FROM (SELECT p.path, ${wk('c.received_at')} AS wk
                 FROM clicks c JOIN visits v ON v.id = c.visit_id
                 LEFT JOIN pageviews p ON p.site_id = c.site_id AND p.pv = c.pv
                WHERE c.site_id = $1 AND NOT v.test AND c.received_at >= $4 AND c.received_at <= $5) x
        GROUP BY GROUPING SETS ((x.wk), (x.path, x.wk))`,
      P,
    ),
  ]);

  // Pages: the most viewed paths over the 52 weeks.
  const views = new Map<string, number>();
  for (const r of pvRows.rows) if (!r.site && r.path !== null) views.set(r.path, (views.get(r.path) ?? 0) + r.pvs);
  const paths = [...views].sort((a, c) => c[1] - a[1] || a[0].localeCompare(c[0])).slice(0, MAX_PAGES).map(([p]) => p);
  const pages = new Map<string, PageData>(
    paths.map((p) => [p, { path: p, title: null, series: Array.from({ length: WEEKS }, emptyWeek), breakdown: emptyBreakdown(), search: emptySearch() }]),
  );

  const week = (path: string | null, site: boolean, i: number): RawWeek | null => {
    if (i < 0 || i >= WEEKS) return null;
    if (site) return out.site.series[i];
    return path === null ? null : (pages.get(path)?.series[i] ?? null);
  };
  for (const r of visitRows.rows) {
    const w = week(r.path, r.site, r.wk);
    if (!w) continue;
    w.vis += r.vis;
    w.conv += r.conv;
    if (!r.site) w.inq += r.inq; // site requests come from inqRows (incl. unattributed)
  }
  for (const r of inqRows.rows) {
    const w = week(null, true, r.wk);
    if (w) w.inq += r.inq;
  }
  for (const r of pvRows.rows) {
    const w = week(r.path, r.site, r.wk);
    if (!w) continue;
    w.pvs += r.pvs;
    w.eng += r.eng;
    w.activeMs += num(r.active);
    w.s75 += r.s75;
  }
  for (const r of clickRows.rows) {
    const w = week(r.path, r.site, r.wk);
    if (w) w.cta += r.n;
  }

  if (paths.length) {
    const titles = await db.query<{ path: string; title: string }>(
      `SELECT DISTINCT ON (path) path, title FROM pageviews
        WHERE site_id = $1 AND path = ANY($2) AND title IS NOT NULL AND title <> '' AND received_at >= $3
        ORDER BY path, received_at DESC`,
      [siteId, paths, b.start],
    );
    for (const r of titles.rows) pages.get(r.path)!.title = r.title;
  }

  // ---------------------------------------------------------------- breakdowns for the range
  const bd = (path: string | null, site: boolean): Breakdown | null => (site ? out.site.breakdown : path === null ? null : (pages.get(path)?.breakdown ?? null));
  const VIS = `FROM visits v LEFT JOIN (${COUNTED}) r ON r.visit_id = v.id WHERE v.site_id = $1 AND NOT v.test AND v.started_at >= $2 AND v.started_at <= $3`;
  const PV = `FROM pageviews p JOIN visits v ON v.id = p.visit_id WHERE p.site_id = $1 AND NOT v.test AND p.received_at >= $2 AND p.received_at <= $3`;

  const [srcRows, devRows, devPvRows, engRows, secRows, kindRows, chRows, unattr] = await Promise.all([
    db.query<{ path: string | null; site: boolean; name: string; vis: number; conv: number; inq: number }>(
      `SELECT v.landing_path AS path, grouping(v.landing_path) = 1 AS site, v.source_channel AS name,
              count(*)::int AS vis, count(r.n)::int AS conv, coalesce(sum(r.n), 0)::int AS inq
         ${VIS} GROUP BY GROUPING SETS ((v.source_channel), (v.landing_path, v.source_channel))`,
      R,
    ),
    db.query<{ path: string | null; site: boolean; name: string; vis: number; conv: number; inq: number }>(
      `SELECT v.landing_path AS path, grouping(v.landing_path) = 1 AS site, v.device AS name,
              count(*)::int AS vis, count(r.n)::int AS conv, coalesce(sum(r.n), 0)::int AS inq
         ${VIS} GROUP BY GROUPING SETS ((v.device), (v.landing_path, v.device))`,
      R,
    ),
    db.query<{ path: string | null; site: boolean; name: string; pvs: number; eng: number; active: string; s75: number; load: string; load_n: number }>(
      `SELECT p.path, grouping(p.path) = 1 AS site, v.device AS name, count(*)::int AS pvs,
              count(*) FILTER (WHERE p.has_engage)::int AS eng,
              coalesce(sum(p.active_ms) FILTER (WHERE p.has_engage), 0)::bigint AS active,
              count(*) FILTER (WHERE p.has_engage AND p.scroll >= 75)::int AS s75,
              coalesce(sum(p.load_ms), 0)::bigint AS load, count(p.load_ms)::int AS load_n
         ${PV} GROUP BY GROUPING SETS ((v.device), (p.path, v.device))`,
      R,
    ),
    db.query<{ path: string | null; site: boolean; eng: number; s25: number; s50: number; s75: number; s100: number; t0: number; t1: number; t2: number; t3: number; t4: number }>(
      `SELECT p.path, grouping(p.path) = 1 AS site, count(*)::int AS eng,
              count(*) FILTER (WHERE p.scroll >= 25)::int AS s25, count(*) FILTER (WHERE p.scroll >= 50)::int AS s50,
              count(*) FILTER (WHERE p.scroll >= 75)::int AS s75, count(*) FILTER (WHERE p.scroll >= 100)::int AS s100,
              count(*) FILTER (WHERE coalesce(p.active_ms, 0) < ${TIME_BUCKETS[0] * 1000})::int AS t0,
              count(*) FILTER (WHERE p.active_ms >= ${TIME_BUCKETS[0] * 1000} AND p.active_ms < ${TIME_BUCKETS[1] * 1000})::int AS t1,
              count(*) FILTER (WHERE p.active_ms >= ${TIME_BUCKETS[1] * 1000} AND p.active_ms < ${TIME_BUCKETS[2] * 1000})::int AS t2,
              count(*) FILTER (WHERE p.active_ms >= ${TIME_BUCKETS[2] * 1000} AND p.active_ms < ${TIME_BUCKETS[3] * 1000})::int AS t3,
              count(*) FILTER (WHERE p.active_ms >= ${TIME_BUCKETS[3] * 1000})::int AS t4
         ${PV} AND p.has_engage GROUP BY GROUPING SETS ((), (p.path))`,
      R,
    ),
    db.query<{ path: string | null; site: boolean; name: string; n: number }>(
      `SELECT x.path, grouping(x.path) = 1 AS site, x.name, count(*)::int AS n
         FROM (SELECT p.path, unnest(p.sections) AS name ${PV} AND p.has_engage) x
        GROUP BY GROUPING SETS ((x.name), (x.path, x.name))`,
      R,
    ),
    db.query<{ path: string | null; site: boolean; name: string; n: number }>(
      `SELECT p.path, grouping(p.path) = 1 AS site, c.kind AS name, count(*)::int AS n
         FROM clicks c JOIN visits v ON v.id = c.visit_id LEFT JOIN pageviews p ON p.site_id = c.site_id AND p.pv = c.pv
        WHERE c.site_id = $1 AND NOT v.test AND c.received_at >= $2 AND c.received_at <= $3
        GROUP BY GROUPING SETS ((c.kind), (p.path, c.kind))`,
      R,
    ),
    db.query<{ path: string | null; site: boolean; name: string; n: number }>(
      `SELECT x.path, grouping(x.path) = 1 AS site, x.channel AS name, count(*)::int AS n
         FROM (SELECT coalesce(r.path, rp.path) AS path, r.channel
                 FROM ${COUNTED_REQUESTS}
                  AND r.received_at >= $2 AND r.received_at <= $3) x
        GROUP BY GROUPING SETS ((x.channel), (x.path, x.channel))`,
      R,
    ),
    db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM requests WHERE site_id = $1 AND counts AND NOT spam AND visit_id IS NULL AND received_at >= $2 AND received_at <= $3`,
      R,
    ),
  ]);

  for (const r of srcRows.rows) bd(r.path, r.site)?.sources.push({ name: r.name, vis: r.vis, conv: r.conv, inq: r.inq });
  // Device rows: visits (by landing page) and page views (by page), merged per device.
  const device = (x: Breakdown, name: string) => {
    let d = x.devices.find((e) => e.name === name);
    if (!d) x.devices.push((d = { name, vis: 0, conv: 0, inq: 0, pvs: 0, eng: 0, activeMs: 0, s75: 0, loadMs: 0, loadN: 0 }));
    return d;
  };
  for (const r of devRows.rows) {
    const x = bd(r.path, r.site);
    if (!x) continue;
    Object.assign(device(x, r.name), { vis: r.vis, conv: r.conv, inq: r.inq });
  }
  for (const r of devPvRows.rows) {
    const x = bd(r.path, r.site);
    if (!x) continue;
    Object.assign(device(x, r.name), { pvs: r.pvs, eng: r.eng, activeMs: num(r.active), s75: r.s75, loadMs: num(r.load), loadN: r.load_n });
  }
  for (const r of engRows.rows) {
    const x = bd(r.path, r.site);
    if (!x) continue;
    x.scroll = { eng: r.eng, s25: r.s25, s50: r.s50, s75: r.s75, s100: r.s100 };
    x.time = [r.t0, r.t1, r.t2, r.t3, r.t4];
  }
  for (const r of secRows.rows) bd(r.path, r.site)?.sections.push({ name: r.name, n: r.n });
  for (const x of [out.site.breakdown, ...[...pages.values()].map((p) => p.breakdown)]) {
    x.sections = x.sections.sort((a, c) => c.n - a.n || a.name.localeCompare(c.name)).slice(0, MAX_SECTIONS);
    x.sources.sort((a, c) => c.vis - a.vis);
  }
  for (const r of kindRows.rows) {
    const x = bd(r.path, r.site);
    if (x) x.clicks[r.name] = r.n;
  }
  for (const r of chRows.rows) {
    const x = bd(r.path, r.site);
    if (x) x.requests[r.name] = r.n;
  }
  out.site.unattributed = unattr.rows[0].n;

  // ---------------------------------------------------------------- funnels, routes, latest requests
  const [stepRows, startRows, routeRows, reqRows] = await Promise.all([
    db.query<{ flow: Funnel['flow']; flow_id: string; step: number; name: string | null; visits: number }>(
      `SELECT f.flow, f.flow_id, f.step, mode() WITHIN GROUP (ORDER BY f.name) AS name, count(DISTINCT f.visit_id)::int AS visits
         FROM flow_steps f JOIN visits v ON v.id = f.visit_id
        WHERE f.site_id = $1 AND NOT v.test AND f.received_at >= $2 AND f.received_at <= $3
        GROUP BY f.flow, f.flow_id, f.step ORDER BY f.flow_id, f.step`,
      R,
    ),
    db.query<{ flow_id: string; path: string }>(
      `SELECT DISTINCT ON (flow_id) flow_id, path FROM (
         SELECT f.flow_id, p.path, count(*) AS n
           FROM flow_steps f JOIN visits v ON v.id = f.visit_id JOIN pageviews p ON p.site_id = f.site_id AND p.pv = f.pv
          WHERE f.site_id = $1 AND NOT v.test AND f.step = 1 AND f.received_at >= $2 AND f.received_at <= $3
          GROUP BY f.flow_id, p.path) x
       ORDER BY flow_id, n DESC, path`,
      R,
    ),
    // Each counted request in a visit: the paths viewed up to the page it was sent from.
    db.query<{ path: string | null; route: string[] }>(
      `SELECT coalesce(r.path, rp.path) AS path, array_agg(p.path ORDER BY p.seq) AS route
         FROM requests r JOIN visits v ON v.id = r.visit_id
         LEFT JOIN pageviews rp ON rp.site_id = r.site_id AND rp.pv = r.pv
         JOIN pageviews p ON p.visit_id = r.visit_id AND CASE WHEN rp.seq IS NOT NULL THEN p.seq <= rp.seq ELSE p.received_at <= r.received_at END
        WHERE r.site_id = $1 AND r.counts AND NOT r.spam AND NOT v.test AND r.received_at >= $2 AND r.received_at <= $3
        GROUP BY r.id, coalesce(r.path, rp.path)`,
      R,
    ),
    db.query<{ at: Date; channel: string; confirmation: string; source: string | null; form_id: string | null; path: string | null; src: string | null; device: string | null; secs: number | null }>(
      `SELECT r.received_at AS at, r.channel, r.confirmation, r.source, r.form_id, coalesce(r.path, rp.path) AS path,
              rv.source_channel AS src, rv.device, floor(extract(epoch FROM r.received_at - rv.started_at))::int AS secs
         FROM ${COUNTED_REQUESTS}
          AND r.received_at >= $2 AND r.received_at <= $3
        ORDER BY r.received_at DESC LIMIT ${MAX_REQUESTS}`,
      R,
    ),
  ]);

  const starts = new Map(startRows.rows.map((r) => [r.flow_id, r.path]));
  for (const r of stepRows.rows) {
    let f = out.funnels.find((x) => x.flowId === r.flow_id);
    if (!f) out.funnels.push((f = { flow: r.flow, flowId: r.flow_id, startPath: starts.get(r.flow_id) ?? null, steps: [] }));
    f.steps.push({ step: r.step, name: r.name, visits: r.visits });
  }

  const routes = new Map<string, RouteRow>();
  for (const r of routeRows.rows) {
    const route = shortRoute(r.route);
    const key = JSON.stringify([r.path, route]);
    const row = routes.get(key);
    if (row) row.n++;
    else routes.set(key, { path: r.path, route, n: 1 });
  }
  out.routes = [...routes.values()].sort((a, c) => c.n - a.n || a.route.length - c.route.length).slice(0, MAX_ROUTES);

  const rules = Array.isArray(site?.request_rules) ? (site.request_rules as { method?: string; source?: string; form_id?: string | number; form?: string }[]) : [];
  out.requests = reqRows.rows.map((r) => ({
    at: r.at.toISOString(),
    channel: r.channel,
    form:
      (r.confirmation === 'server' && rules.find((x) => x.method === 'server' && x.source === r.source && String(x.form_id) === r.form_id)?.form) ||
      r.form_id,
    path: r.path,
    source: r.src,
    device: r.device,
    secondsBefore: r.secs === null ? null : Math.max(0, r.secs),
  }));

  if (opts.gsc) await pagesSearch(db, siteId, b.from, now, tz, pages);
  out.pages = [...pages.values()];
  return out;
}

/** Collapse repeats ("/a /a /b" → "/a /b") and keep long routes readable: first step, "…", last steps. */
export function shortRoute(route: string[]): string[] {
  const r = route.filter((p, i) => i === 0 || p !== route[i - 1]);
  return r.length <= ROUTE_STEPS ? r : [r[0], '…', ...r.slice(r.length - (ROUTE_STEPS - 2))];
}

export function registerStats(app: FastifyInstance, db: Db, { requireSite }: Guards, gscAvailable = false) {
  app.get(
    '/api/sites/:siteId/stats',
    {
      preHandler: requireSite('member'),
      schema: { querystring: { type: 'object', properties: { weeks: { type: 'integer', enum: [...RANGES] } } } },
    },
    async (req, reply) => {
      const weeks = (req.query as { weeks?: number }).weeks ?? 13;
      reply.header('cache-control', 'private, no-store');
      return computeStats(db, req.tenant!.siteId!, { weeks, gsc: gscAvailable });
    },
  );
}
