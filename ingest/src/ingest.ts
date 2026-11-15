/**
 * Processing rules: Data contract v1 §4 (ingest rules), §6, §7, §8, §9.
 */
import crypto from 'node:crypto';
import { device, sourceChannel } from './classify.js';
import type { Db, Q } from './db.js';
import { normalisePath, sha256hex } from './util.js';
import type { Envelope, Event, ServerRequest } from './validate.js';

export interface Site {
  id: string;
  platform: string;
  allowed_origins: string[];
}
export interface Rule {
  method: 'server' | 'webhook' | 'browser' | 'thankyou';
  form?: string;
  source?: string;
  form_id?: string;
  path?: string;
  counts?: boolean;
}
export interface SiteConfig {
  config_version: number;
  spa: string;
  sections: unknown[];
  booking_paths: string[];
  forms_browser: { form: string; selector: string; success_selector: string }[];
  request_rules: Rule[];
}
export const DEFAULT_CONFIG: SiteConfig = { config_version: 0, spa: 'auto', sections: [], booking_paths: [], forms_browser: [], request_rules: [] };

const VISIT_GAP_MS = 30 * 60_000;

// ------------------------------------------------------------------ lookups
export function makeStore(db: Db, ttlMs = 30_000) {
  const cache = new Map<string, { at: number; v: unknown }>();
  async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.v as T;
    const v = await load();
    cache.set(key, { at: Date.now(), v });
    if (cache.size > 10_000) cache.clear();
    return v;
  }
  const one = async (sql: string, p: unknown[]) => ((await db.query<Site>(sql, p)).rows[0] as Site | undefined) ?? null;
  const cols = 'SELECT id, platform, allowed_origins FROM sites';
  return {
    siteByKey: (key: string) => cached('k:' + key, () => one(cols + ' WHERE site_key = $1', [key])),
    siteBySecret: (secret: string) => cached('s:' + sha256hex(secret), () => one(cols + ' WHERE site_secret_hash = $1', [sha256hex(secret)])),
    siteByWebhookToken: (token: string) => cached('w:' + sha256hex(token), () => one(cols + ' WHERE webhook_token_hash = $1', [sha256hex(token)])),
    config: (siteId: string) =>
      cached('c:' + siteId, async () => {
        const r = (await db.query<SiteConfig>('SELECT config_version, spa, sections, booking_paths, forms_browser, request_rules FROM site_config WHERE site_id = $1', [siteId])).rows[0];
        return r ? { ...DEFAULT_CONFIG, ...r } : DEFAULT_CONFIG;
      }),
    clear: () => cache.clear(),
  };
}
export type Store = ReturnType<typeof makeStore>;

// ------------------------------------------------------------------ salts + visitor key (§9)
export function makeSalts(db: Db) {
  let cur: { day: string; salt: Buffer } | null = null;
  return async (now: Date): Promise<Buffer> => {
    const day = now.toISOString().slice(0, 10);
    if (cur && cur.day === day) return cur.salt;
    await db.query('INSERT INTO salts (day, salt) VALUES ($1, $2) ON CONFLICT (day) DO NOTHING', [day, crypto.randomBytes(32)]);
    const { rows } = await db.query<{ salt: Uint8Array }>('SELECT salt FROM salts WHERE day = $1', [day]);
    await db.query('DELETE FROM salts WHERE day < $1', [day]); // deleted when the day ends
    cur = { day, salt: Buffer.from(rows[0].salt) };
    return cur.salt;
  };
}

/** First 32 hex chars of SHA-256(daily salt ‖ site id ‖ client IP ‖ user agent). Neither IP nor UA is stored. */
export function visitorKey(salt: Buffer, siteId: string, ip: string, ua: string): string {
  return sha256hex(Buffer.concat([salt, Buffer.from(`\u0000${siteId}\u0000${ip}\u0000${ua}`)])).slice(0, 32);
}

