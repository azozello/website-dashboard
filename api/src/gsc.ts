import crypto from 'node:crypto';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Settings } from './config.ts';
import type { Db } from './db.ts';
import { GSC_SCOPE, GoogleError, type AnalyticsRow, type Dimension, type GoogleApi, type GscProperty } from './google.ts';
import { sha256hex } from './keys.ts';
import { normalisePath } from './paths.ts';
import { seal, unseal } from './seal.ts';
import { topRole, type Guards } from './tenant.ts';

/**
 * Google Search Console connection and sync (contract §0 I8, §10 gsc_connections / gsc_daily, §12 gsc_connected).
 *
 * Connect (owner/admin of the site), OAuth 2.0 code flow with PKCE:
 *   POST /api/sites/:siteId/gsc/connect → { url } of Google's consent screen (read-only Search Console scope,
 *   offline access). Google sends the browser back to GET /api/gsc/callback, which redeems the one-time state
 *   (10 minutes, same user, still admin), checks the scope was granted, stores the refresh token encrypted
 *   (src/seal.ts, bound to the site id) and picks the account's property that matches the site's allowed
 *   addresses. No single match: status needs_property, and an admin chooses on the settings page
 *   (PUT /api/sites/:siteId/gsc/property). Search Console access is per site and separate from Google sign-in.
 *
 * Sync, per active connection: daily (startScheduler, from main.ts), right after a property is set, and on
 * demand (POST /api/sites/:siteId/gsc/sync). Search Analytics by (date, page) — the page totals, query NULL —
 * and by (date, page, query). Page URLs become §1 normalised paths; URLs on hosts the site doesn't list are
 * dropped (a domain property also covers other subdomains). The first sync reads BACKFILL_DAYS; later ones re-read
 * the last REREAD_DAYS, because Google revises recent days. Each chunk of days is replaced in one transaction.
 *
 * Google refusing the refresh token (revoked, or older than 7 days while the OAuth app is in Testing) or the
 * property makes the status `error`: someone has to connect again. Outages are retried on the next hourly run.
 */

export const STATE_TTL_MS = 10 * 60 * 1000;
/** About 14 months, the retention of the tracking tables (§10). Search Console keeps 16. */
export const BACKFILL_DAYS = 425;
export const REREAD_DAYS = 5;
export const CHUNK_DAYS = 30;
export const ROW_LIMIT = 25_000;
/** Safety stop per request type and chunk: 1 million rows. */
const MAX_PAGES = 40;
export const SYNC_EVERY_HOURS = 20;
const CLAIM_STALE = '30 minutes';
const INSERT_BATCH = 5000;

export type GscStatus = 'needs_property' | 'active' | 'error';

export interface DailyRow {
  date: string;
  path: string;
  query: string | null;
  clicks: number;
  impressions: number;
  position: number;
}

export interface SyncResult {
  status: 'synced' | 'skipped' | 'failed';
  rows?: number;
  through?: string;
  error?: string;
}

/* ---------------------------------------------------------------- properties */

const usable = (props: GscProperty[]) => props.filter((p) => p.permissionLevel !== 'siteUnverifiedUser');

function hostsOf(origins: string[]): string[] {
  return origins
    .map((o) => {
      try {
        return new URL(o).hostname.toLowerCase();
      } catch {
        return '';
      }
    })
    .filter(Boolean);
}

/** Properties of the account that cover one of the site's addresses: domain properties first, then URL-prefix ones. */
export function matchingProperties(props: GscProperty[], origins: string[]): string[] {
  const hosts = hostsOf(origins);
  const domain: string[] = [];
  const prefix: string[] = [];
  for (const p of usable(props)) {
    if (p.siteUrl.startsWith('sc-domain:')) {
      const d = p.siteUrl.slice('sc-domain:'.length).toLowerCase();
      if (hosts.some((h) => h === d || h.endsWith('.' + d))) domain.push(p.siteUrl);
    } else {
      try {
        if (origins.includes(new URL(p.siteUrl).origin)) prefix.push(p.siteUrl);
      } catch {
        /* not a URL */
      }
    }
  }
  return [...domain, ...prefix];
}

