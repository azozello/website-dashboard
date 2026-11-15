import type { FastifyInstance } from 'fastify';
import type { Settings } from './config.ts';
import type { Db } from './db.ts';
import type { Guards } from './tenant.ts';

/**
 * Setup checklist, contract §12. GET /api/sites/:siteId/checks computes every check that
 * applies to the site's platform from the tracking tables, stores the results in
 * `site_checks` (§10) and returns them.
 *
 *   pass     the condition in §12 holds
 *   fail     it doesn't (reason says what is missing)
 *   pending  can't be decided yet: the data source doesn't exist (page scanner, Search
 *            Console) or the WordPress plugin hasn't said hello
 *
 * Tracking tables belong to ingest; each source is looked up with to_regclass so the
 * checklist also works on a database ingest hasn't migrated (development, tests).
 */

export const CHECKS = [
  ['script_live', 'all'],
  ['pages_tagged', 'all'],
  ['test_event', 'all'],
  ['plugin_ok', 'wordpress'],
  ['delay_js_ok', 'wordpress'],
  ['form_request', 'all'],
  ['wix_webhook', 'wix'],
  ['buttons_found', 'all'],
  ['csp_ok', 'all'],
  ['gsc_connected', 'all'],
] as const;
export type CheckId = (typeof CHECKS)[number][0];
export type Status = 'pass' | 'fail' | 'pending';

export interface CheckResult {
  id: CheckId;
  status: Status;
  /** Short code; the dashboard turns it into a sentence. */
  reason: string;
  /** Facts behind the result (last seen times, plugin names…). Not stored. */
  detail?: Record<string, unknown>;
}

const TABLES = ['pageviews', 'visits', 'requests', 'plugin_status', 'clicks', 'gsc_connections'] as const;

type Last = { at: Date; recent: boolean } | null;

/** Newest matching row's time, and whether it is within `window`. */
async function last(db: Db, sql: string, siteId: string, window: string): Promise<Last> {
  const { rows } = await db.query<{ at: Date; recent: boolean }>(
    `SELECT at, at > now() - $2::interval AS recent FROM (${sql} ORDER BY at DESC LIMIT 1) t`,
    [siteId, window],
  );
  return rows[0] ?? null;
}

const iso = (l: Last) => (l ? { lastAt: l.at.toISOString() } : undefined);