// ------------------------------------------------------------------ rules (§5)
const rulesOf = (cfg: SiteConfig) => (Array.isArray(cfg.request_rules) ? cfg.request_rules : []);
export function serverRule(cfg: SiteConfig, source: string, formId: string) {
  return rulesOf(cfg).find((r) => r.method === 'server' && r.source === source && String(r.form_id) === formId);
}
export function webhookRule(cfg: SiteConfig, form: string) {
  return rulesOf(cfg).find((r) => r.method === 'webhook' && r.form === form);
}
/** form_ok counts only when a browser rule (request_rules or forms_browser) covers the form. */
export function browserRule(cfg: SiteConfig, form: string): Rule | undefined {
  return (
    rulesOf(cfg).find((r) => r.method === 'browser' && r.form === form) ||
    ((Array.isArray(cfg.forms_browser) ? cfg.forms_browser : []).some((f) => f.form === form) ? { method: 'browser', form } : undefined)
  );
}
export function thankyouRules(cfg: SiteConfig, path: string) {
  return rulesOf(cfg).filter((r) => r.method === 'thankyou' && typeof r.path === 'string' && normalisePath(r.path) === path);
}

// ------------------------------------------------------------------ browser events (§4)
export interface EventCtx {
  visitorKey: string;
  ua: string;
  now: Date;
}