/** The property to use without asking: the only matching domain property, else the only matching root URL-prefix one. */
export function pickProperty(candidates: string[]): string | null {
  const domain = candidates.filter((c) => c.startsWith('sc-domain:'));
  if (domain.length) return domain.length === 1 ? domain[0] : null;
  const roots = candidates.filter((c) => {
    try {
      return new URL(c).pathname === '/';
    } catch {
      return false;
    }
  });
  return roots.length === 1 ? roots[0] : null;
}

/* ---------------------------------------------------------------- rows */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => day(new Date(Date.parse(iso + 'T00:00:00Z') + n * 86_400_000));

/**
 * Search Analytics rows → one row per (date, normalised path, query). Rows of several URLs with the same path
 * (http/https, query strings) are added up; their average positions are combined weighted by impressions.
 * page rows: keys [date, page]; query rows: keys [date, page, query].
 */
export function aggregate(pageRows: AnalyticsRow[], queryRows: AnalyticsRow[], hosts: Set<string>): DailyRow[] {
  const m = new Map<string, DailyRow & { w: number }>();
  const add = (date: string | undefined, page: string | undefined, query: string | null, r: AnalyticsRow) => {
    if (!date || !ISO_DAY.test(date) || !page) return;
    let host: string;
    try {
      host = new URL(page).hostname.toLowerCase();
    } catch {
      return;
    }
    if (!hosts.has(host)) return;
    const path = normalisePath(page);
    const k = JSON.stringify([date, path, query]);
    let e = m.get(k);
    if (!e) m.set(k, (e = { date, path, query, clicks: 0, impressions: 0, position: 0, w: 0 }));
    const w = r.impressions > 0 ? r.impressions : 1;
    e.position = (e.position * e.w + r.position * w) / (e.w + w);
    e.w += w;
    e.clicks += Math.round(r.clicks);
    e.impressions += Math.round(r.impressions);
  };
  for (const r of pageRows) add(r.keys[0], r.keys[1], null, r);
  for (const r of queryRows) add(r.keys[0], r.keys[1], r.keys[2] ?? '', r);
  return [...m.values()].map(({ w: _w, ...row }) => row);
}

/* ---------------------------------------------------------------- service */

export type Gsc = ReturnType<typeof createGsc>;

