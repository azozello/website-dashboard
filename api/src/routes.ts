import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Settings } from './config.ts';
import type { Db } from './db.ts';
import { newSiteKey, newSiteSecret, newWebhookToken, sha256hex, toOrigin } from './keys.ts';
import { topRole, type Guards } from './tenant.ts';

const PLATFORMS = ['php', 'wordpress', 'wix'] as const;
type Platform = (typeof PLATFORMS)[number];

/** Contract §8: the one-time connect code is valid for 5 minutes. */
const CONNECT_CODE_TTL_MS = 5 * 60 * 1000;

type Queryable = Pick<Db, 'query'>;

/** Inserts a site and its (default) config. Returns the secrets once; only hashes are stored. */
async function createSite(
  q: Queryable,
  settings: Settings,
  site: { orgId: string; name: string; platform: Platform; origins: string[]; timezone?: string },
) {
  const key = newSiteKey();
  const secret = newSiteSecret();
  const token = site.platform === 'wix' ? newWebhookToken() : null;
  const { rows } = await q.query<{ id: string }>(
    `INSERT INTO sites (name, platform, timezone, allowed_origins, site_key, site_secret_hash, webhook_token_hash, org_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [site.name, site.platform, site.timezone ?? 'Europe/Berlin', [...new Set(site.origins)], key, sha256hex(secret), token ? sha256hex(token) : null, site.orgId],
  );
  await q.query('INSERT INTO site_config (site_id) VALUES ($1)', [rows[0].id]);
  return { id: rows[0].id, key, secret, webhookUrl: token ? `${settings.collectBaseUrl}/v1/w/${token}` : undefined };
}

const scriptTag = (settings: Settings, key: string) => `<script defer src="${settings.collectBaseUrl}/v1/r1.js" data-site="${key}"></script>`;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function registerRoutes(app: FastifyInstance, db: Db, guards: Guards, settings: Settings) {
  const { requireUser, requireOrg, requireSite } = guards;

  /** Runs fn in one transaction. */
  async function tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Public: which sign-in methods the login page should offer. */
  app.get('/api/config', async () => ({ google: Boolean(settings.google) }));

  /**
   * The signed-in user, their organisations and every site they can open.
   * One call for the dashboard to bootstrap the site switcher.
   */
  app.get('/api/me', { preHandler: requireUser }, async (req) => {
    const userId = req.principal!.userId;
    const [orgs, sites, methods] = await Promise.all([
      db.query<{ id: string; name: string; slug: string; role: string }>(
        `SELECT o.id, o.name, o.slug, m.role
           FROM member m JOIN organization o ON o.id = m."organizationId"
          WHERE m."userId" = $1
          ORDER BY o.name`,
        [userId],
      ),
      db.query<{ id: string; name: string; platform: Platform; org_id: string; org_name: string; role: string; allowed_origins: string[] }>(
        `SELECT s.id, s.name, s.platform, s.org_id, o.name AS org_name, m.role, s.allowed_origins
           FROM sites s
           JOIN member m ON m."organizationId" = s.org_id
           JOIN organization o ON o.id = s.org_id
          WHERE m."userId" = $1
          ORDER BY o.name, s.name`,
        [userId],
      ),
      db.query<{ providerId: string }>(`SELECT DISTINCT "providerId" FROM account WHERE "userId" = $1`, [userId]),
    ]);
    return {
      user: { ...req.principal, signInMethods: methods.rows.map((r) => r.providerId) },
      orgs: orgs.rows.map((o) => ({ id: o.id, name: o.name, slug: o.slug, role: topRole(o.role) })),
      sites: sites.rows.map((s) => ({
        id: s.id,
        name: s.name,
        platform: s.platform,
        orgId: s.org_id,
        orgName: s.org_name,
        role: topRole(s.role),
        origins: s.allowed_origins,
      })),
    };
  });

  /** Add a site to an organisation (owner/admin). Returns the site secret once; only its hash is stored. */
  app.post(
    '/api/orgs/:orgId/sites',
    {
      preHandler: requireOrg('admin'),
      schema: {
        body: {
          type: 'object',
          required: ['name', 'platform', 'origins'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 120 },
            platform: { type: 'string', enum: [...PLATFORMS] },
            origins: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string', maxLength: 255 } },
            timezone: { type: 'string', minLength: 1, maxLength: 64 },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body as { name: string; platform: Platform; origins: string[]; timezone?: string };
      const origins = body.origins.map(toOrigin);
      if (origins.some((o) => o === null)) return reply.code(400).send({ error: 'invalid_origin', hint: 'e.g. https://www.example.com' });

      const site = await tx((q) =>
        createSite(q, settings, { orgId: req.tenant!.orgId, name: body.name.trim(), platform: body.platform, origins: origins as string[], timezone: body.timezone }),
      );
      return reply.code(201).send({
        site: { id: site.id, name: body.name.trim(), platform: body.platform, orgId: req.tenant!.orgId },
        siteKey: site.key,
        siteSecret: site.secret,
        ...(site.webhookUrl ? { webhookUrl: site.webhookUrl } : {}),
        scriptTag: scriptTag(settings, site.key),
        note: 'The site secret and webhook URL are shown only now.',
      });
    },
  );

  /** One site (any member). Secrets are never returned after creation. */
  app.get('/api/sites/:siteId', { preHandler: requireSite('member') }, async (req) => {
    const { rows } = await db.query<{ siteKey: string } & Record<string, unknown>>(
      `SELECT id, name, platform, timezone, allowed_origins AS "allowedOrigins", site_key AS "siteKey", created_at AS "createdAt"
         FROM sites WHERE id = $1`,
      [req.tenant!.siteId],
    );
    return { ...rows[0], scriptTag: scriptTag(settings, rows[0].siteKey), orgId: req.tenant!.orgId, role: req.tenant!.role };
  });

  /** Rename a site or change its origins (owner/admin). */
  app.patch(
    '/api/sites/:siteId',
    {
      preHandler: requireSite('admin'),
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 120 },
            origins: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string', maxLength: 255 } },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body as { name?: string; origins?: string[] };
      const origins = body.origins?.map(toOrigin);
      if (origins?.some((o) => o === null)) return reply.code(400).send({ error: 'invalid_origin' });
      await db.query(
        `UPDATE sites SET name = COALESCE($2, name), allowed_origins = COALESCE($3, allowed_origins) WHERE id = $1`,
        [req.tenant!.siteId, body.name?.trim() ?? null, origins ? [...new Set(origins)] : null],
      );
      return { ok: true };
    },
  );

  /* ---------- WordPress connect handoff (contract §8) ---------- */

  /**
   * Step 2, after the plugin sent the user to /connect/wordpress and they confirmed (owner/admin of :orgId).
   * Uses the chosen WordPress site of the organisation, or creates one for the WordPress origin, then issues
   * a one-time code (5 min) and returns where to send the browser: return_url?code=…&state=….
   *
   * The code buys the site secret, so it may only go back to the WordPress site itself: return_url must be on
   * the same origin as home_url (https when deployed), and an existing site must already allow that origin.
   */
  app.post(
    '/api/orgs/:orgId/connect/wordpress',
    {
      preHandler: requireOrg('admin'),
      schema: {
        body: {
          type: 'object',
          required: ['homeUrl', 'returnUrl', 'state'],
          additionalProperties: false,
          properties: {
            homeUrl: { type: 'string', minLength: 1, maxLength: 500 },
            returnUrl: { type: 'string', minLength: 1, maxLength: 1000 },
            state: { type: 'string', pattern: '^[A-Za-z0-9._~-]{8,200}$' },
            siteId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body as { homeUrl: string; returnUrl: string; state: string; siteId?: string };
      const origin = toOrigin(body.homeUrl);
      let ret: URL;
      try {
        ret = new URL(body.returnUrl);
      } catch {
        return reply.code(400).send({ error: 'invalid_return_url' });
      }
      if (!origin || ret.origin !== origin) return reply.code(400).send({ error: 'return_url_not_on_site' });
      if (settings.deployed && ret.protocol !== 'https:' && !LOCAL_HOSTS.has(ret.hostname)) {
        return reply.code(400).send({ error: 'https_required' });
      }

      const orgId = req.tenant!.orgId;
      const userId = req.principal!.userId;
      const code = crypto.randomBytes(32).toString('base64url');

      const result = await tx(async (q) => {
        let siteId = body.siteId;
        if (siteId) {
          const { rows } = await q.query<{ platform: Platform; allowed_origins: string[] }>(
            'SELECT platform, allowed_origins FROM sites WHERE id = $1 AND org_id = $2',
            [siteId, orgId],
          );
          if (!rows[0]) return { error: 'not_found' as const, status: 404 };
          if (rows[0].platform !== 'wordpress') return { error: 'not_wordpress' as const, status: 400 };
          if (!rows[0].allowed_origins.includes(origin)) return { error: 'origin_not_allowed' as const, status: 400 };
        } else {
          siteId = (await createSite(q, settings, { orgId, name: new URL(origin).host, platform: 'wordpress', origins: [origin] })).id;
        }
        await q.query(`DELETE FROM connect_codes WHERE expires_at < now() - interval '1 day'`);
        await q.query('INSERT INTO connect_codes (code_hash, site_id, user_id, expires_at) VALUES ($1, $2, $3, $4)', [
          sha256hex(code),
          siteId,
          userId,
          new Date(Date.now() + CONNECT_CODE_TTL_MS),
        ]);
        return { siteId };
      });
      if (result.error) return reply.code(result.status ?? 400).send({ error: result.error });

      ret.searchParams.set('code', code);
      ret.searchParams.set('state', body.state);
      reply.header('cache-control', 'no-store');
      return { siteId: result.siteId, redirectUrl: ret.toString() };
    },
  );

  /**
   * Step 3, called by the plugin server to server: redeems the code once and returns the site key and a new
   * site secret (only its hash is stored, so connecting rotates the secret). Public; the code is the credential.
   * Redeem + rotate run in app_connect_exchange() (migrations/004_connect.sql): there is no signed-in user here,
   * so it must not depend on per-user row-level security on `sites`.
   */
  app.post(
    '/api/connect/exchange',
    {
      schema: {
        body: {
          type: 'object',
          required: ['code'],
          properties: { code: { type: 'string', pattern: '^[A-Za-z0-9_-]{20,100}$' } },
        },
      },
    },
    async (req, reply) => {
      const { code } = req.body as { code: string };
      const secret = newSiteSecret();
      const { rows } = await db.query<{ site_key: string | null }>('SELECT app_connect_exchange($1, $2) AS site_key', [
        sha256hex(code),
        sha256hex(secret),
      ]);
      reply.header('cache-control', 'no-store');
      const siteKey = rows[0]?.site_key;
      if (!siteKey) return reply.code(400).send({ error: 'invalid_code' });
      return { site_key: siteKey, site_secret: secret };
    },
  );
}
