import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Auth } from './auth.ts';
import type { Db } from './db.ts';

/**
 * Tenant authorization.
 *
 * Tenant = organisation. A site belongs to one organisation (sites.org_id); a user
 * belongs to organisations through `member` with a role. Every tenant route names
 * its resource in the path (/api/sites/:siteId/…, /api/orgs/:orgId/…), and the
 * guard below decides from (resource, session user) alone. The session's active
 * organisation never grants anything.
 *
 *   no session                      → 401
 *   not a member / unknown resource → 404 (outsiders can't tell it exists)
 *   member, role below the minimum  → 403
 *   otherwise                       → request.tenant = { orgId, siteId?, role }
 *
 * Handlers must take the site and organisation from request.tenant, never from
 * the body or query string.
 */

export const ROLES = ['member', 'admin', 'owner'] as const;
export type Role = (typeof ROLES)[number];
const RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 };

/** Highest known role in Better Auth's role field (a comma-separated list), or null. */
export function topRole(field: string | null | undefined): Role | null {
  let best: Role | null = null;
  for (const raw of (field ?? '').split(',')) {
    const r = raw.trim() as Role;
    if (r in RANK && (!best || RANK[r] > RANK[best])) best = r;
  }
  return best;
}

export interface Principal {
  userId: string;
  email: string;
  name: string;
  twoFactorEnabled: boolean;
}

export interface Tenant {
  orgId: string;
  siteId?: string;
  role: Role;
}

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
    tenant: Tenant | null;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUTH_ID = /^[A-Za-z0-9_-]{1,64}$/; // Better Auth ids: random base62 strings

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;

export function createGuards(auth: Auth, db: Db) {
  /** Resolves the session cookie to request.principal; sends 401 when there is none. */
  async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    const s = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!s) {
      reply.code(401).send({ error: 'unauthenticated' });
      return false;
    }
    req.principal = {
      userId: s.user.id,
      email: s.user.email,
      name: s.user.name,
      twoFactorEnabled: Boolean(s.user.twoFactorEnabled),
    };
    return true;
  }

  function decide(req: FastifyRequest, reply: FastifyReply, roleField: string | undefined, min: Role, where: Omit<Tenant, 'role'> | null) {
    const role = topRole(roleField);
    if (!role || !where) {
      reply.code(404).send({ error: 'not_found' });
      return reply;
    }
    if (RANK[role] < RANK[min]) {
      reply.code(403).send({ error: 'forbidden', required: min, role });
      return reply;
    }
    req.tenant = { ...where, role };
    return undefined;
  }

  /** Signed in; no tenant needed (e.g. /api/me, onboarding). */
  const requireUser: Guard = async (req, reply) => ((await authenticate(req, reply)) ? undefined : reply);

  /** Member of the organisation that owns :siteId, with at least `min`. */
  const requireSite =
    (min: Role): Guard =>
    async (req, reply) => {
      if (!(await authenticate(req, reply))) return reply;
      const { siteId } = req.params as { siteId: string };
      if (!UUID.test(siteId)) return decide(req, reply, undefined, min, null);
      const { rows } = await db.query<{ org_id: string; role: string }>(
        `SELECT s.org_id, m.role
           FROM sites s
           JOIN member m ON m."organizationId" = s.org_id
          WHERE s.id = $1 AND m."userId" = $2`,
        [siteId, req.principal!.userId],
      );
      const row = rows[0];
      return decide(req, reply, row?.role, min, row ? { orgId: row.org_id, siteId } : null);
    };

  /** Member of :orgId, with at least `min`. */
  const requireOrg =
    (min: Role): Guard =>
    async (req, reply) => {
      if (!(await authenticate(req, reply))) return reply;
      const { orgId } = req.params as { orgId: string };
      if (!AUTH_ID.test(orgId)) return decide(req, reply, undefined, min, null);
      const { rows } = await db.query<{ role: string }>(`SELECT role FROM member WHERE "organizationId" = $1 AND "userId" = $2`, [
        orgId,
        req.principal!.userId,
      ]);
      return decide(req, reply, rows[0]?.role, min, rows[0] ? { orgId } : null);
    };

  return { requireUser, requireSite, requireOrg };
}

export type Guards = ReturnType<typeof createGuards>;