export function createGsc(db: Db, settings: Settings, google: GoogleApi | null, log: FastifyBaseLogger) {
  const key = settings.tokenKey;
  const available = Boolean(google && key);
  const redirectUri = `${settings.appBaseUrl}/api/gsc/callback`;
  const inflight = new Set<Promise<unknown>>();

  /**
   * Runs fn on one connection marked as the sync job (app.job = 'gsc_sync'): there is no signed-in user, and with
   * row-level security on (migrations/007_gsc.sql) only that mark lets it read sites and write every site's rows.
   */
  async function asJob<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await db.connect();
    let broken: Error | undefined;
    try {
      await c.query(`SELECT set_config('app.job', 'gsc_sync', false)`);
      return await fn(c);
    } finally {
      await c.query(`SELECT set_config('app.job', '', false)`).catch((err: Error) => (broken = err));
      c.release(broken);
    }
  }

  async function fetchAll(access: string, property: string, startDate: string, endDate: string, dimensions: Dimension[]) {
    const out: AnalyticsRow[] = [];
    for (let i = 0; i < MAX_PAGES; i++) {
      const rows = await google!.searchAnalytics(access, property, { startDate, endDate, dimensions, rowLimit: ROW_LIMIT, startRow: i * ROW_LIMIT });
      out.push(...rows);
      if (rows.length < ROW_LIMIT) break;
    }
    return out;
  }

  /** Imports the site's Search Analytics; a no-op when it isn't active or another sync for it is running. */
  async function syncSite(siteId: string, now = new Date()): Promise<SyncResult> {
    if (!available) return { status: 'skipped' };
    return asJob(async (c) => {
      const claim = await c.query<{ property: string; refresh_token_enc: string; synced_through: string | null; origins: string[] }>(
        `UPDATE gsc_connections g SET sync_started_at = now()
           FROM sites s
          WHERE s.id = g.site_id AND g.site_id = $1 AND g.status = 'active' AND g.property IS NOT NULL
            AND (g.sync_started_at IS NULL OR g.sync_started_at < now() - interval '${CLAIM_STALE}')
          RETURNING g.property, g.refresh_token_enc, to_char(g.synced_through, 'YYYY-MM-DD') AS synced_through, s.allowed_origins AS origins`,
        [siteId],
      );
      const row = claim.rows[0];
      if (!row) return { status: 'skipped' };
      const finish = (sets: string, values: unknown[] = []) =>
        c.query(`UPDATE gsc_connections SET ${sets}, sync_started_at = NULL WHERE site_id = $1 AND property = $2`, [siteId, row.property, ...values]);

      let refreshToken: string;
      try {
        refreshToken = unseal(key!, row.refresh_token_enc, siteId);
      } catch {
        await finish(`status = 'error', last_error = 'token_unreadable'`);
        return { status: 'failed', error: 'token_unreadable' };
      }

      try {
        const access = await google!.refresh(refreshToken);
        const hosts = new Set(hostsOf(row.origins));
        const end = day(now);
        const start = row.synced_through ? addDays(row.synced_through, -REREAD_DAYS) : addDays(end, -BACKFILL_DAYS);
        let through = row.synced_through;
        let total = 0;

        for (let from = start; from <= end; from = addDays(from, CHUNK_DAYS)) {
          const to = addDays(from, CHUNK_DAYS - 1) < end ? addDays(from, CHUNK_DAYS - 1) : end;
          const [pageRows, queryRows] = await Promise.all([
            fetchAll(access, row.property, from, to, ['date', 'page']),
            fetchAll(access, row.property, from, to, ['date', 'page', 'query']),
          ]);
          const rows = aggregate(pageRows, queryRows, hosts);

          await c.query('BEGIN');
          try {
            // Still connected to this property (a disconnect or another property waits for this, then wins).
            const still = await c.query('SELECT 1 FROM gsc_connections WHERE site_id = $1 AND property = $2 FOR UPDATE', [siteId, row.property]);
            if (!still.rowCount) {
              await c.query('ROLLBACK');
              return { status: 'skipped' };
            }
            await c.query('DELETE FROM gsc_daily WHERE site_id = $1 AND date BETWEEN $2 AND $3', [siteId, from, to]);
            for (let i = 0; i < rows.length; i += INSERT_BATCH) {
              const b = rows.slice(i, i + INSERT_BATCH);
              await c.query(
                `INSERT INTO gsc_daily (site_id, date, path, query, clicks, impressions, position)
                 SELECT $1::uuid, d::date, p, q, n, i, pos FROM unnest($2::text[], $3::text[], $4::text[], $5::int[], $6::int[], $7::real[]) AS u(d, p, q, n, i, pos)`,
                [siteId, b.map((r) => r.date), b.map((r) => r.path), b.map((r) => r.query), b.map((r) => r.clicks), b.map((r) => r.impressions), b.map((r) => r.position)],
              );
            }
            await c.query('COMMIT');
          } catch (err) {
            await c.query('ROLLBACK').catch(() => {});
            throw err;
          }
          total += rows.length;
          for (const r of pageRows) if (r.keys[0] && ISO_DAY.test(r.keys[0]) && (!through || r.keys[0] > through)) through = r.keys[0];
        }

        // No search data at all yet: next time, start near today instead of the whole backfill again.
        const newest = through ?? addDays(end, -REREAD_DAYS);
        await finish(`last_sync_at = now(), synced_through = $3, last_error = NULL`, [newest]);
        return { status: 'synced', rows: total, through: newest };
      } catch (err) {
        const code = err instanceof GoogleError ? err.code : 'internal';
        if (code === 'invalid_grant') {
          await finish(`status = 'error', last_error = 'token_revoked'`);
          return { status: 'failed', error: 'token_revoked' };
        }
        if (code === 'forbidden' || code === 'unauthorized') {
          await finish(`status = 'error', last_error = 'no_access'`);
          return { status: 'failed', error: 'no_access' };
        }
        const reason = code === 'unavailable' ? 'google_unavailable' : 'sync_failed';
        if (reason === 'sync_failed') log.error({ err, siteId }, 'search console sync failed');
        await finish(`last_error = $3`, [reason]);
        return { status: 'failed', error: reason };
      }
    });
  }

  /** Syncs every active connection not synced in the last SYNC_EVERY_HOURS, one after the other. */
  async function syncDue(now = new Date()) {
    if (!available) return [];
    const due = await asJob((c) =>
      c.query<{ site_id: string }>(
        `SELECT site_id FROM gsc_connections
          WHERE status = 'active' AND property IS NOT NULL AND (last_sync_at IS NULL OR last_sync_at < now() - interval '${SYNC_EVERY_HOURS} hours')
          ORDER BY last_sync_at NULLS FIRST`,
      ),
    );
    const results: (SyncResult & { siteId: string })[] = [];
    for (const r of due.rows) results.push({ siteId: r.site_id, ...(await syncSite(r.site_id, now)) });
    return results;
  }

  /** Sync in the background (after connect or on demand); `idle()` waits for these. */
  function syncLater(siteId: string) {
    const p: Promise<unknown> = syncSite(siteId)
      .catch((err) => log.error({ err, siteId }, 'search console sync failed'))
      .finally(() => inflight.delete(p));
    inflight.add(p);
  }

  /** Hourly check for due syncs, first one a minute after start. Returns a stop function. */
  function startScheduler(everyMs = 60 * 60 * 1000) {
    if (!available) return () => {};
    let running = false;
    const run = () => {
      if (running) return;
      running = true;
      syncDue()
        .then((r) => r.length && log.info({ synced: r.filter((x) => x.status === 'synced').length, due: r.length }, 'search console sync'))
        .catch((err) => log.error({ err }, 'search console sync run failed'))
        .finally(() => (running = false));
    };
    const first = setTimeout(run, 60_000);
    const every = setInterval(run, everyMs);
    first.unref();
    every.unref();
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }

  return {
    available,
    redirectUri,
    syncSite,
    syncDue,
    syncLater,
    startScheduler,
    idle: () => Promise.all([...inflight]),
    seal: (token: string, siteId: string) => seal(key!, token, siteId),
    unseal: (sealed: string, siteId: string) => unseal(key!, sealed, siteId),
  };
}

