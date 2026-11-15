import type { FastifyInstance } from 'fastify';
import type { Settings } from './config.ts';
import type { Db } from './db.ts';
import { newSiteKey, newSiteSecret, newWebhookToken, sha256hex, toOrigin } from './keys.ts';
import { topRole, type Guards } from './tenant.ts';

const PLATFORMS = ['php', 'wordpress', 'wix'] as const;
type Platform = (typeof PLATFORMS)[number];

export function registerRoutes(app: FastifyInstance, db: Db, guards: Guards, settings: Settings) {
  const { requireUser, requireOrg, requireSite } = guards;

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
      db.query<{ id: string; name: string; platform: Platform; org_id: string; org_name: string; role: string }>(
        `SELECT s.id, s.name, s.platform, s.org_id, o.name AS org_name, m.role
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
      sites: sites.rows.map((s) => ({ id: s.id, name: s.name, platform: s.platform, orgId: s.org_id, orgName: s.org_name, role: topRole(s.role) })),
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

      const key = newSiteKey();
      const secret = newSiteSecret();
      const token = body.platform === 'wix' ? newWebhookToken() : null;
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO sites (name, platform, timezone, allowed_origins, site_key, site_secret_hash, webhook_token_hash, org_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [body.name.trim(), body.platform, body.timezone ?? 'Europe/Berlin', [...new Set(origins)], key, sha256hex(secret), token ? sha256hex(token) : null, req.tenant!.orgId],
        );
        await client.query('INSERT INTO site_config (site_id) VALUES ($1)', [rows[0].id]);
        await client.query('COMMIT');
        return reply.code(201).send({
          site: { id: rows[0].id, name: body.name.trim(), platform: body.platform, orgId: req.tenant!.orgId },
          siteKey: key,
          siteSecret: secret,
          ...(token ? { webhookUrl: `${settings.collectBaseUrl}/v1/w/${token}` } : {}),
          scriptTag: `<script defer src="${settings.collectBaseUrl}/v1/r1.js" data-site="${key}"></script>`,
          note: 'The site secret and webhook URL are shown only now.',
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  );

  /** One site (any member). Secrets are never returned after creation. */
  app.get('/api/sites/:siteId', { preHandler: requireSite('member') }, async (req) => {
    const { rows } = await db.query(
      `SELECT id, name, platform, timezone, allowed_origins AS "allowedOrigins", site_key AS "siteKey", created_at AS "createdAt"
         FROM sites WHERE id = $1`,
      [req.tenant!.siteId],
    );
    return { ...rows[0], orgId: req.tenant!.orgId, role: req.tenant!.role };
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
}