export async function processEnvelope(db: Db, site: Site, cfg: SiteConfig, env: Envelope, ctx: EventCtx): Promise<void> {
  const firstPageview = env.ev.find((e) => e.type === 'pageview') as Extract<Event, { type: 'pageview' }> | undefined;
  await db.tx(async (q) => {
    // Serialise batches of the same visitor so visit assignment and seq are race-free.
    await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [site.id + ':' + ctx.visitorKey]);
    const visits = new Map<string, string>(); // pv → visit id, within this batch
    let current: string | null = null; // visit opened or found for this batch

    const touch = (visitId: string) => q.query('UPDATE visits SET last_seen_at = GREATEST(last_seen_at, $2) WHERE id = $1', [visitId, ctx.now]);

    const visitFor = async (e: Event, pageview?: Extract<Event, { type: 'pageview' }>): Promise<string> => {
      if (current) return current;
      const found = await q.query<{ id: string }>(
        `SELECT id FROM visits WHERE site_id = $1 AND visitor_key = $2 AND test = $3 AND last_seen_at > $4
         ORDER BY last_seen_at DESC LIMIT 1`,
        [site.id, ctx.visitorKey, env.test, new Date(ctx.now.getTime() - VISIT_GAP_MS)],
      );
      if (found.rows[0]) {
        current = found.rows[0].id;
        await touch(current);
        return current;
      }
      const pvSrc = pageview ?? firstPageview;
      const src = pvSrc ? sourceChannel(pvSrc.utm, pvSrc.clid, pvSrc.ref) : { channel: 'direct', detail: null };
      const ins = await q.query<{ id: string }>(
        `INSERT INTO visits (site_id, visitor_key, started_at, last_seen_at, landing_path, source_channel, source_detail, utm_campaign, device, test)
         VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [site.id, ctx.visitorKey, ctx.now, e.path, src.channel, src.detail, pvSrc?.utm.campaign ?? null, device(ctx.ua, pvSrc?.vw), env.test],
      );
      current = ins.rows[0].id;
      return current;
    };

    const visitOfPv = async (pv: string): Promise<string | null> => {
      if (visits.has(pv)) return visits.get(pv)!;
      const r = await q.query<{ visit_id: string }>('SELECT visit_id FROM pageviews WHERE site_id = $1 AND pv = $2', [site.id, pv]);
      if (r.rows[0]) visits.set(pv, r.rows[0].visit_id);
      return r.rows[0]?.visit_id ?? null;
    };

    const insertPageview = async (visitId: string, cols: Record<string, unknown>) => {
      const seq = (await q.query<{ pv_count: number }>('UPDATE visits SET pv_count = pv_count + 1 WHERE id = $1 RETURNING pv_count', [visitId])).rows[0].pv_count;
      const keys = Object.keys(cols);
      await q.query(
        `INSERT INTO pageviews (site_id, visit_id, seq, received_at, ${keys.join(', ')})
         VALUES ($1, $2, $3, $4, ${keys.map((_, i) => '$' + (i + 5)).join(', ')})`,
        [site.id, visitId, seq, ctx.now, ...keys.map((k) => cols[k])],
      );
      return seq;
    };

    for (const e of env.ev) {
      switch (e.type) {
        case 'pageview': {
          const existing = await q.query<{ visit_id: string; nav: string }>('SELECT visit_id, nav FROM pageviews WHERE site_id = $1 AND pv = $2', [site.id, e.pv]);
          const row = existing.rows[0];
          if (row) {
            // First one wins; a stub from an early engage gets its real fields.
            if (row.nav === 'unknown')
              await q.query('UPDATE pageviews SET nav = $3, path = $4, title = $5, load_ms = $6 WHERE site_id = $1 AND pv = $2', [site.id, e.pv, e.nav, e.path, e.title, e.load_ms]);
            visits.set(e.pv, row.visit_id);
            await touch(row.visit_id);
            break;
          }
          const visitId = await visitFor(e, e);
          const seq = await insertPageview(visitId, { pv: e.pv, path: e.path, title: e.title, nav: e.nav, load_ms: e.load_ms });
          visits.set(e.pv, visitId);
          // A server request may have arrived before its page view.
          await q.query('UPDATE requests SET visit_id = $1 WHERE site_id = $2 AND pv = $3 AND visit_id IS NULL', [visitId, site.id, e.pv]);
          // Thank-you rules: at most one per visit per rule, credited to the previous page view.
          for (const rule of thankyouRules(cfg, e.path)) {
            const prev = (
              await q.query<{ pv: string; path: string }>('SELECT pv, path FROM pageviews WHERE visit_id = $1 AND seq < $2 ORDER BY seq DESC LIMIT 1', [visitId, seq])
            ).rows[0];
            await q.query(
              `INSERT INTO requests (site_id, visit_id, pv, path, channel, confirmation, source, form_id, counts, spam, external_id, received_at)
               VALUES ($1, $2, $3, $4, 'form', 'thankyou', NULL, $5, $6, false, $7, $8) ON CONFLICT DO NOTHING`,
              [site.id, visitId, prev?.pv ?? null, prev?.path ?? null, rule.form ?? null, rule.counts ?? true, `ty:${visitId}:${rule.form ?? rule.path}`, ctx.now],
            );
          }
          break;
        }
        case 'engage': {
          const upd = await q.query<{ visit_id: string }>(
            `UPDATE pageviews SET
               active_ms = GREATEST(COALESCE(active_ms, 0), $3),
               scroll = GREATEST(COALESCE(scroll, 0), $4),
               sections = (sections || ARRAY(SELECT x FROM unnest($5::text[]) WITH ORDINALITY AS t(x, n) WHERE x <> ALL (pageviews.sections) ORDER BY n))[1:20],
               has_engage = true
             WHERE site_id = $1 AND pv = $2 RETURNING visit_id`,
            [site.id, e.pv, e.active_ms, e.scroll, e.sections],
          );
          if (upd.rows[0]) {
            visits.set(e.pv, upd.rows[0].visit_id);
            await touch(upd.rows[0].visit_id);
          } else {
            const visitId = await visitFor(e);
            await insertPageview(visitId, { pv: e.pv, path: e.path, nav: 'unknown', active_ms: e.active_ms, scroll: e.scroll, sections: e.sections, has_engage: true });
            visits.set(e.pv, visitId);
          }
          break;
        }
        case 'click': {
          const visitId = (await visitOfPv(e.pv)) ?? (await visitFor(e));
          await q.query(
            `INSERT INTO clicks (site_id, visit_id, pv, eid, kind, label, received_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
            [site.id, visitId, e.pv, e.eid, e.kind, e.label, ctx.now],
          );
          await touch(visitId);
          break;
        }
        case 'step': {
          const visitId = (await visitOfPv(e.pv)) ?? (await visitFor(e));
          await q.query(
            `INSERT INTO flow_steps (site_id, visit_id, pv, flow, flow_id, step, name, received_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
            [site.id, visitId, e.pv, e.flow, e.flow_id, e.step, e.name, ctx.now],
          );
          await touch(visitId);
          break;
        }
        case 'form_ok': {
          const rule = browserRule(cfg, e.form);
          if (!rule) break; // not covered by a request rule
          const visitId = (await visitOfPv(e.pv)) ?? (await visitFor(e));
          await q.query(
            `INSERT INTO requests (site_id, visit_id, pv, path, channel, confirmation, source, form_id, counts, spam, external_id, received_at)
             VALUES ($1, $2, $3, $4, 'form', 'browser', NULL, $5, $6, false, $7, $8) ON CONFLICT DO NOTHING`,
            [site.id, visitId, e.pv, e.path, e.form, rule.counts ?? true, `${e.pv}:${e.eid}`, ctx.now],
          );
          await touch(visitId);
          break;
        }
      }
    }
  });
}

// ------------------------------------------------------------------ server requests (§6)
export async function processServerRequest(db: Q, site: Site, cfg: SiteConfig, r: ServerRequest, now: Date): Promise<{ id: string; duplicate: boolean }> {
  let visitId: string | null = null;
  let path = r.path;
  if (r.pv) {
    const pvRow = (await db.query<{ visit_id: string; path: string }>('SELECT visit_id, path FROM pageviews WHERE site_id = $1 AND pv = $2', [site.id, r.pv])).rows[0];
    if (pvRow) {
      visitId = pvRow.visit_id;
      path = path ?? pvRow.path;
    }
  }
  const counts = serverRule(cfg, r.source, r.form_id)?.counts ?? true;
  const ins = await db.query<{ id: string }>(
    `INSERT INTO requests (site_id, visit_id, pv, path, channel, confirmation, source, form_id, counts, spam, spam_reason, external_id, received_at)
     VALUES ($1, $2, $3, $4, $5, 'server', $6, $7, $8, $9, $10, $11, $12) ON CONFLICT DO NOTHING RETURNING id`,
    [site.id, visitId, r.pv, path, r.channel, r.source, r.form_id, counts, r.spam, r.spam ? r.spam_reason : null, r.rid, now],
  );
  if (ins.rows[0]) return { id: ins.rows[0].id, duplicate: false };
  const dup = await db.query<{ id: string }>(`SELECT id FROM requests WHERE site_id = $1 AND confirmation = 'server' AND external_id = $2`, [site.id, r.rid]);
  return { id: dup.rows[0].id, duplicate: true };
}

// ------------------------------------------------------------------ Wix webhook (§7)
export async function processWebhook(db: Q, site: Site, cfg: SiteConfig, w: { form: string; submission_id: string | null }, now: Date) {
  const counts = webhookRule(cfg, w.form)?.counts ?? true;
  const ins = await db.query<{ id: string }>(
    `INSERT INTO requests (site_id, visit_id, pv, path, channel, confirmation, source, form_id, counts, spam, external_id, received_at)
     VALUES ($1, NULL, NULL, NULL, 'form', 'webhook', 'wix', $2, $3, false, $4, $5) ON CONFLICT DO NOTHING RETURNING id`,
    [site.id, w.form, counts, w.submission_id, now],
  );
  return { duplicate: !ins.rows[0] };
}

// ------------------------------------------------------------------ plugin hello (§8)
export async function processHello(db: Q, site: Site, h: { platform: string; plugin_version: string | null; env: Record<string, unknown> }, now: Date) {
  await db.query(
    `INSERT INTO plugin_status (site_id, platform, plugin_version, env, last_hello_at) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (site_id) DO UPDATE SET platform = EXCLUDED.platform, plugin_version = EXCLUDED.plugin_version, env = EXCLUDED.env, last_hello_at = EXCLUDED.last_hello_at`,
    [site.id, h.platform, h.plugin_version, JSON.stringify(h.env), now],
  );
}

// ------------------------------------------------------------------ retention (§10)
export async function retention(db: Q, now: Date) {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 14);
  await db.query('DELETE FROM requests WHERE received_at < $1', [cutoff]);
  await db.query('DELETE FROM visits WHERE started_at < $1', [cutoff]); // cascades to pageviews, clicks, flow_steps
  await db.query('DELETE FROM salts WHERE day < $1', [now.toISOString().slice(0, 10)]);
}