/* ---------------------------------------------------------------- routes */

interface ConnectionRow {
  status: GscStatus;
  property: string | null;
  google_email: string | null;
  properties: GscProperty[];
  connected_at: Date;
  last_sync_at: Date | null;
  synced_through: string | null;
  last_error: string | null;
  syncing: boolean;
}

export function registerGsc(app: FastifyInstance, db: Db, { requireSite, requireUser }: Guards, gsc: Gsc, google: GoogleApi | null) {
  const back = (siteId: string | null, params: Record<string, string>) =>
    (siteId ? `/s/${siteId}/settings/search-console?` : '/?') + new URLSearchParams(params).toString();

  async function status(siteId: string, admin: boolean) {
    const [site, conn] = await Promise.all([
      db.query<{ allowed_origins: string[] }>('SELECT allowed_origins FROM sites WHERE id = $1', [siteId]),
      db.query<ConnectionRow>(
        `SELECT status, property, google_email, properties, connected_at, last_sync_at, to_char(synced_through, 'YYYY-MM-DD') AS synced_through,
                last_error, coalesce(sync_started_at > now() - interval '${CLAIM_STALE}', false) AS syncing
           FROM gsc_connections WHERE site_id = $1`,
        [siteId],
      ),
    ]);
    const origins = site.rows[0]?.allowed_origins ?? [];
    const c = conn.rows[0];
    return {
      available: gsc.available,
      origins,
      connection: c
        ? {
            status: c.status,
            property: c.status === 'needs_property' ? null : c.property,
            googleEmail: c.google_email,
            connectedAt: c.connected_at.toISOString(),
            lastSyncAt: c.last_sync_at?.toISOString() ?? null,
            syncedThrough: c.synced_through,
            lastError: c.last_error,
            syncing: c.syncing,
            candidates: matchingProperties(c.properties, origins),
            // The account's other properties are the connecting account's business; only admins see them.
            ...(admin ? { accountProperties: usable(c.properties).map((p) => p.siteUrl) } : {}),
          }
        : null,
    };
  }

  const isAdmin = (role: string | undefined) => role === 'owner' || role === 'admin';

  app.get('/api/sites/:siteId/gsc', { preHandler: requireSite('member') }, async (req, reply) => {
    reply.header('cache-control', 'private, no-store');
    return status(req.tenant!.siteId!, isAdmin(req.tenant!.role));
  });

  app.post('/api/sites/:siteId/gsc/connect', { preHandler: requireSite('admin') }, async (req, reply) => {
    if (!gsc.available || !google) return reply.code(503).send({ error: 'gsc_not_configured' });
    const state = crypto.randomBytes(32).toString('base64url');
    const verifier = crypto.randomBytes(48).toString('base64url');
    await db.query(`DELETE FROM gsc_oauth_states WHERE expires_at < now() - interval '1 day'`);
    await db.query('INSERT INTO gsc_oauth_states (state_hash, site_id, user_id, code_verifier, expires_at) VALUES ($1, $2, $3, $4, $5)', [
      sha256hex(state),
      req.tenant!.siteId,
      req.principal!.userId,
      verifier,
      new Date(Date.now() + STATE_TTL_MS),
    ]);
    reply.header('cache-control', 'no-store');
    return { url: google.authUrl({ redirectUri: gsc.redirectUri, state, codeChallenge: crypto.createHash('sha256').update(verifier).digest('base64url') }) };
  });

  /** Google's redirect back. Always answers with a redirect into the dashboard; the query says what happened. */
  app.get('/api/gsc/callback', { preHandler: requireUser }, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const q = req.query as Record<string, unknown>;
    const fail = (siteId: string | null, reason: string) => reply.redirect(back(siteId, { gsc: 'error', reason }));
    if (!gsc.available || !google) return fail(null, 'not_configured');
    const state = typeof q.state === 'string' && /^[A-Za-z0-9_-]{20,100}$/.test(q.state) ? q.state : null;
    if (!state) return fail(null, 'invalid_state');

    const userId = req.principal!.userId;
    const claimed = await db.query<{ site_id: string; code_verifier: string; fresh: boolean }>(
      `UPDATE gsc_oauth_states SET used_at = now() WHERE state_hash = $1 AND user_id = $2 AND used_at IS NULL
       RETURNING site_id, code_verifier, expires_at > now() AS fresh`,
      [sha256hex(state), userId],
    );
    const st = claimed.rows[0];
    if (!st) return fail(null, 'invalid_state');
    const siteId = st.site_id;
    if (!st.fresh) return fail(siteId, 'expired');
    const member = await db.query<{ role: string }>(
      `SELECT m.role FROM sites s JOIN member m ON m."organizationId" = s.org_id WHERE s.id = $1 AND m."userId" = $2`,
      [siteId, userId],
    );
    if (!isAdmin(topRole(member.rows[0]?.role) ?? undefined)) return fail(null, 'forbidden');
    if (q.error !== undefined) return fail(siteId, q.error === 'access_denied' ? 'denied' : 'google_error');
    if (typeof q.code !== 'string' || !q.code) return fail(siteId, 'google_error');

    try {
      const tokens = await google.exchangeCode({ code: q.code, redirectUri: gsc.redirectUri, codeVerifier: st.code_verifier });
      if (!tokens.scope.split(/\s+/).includes(GSC_SCOPE)) return fail(siteId, 'scope_missing');
      if (!tokens.refreshToken) return fail(siteId, 'no_refresh_token');
      const props = usable(await google.listProperties(tokens.accessToken));
      const origins = (await db.query<{ allowed_origins: string[] }>('SELECT allowed_origins FROM sites WHERE id = $1', [siteId])).rows[0]?.allowed_origins ?? [];
      const picked = pickProperty(matchingProperties(props, origins));

      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const prev = (await client.query<{ property: string | null }>('SELECT property FROM gsc_connections WHERE site_id = $1 FOR UPDATE', [siteId])).rows[0];
        const switched = Boolean(picked && prev?.property && prev.property !== picked);
        if (switched) await client.query('DELETE FROM gsc_daily WHERE site_id = $1', [siteId]);
        // A connection without a picked property keeps the previous one's data until an admin chooses.
        await client.query(
          `INSERT INTO gsc_connections (site_id, property, status, refresh_token_enc, google_email, properties, connected_by, connected_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now())
           ON CONFLICT (site_id) DO UPDATE SET
             property = coalesce(EXCLUDED.property, gsc_connections.property),
             status = EXCLUDED.status, refresh_token_enc = EXCLUDED.refresh_token_enc, google_email = EXCLUDED.google_email,
             properties = EXCLUDED.properties, connected_by = EXCLUDED.connected_by, connected_at = EXCLUDED.connected_at,
             synced_through = CASE WHEN $8 THEN NULL ELSE gsc_connections.synced_through END,
             last_sync_at = CASE WHEN $8 THEN NULL ELSE gsc_connections.last_sync_at END,
             last_error = NULL, sync_started_at = NULL`,
          [siteId, picked, picked ? 'active' : 'needs_property', gsc.seal(tokens.refreshToken, siteId), tokens.email, JSON.stringify(props), userId, switched],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
      if (picked) gsc.syncLater(siteId);
      return reply.redirect(back(siteId, { gsc: picked ? 'connected' : 'choose' }));
    } catch (err) {
      if (!(err instanceof GoogleError)) req.log.error({ err }, 'search console connect failed');
      return fail(siteId, err instanceof GoogleError && err.code === 'invalid_grant' ? 'expired' : 'google_error');
    }
  });

  app.put(
    '/api/sites/:siteId/gsc/property',
    {
      preHandler: requireSite('admin'),
      schema: { body: { type: 'object', required: ['property'], additionalProperties: false, properties: { property: { type: 'string', minLength: 1, maxLength: 500 } } } },
    },
    async (req, reply) => {
      const siteId = req.tenant!.siteId!;
      const { property } = req.body as { property: string };
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const row = (
          await client.query<{ status: GscStatus; property: string | null; properties: GscProperty[]; origins: string[] }>(
            `SELECT g.status, g.property, g.properties, s.allowed_origins AS origins
               FROM gsc_connections g JOIN sites s ON s.id = g.site_id WHERE g.site_id = $1 FOR UPDATE OF g`,
            [siteId],
          )
        ).rows[0];
        if (!row) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'not_connected' });
        }
        if (row.status === 'error') {
          await client.query('ROLLBACK');
          return reply.code(409).send({ error: 'reconnect' });
        }
        if (!matchingProperties(row.properties, row.origins).includes(property)) {
          await client.query('ROLLBACK');
          return reply.code(400).send({ error: 'property_not_matching' });
        }
        const switched = row.property !== property;
        if (switched) await client.query('DELETE FROM gsc_daily WHERE site_id = $1', [siteId]);
        await client.query(
          `UPDATE gsc_connections SET property = $2, status = 'active', last_error = NULL,
             synced_through = CASE WHEN $3 THEN NULL ELSE synced_through END, last_sync_at = CASE WHEN $3 THEN NULL ELSE last_sync_at END
           WHERE site_id = $1`,
          [siteId, property, switched],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
      gsc.syncLater(siteId);
      return status(siteId, true);
    },
  );

  app.post('/api/sites/:siteId/gsc/sync', { preHandler: requireSite('admin') }, async (req, reply) => {
    const siteId = req.tenant!.siteId!;
    const s = await status(siteId, true);
    if (s.connection?.status !== 'active') return reply.code(409).send({ error: 'not_active' });
    if (!s.connection.syncing) gsc.syncLater(siteId);
    return reply.code(202).send({ started: !s.connection.syncing });
  });

  /** Disconnect: forget the token and the imported data. Revokes the Google grant unless another site uses the same account. */
  app.delete('/api/sites/:siteId/gsc', { preHandler: requireSite('admin') }, async (req) => {
    const siteId = req.tenant!.siteId!;
    const client = await db.connect();
    let gone: { refresh_token_enc: string; google_email: string | null } | undefined;
    try {
      await client.query('BEGIN');
      gone = (
        await client.query<{ refresh_token_enc: string; google_email: string | null }>(
          'DELETE FROM gsc_connections WHERE site_id = $1 RETURNING refresh_token_enc, google_email',
          [siteId],
        )
      ).rows[0];
      await client.query('DELETE FROM gsc_daily WHERE site_id = $1', [siteId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    if (gone && google) {
      // Revoking ends the whole grant of that Google account, so keep it while other sites still use it.
      const shared = gone.google_email
        ? (await db.query('SELECT 1 FROM gsc_connections WHERE google_email = $1 LIMIT 1', [gone.google_email])).rowCount
        : 0;
      if (!shared) {
        try {
          await google.revoke(gsc.unseal(gone.refresh_token_enc, siteId));
        } catch {
          /* unreadable token: nothing to revoke */
        }
      }
    }
    return { ok: true };
  });
}