export async function computeChecks(db: Db, siteId: string, platform: string): Promise<CheckResult[]> {
  const t = (
    await db.query<Record<(typeof TABLES)[number], boolean>>(`SELECT ${TABLES.map((n) => `to_regclass('${n}') IS NOT NULL AS ${n}`).join(', ')}`)
  ).rows[0];
  const tracking = t.pageviews && t.visits;
  const pv = (test: boolean, window: string) =>
    tracking
      ? last(db, `SELECT p.received_at AS at FROM pageviews p JOIN visits v ON v.id = p.visit_id WHERE p.site_id = $1 AND ${test ? '' : 'NOT '}v.test`, siteId, window)
      : Promise.resolve(null);

  const [live, test, counted, webhook, click, hello, gsc] = await Promise.all([
    pv(false, '24 hours'),
    pv(true, '1 hour'),
    t.requests ? last(db, 'SELECT received_at AS at FROM requests WHERE site_id = $1 AND counts AND NOT spam', siteId, '7 days') : null,
    t.requests && platform === 'wix' ? last(db, `SELECT received_at AS at FROM requests WHERE site_id = $1 AND confirmation = 'webhook'`, siteId, '100 years') : null,
    t.clicks ? last(db, 'SELECT received_at AS at FROM clicks WHERE site_id = $1', siteId, '100 years') : null,
    t.plugin_status && platform === 'wordpress'
      ? db
          .query<{ env: Record<string, unknown>; at: Date; recent: boolean }>(
            `SELECT env, last_hello_at AS at, last_hello_at > now() - interval '24 hours' AS recent FROM plugin_status WHERE site_id = $1`,
            [siteId],
          )
          .then((r) => r.rows[0] ?? null)
      : null,
    t.gsc_connections
      ? db.query<{ status: string | null; property: string | null }>('SELECT status, property FROM gsc_connections WHERE site_id = $1', [siteId]).then((r) => r.rows[0] ?? null)
      : null,
  ]);

  const out: CheckResult[] = [];
  const add = (id: CheckId, status: Status, reason: string, detail?: Record<string, unknown>) => out.push({ id, status, reason, ...(detail ? { detail } : {}) });
  const applies = (scope: string) => scope === 'all' || scope === platform;

  for (const [id, scope] of CHECKS) {
    if (!applies(scope)) continue;
    switch (id) {
      case 'script_live':
        if (!tracking) add(id, 'pending', 'no_tracking_data');
        else if (live?.recent) add(id, 'pass', 'pageview_24h', iso(live));
        else add(id, 'fail', live ? 'no_pageview_24h' : 'no_pageview_ever', iso(live));
        break;
      case 'test_event':
        if (!tracking) add(id, 'pending', 'no_tracking_data');
        else if (test?.recent) add(id, 'pass', 'test_event_1h', iso(test));
        else add(id, 'fail', 'no_test_event_1h', iso(test));
        break;
      case 'pages_tagged':
      case 'csp_ok':
        // Both come from the page scanner (site_pages, homepage headers), which isn't built yet.
        add(id, 'pending', 'scanner_not_available');
        break;
      case 'plugin_ok': {
        if (!hello) {
          add(id, t.plugin_status ? 'fail' : 'pending', t.plugin_status ? 'no_hello' : 'no_tracking_data');
          break;
        }
        const detail = { lastAt: hello.at.toISOString(), pluginVersion: hello.env.plugin_version ?? null };
        if (hello.env.head_hook_ok !== true) add(id, 'fail', 'head_hook_failed', { ...detail, error: hello.env.head_hook_error ?? null });
        else if (!hello.recent) add(id, 'fail', 'hello_stale', detail);
        else add(id, 'pass', 'hello_ok', detail);
        break;
      }
      case 'delay_js_ok': {
        if (!hello) {
          add(id, 'pending', 'no_hello');
          break;
        }
        const cache = Array.isArray(hello.env.cache) ? (hello.env.cache as Record<string, unknown>[]) : [];
        const blocking = cache.filter((c) => c && c.delay_js === true && c.r1_excluded !== true).map((c) => String(c.plugin));
        if (blocking.length) add(id, 'fail', 'delay_js_not_excluded', { plugins: blocking });
        else add(id, 'pass', cache.some((c) => c && c.delay_js === true) ? 'r1_excluded' : 'no_delay_js', { plugins: cache.map((c) => String(c?.plugin)) });
        break;
      }
      case 'form_request':
        if (!t.requests) add(id, 'pending', 'no_tracking_data');
        else if (counted?.recent) add(id, 'pass', 'request_7d', iso(counted));
        else add(id, 'fail', counted ? 'no_request_7d' : 'no_request_ever', iso(counted));
        break;
      case 'wix_webhook':
        if (!t.requests) add(id, 'pending', 'no_tracking_data');
        else if (webhook) add(id, 'pass', 'webhook_received', iso(webhook));
        else add(id, 'fail', 'no_webhook_request');
        break;
      case 'buttons_found':
        // Passes on a contact click; the scanner half ("contact link found") doesn't exist yet,
        // so without a click the answer is still open rather than a failure.
        if (click) add(id, 'pass', 'contact_click', iso(click));
        else add(id, 'pending', 'no_contact_click');
        break;
      case 'gsc_connected':
        if (!t.gsc_connections) add(id, 'pending', 'gsc_not_available');
        else if (!gsc) add(id, 'fail', 'not_connected');
        else if (gsc.status !== 'active') add(id, 'fail', 'connection_inactive', { status: gsc.status });
        else if (!gsc.property) add(id, 'fail', 'no_property');
        else add(id, 'pass', 'connected', { property: gsc.property });
        break;
    }
  }
  return out;
}

export function registerChecks(app: FastifyInstance, db: Db, { requireSite }: Guards, settings: Settings) {
  /** The checklist, plus what the page needs to explain fixes (script tag, allowed origins for the live check). */
  app.get('/api/sites/:siteId/checks', { preHandler: requireSite('member') }, async (req) => {
    const siteId = req.tenant!.siteId!;
    const { rows } = await db.query<{ platform: string; site_key: string; allowed_origins: string[] }>(
      'SELECT platform, site_key, allowed_origins FROM sites WHERE id = $1',
      [siteId],
    );
    const site = rows[0];
    const checks = await computeChecks(db, siteId, site.platform);
    const stored = await db.query<{ check_id: CheckId; checked_at: Date }>(
      `INSERT INTO site_checks (site_id, check_id, status, reason, checked_at)
       SELECT $1::uuid, c, s, r, now() FROM unnest($2::text[], $3::text[], $4::text[]) AS u(c, s, r)
       ON CONFLICT (site_id, check_id) DO UPDATE SET status = EXCLUDED.status, reason = EXCLUDED.reason, checked_at = EXCLUDED.checked_at
       RETURNING check_id, checked_at`,
      [siteId, checks.map((c) => c.id), checks.map((c) => c.status), checks.map((c) => c.reason)],
    );
    const at = stored.rows[0]?.checked_at.toISOString() ?? new Date().toISOString();
    return {
      platform: site.platform,
      checkedAt: at,
      checks,
      install: {
        siteKey: site.site_key,
        scriptTag: `<script defer src="${settings.collectBaseUrl}/v1/r1.js" data-site="${site.site_key}"></script>`,
        allowedOrigins: site.allowed_origins,
      },
    };
  });
}
