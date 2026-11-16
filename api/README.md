# Rate 1 app API (W4)

Node + Fastify service behind `app.<domain>/api/*`. Owns sign-in (email + password, MFA, Google) and tenant authorization for the dashboard. The collector (`collect.<domain>`, `ingest/`) is a separate process and never deals with users.

```bash
npm install
npm run db:up            # Postgres 16 in Docker on 127.0.0.1:5434
cp .env.example .env     # defaults work locally
npm run migrate
npm run dev              # 127.0.0.1:8081; dashboard dev server proxies /api here
npm test                 # needs db:up; each test file creates its own database
npm run typecheck
```

Runs TypeScript directly (Node ≥ 22.18 type stripping), no build step. Without `SMTP_URL`, emails (verification links, sign-in codes, invitations) are printed to the log.

## How it works

**Authentication**: [Better Auth](https://www.better-auth.com) 1.7, in-process, on our Postgres (`src/auth.ts`), mounted at `/api/auth/*`.

| | |
| --- | --- |
| Sessions | Opaque token in `session`, signed HttpOnly cookie, host-only on `app.<domain>`, SameSite=Lax, Secure over HTTPS. 7-day sliding expiry (refreshed daily). Revocable: sign-out, password reset and "change password" end sessions server-side. |
| Email + password | scrypt hashes, 10+ characters. Email must be verified (1-hour link) before the first sign-in. Reset by 1-hour link. Sign-up and reset don't reveal whether an address exists. |
| MFA | `twoFactor` plugin. After a correct password, no session until a second factor: authenticator app (TOTP, RFC 6238), emailed 6-digit code (5 min, stored hashed), or a single-use backup code (stored encrypted). "Trust this device" skips it for 30 days. Lockout after repeated wrong codes. Applies to email/password sign-in only; Google sign-ins rely on Google's own 2-Step Verification. |
| Google | OAuth code flow, scopes `openid email profile`. Enabled only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. Redirect URI: `<APP_BASE_URL>/api/auth/callback/google`. Same verified email → same user (`accountLinking.trustedProviders: ['google']`). Search Console access stays a separate, per-site grant. |
| Abuse limits | Better Auth rate limits per client IP (`CLIENT_IP_HEADER`, set by the proxy), stored in Postgres (`rateLimit`). |

**Authorization**: tenant = organisation (`organization`, `member`, `invitation` tables from the organization plugin). Every site belongs to one organisation (`sites.org_id`). Roles: `owner` (everything), `admin` (sites, settings, members, invites), `member` (read-only).

`src/tenant.ts` guards every tenant route from the resource in its path plus the session user:

| Result | When |
| --- | --- |
| 401 | no session |
| 404 | not a member of the owning organisation, unknown or malformed id (outsiders can't tell it exists) |
| 403 | member, role below the route's minimum |
| ok | `request.tenant = { orgId, siteId, role }`; handlers use only these ids |

The session's active organisation never grants access. A site with `org_id = NULL` (e.g. created by ingest's CLI) is visible to nobody until assigned.

## Endpoints

| Method | Path | Guard | |
| --- | --- | --- | --- |
| GET, POST | `/api/auth/*` | Better Auth | sign-up/in/out, verify email, reset password, two-factor, organisations, invitations |
| GET | `/api/config` | public | `{ google: boolean }` for the login page |
| GET | `/api/me` | signed in | user, organisations with role, sites the user can open |
| POST | `/api/orgs/:orgId/sites` | admin | add a site; returns the site secret (and Wix webhook URL) once |
| GET | `/api/sites/:siteId` | member | site details (never secrets) |
| PATCH | `/api/sites/:siteId` | admin | rename, change allowed origins |
| POST | `/api/orgs/:orgId/connect/wordpress` | admin | WordPress connect step 2: `{homeUrl, returnUrl, state, siteId?}` → uses that WordPress site or creates one for the WordPress origin, returns `redirectUrl` = `returnUrl?code=…&state=…` |
| POST | `/api/connect/exchange` | public (the code) | WordPress connect step 3, server to server: `{code}` → `{site_key, site_secret}` |
| GET | `/api/sites/:siteId/config` | member | tracking config (`site_config`, §5) in editor shape, plus the forms the WordPress plugin reported |
| PUT | `/api/sites/:siteId/config` | admin | replace sections, booking paths, `spa`, request rules; bumps `config_version`, 409 if based on an older version, 400 `{field, message}` when invalid |
| GET | `/api/sites/:siteId/checks` | member | setup checklist (§12), computed from the tracking tables and stored in `site_checks` |
| GET | `/api/sites/:siteId/stats?weeks=4\|13\|26` | member | report data (§10, §11): 52 weekly series for the site and its 30 most viewed pages, breakdowns for the range (sources, devices, contact clicks and requests, scroll, time, sections), booking/calculator funnels, routes to a request, latest 200 requests |
| GET | `/healthz` | public | `{ ok, version }` |

**Request rules** (`src/site-config.ts`): the editor works on one list; on save, rules become `request_rules` entries (`{method, form, source?, form_id?, path?, counts}`, contract README edit #6) and browser rules with selectors also become `forms_browser` entries. Each form must have exactly one rule with `counts: true` (§5). Typed paths (booking, thank-you, section pages) are normalised with the §1 rule before storing.

**Setup checklist** (`src/checks.ts`): `pass` / `fail` / `pending`. Pending means the source doesn't exist yet: `pages_tagged` and `csp_ok` need the page scanner, `gsc_connected` needs `gsc_connections`, `buttons_found` passes on a contact click but can't fail without the scanner. Each source table is looked up with `to_regclass`, so the checklist also works on a database without ingest's tables.

**Report data** (`src/stats.ts`): raw counts read from ingest's tables; the dashboard computes rates and ranges. Test visits and everything linked to them are left out; a counted request is `counts AND NOT spam`; weeks start Monday in the site's timezone. Pages use the landing-page credit mode (§11 PoC default). Without ingest's tables the response is empty.

New dashboard data endpoints go under `/api/sites/:siteId/…` with `preHandler: requireSite('member')` and filter every query by `request.tenant.siteId`.

## Database

`migrations/*.sql`, tracked in `app_schema_migrations` (ingest uses `schema_migrations`). Run with the database owner (`MIGRATION_DATABASE_URL` or `DATABASE_URL`); the service itself can run as `app_rw`, which `003_tenancy.sql` grants the auth tables to. `ingest_rw` gets nothing on them.

- `001_sites.sql`: `sites`, `site_config` exactly as in `ingest/migrations/001_init.sql`, `IF NOT EXISTS` (for an empty dev database).
- `002_auth.sql`: Better Auth schema, generated from `src/auth.ts`. Regenerate into a new migration when upgrading Better Auth or changing plugins.
- `003_tenancy.sql`: `sites.org_id` (nullable, `ON DELETE SET NULL`), unique membership per (org, user), grants.
- `006_site_checks.sql`: `site_checks` (§10, one row per site and check id). Row-level security policies when the RLS migration has already run.

## Environment

See `.env.example`. Required when deployed (`ENV=test|prod` or an `https://` `APP_BASE_URL`): `DATABASE_URL`, `APP_BASE_URL`, `BETTER_AUTH_SECRET` (32+ random characters), `SMTP_URL`. Optional: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MAIL_FROM`, `CLIENT_IP_HEADER` (default `x-forwarded-for`), `HOST` (127.0.0.1), `PORT` (8081).

## Reverse proxy

Static dashboard and `/api/*` on the same host, so the session cookie is first-party and there is no CORS. The API listens on loopback only.

nginx:

```nginx
server {
  listen 443 ssl;
  server_name app.example.com;
  add_header Strict-Transport-Security "max-age=31536000" always;
  root /srv/rate1/dashboard;

  location /api/ {
    proxy_pass http://127.0.0.1:8081;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-For   $remote_addr;   # replace, never append, the client's value
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  location / { try_files $uri /index.html; }
}
```

Production uses Caddy instead: `infra/caddy/Caddyfile` sends `app.<domain>/api/*` to the `api` service and the rest to the static dashboard. `api/Dockerfile` builds the image; `infra/docker-compose.yml` runs `api-migrate` (migrations as the superuser, once per deploy) and then `api` (as `app_rw`). See `infra/README.md`.

## WordPress connect (contract §8)

1. The plugin's "Connect to Rate 1" sends the admin to `/connect/wordpress?home_url=…&return_url=…&state=…` (dashboard page; sign-in first if needed).
2. An owner/admin of the organisation picks a WordPress site that already allows that origin, or adds the origin as a new site, and confirms. The API issues a one-time code (32 random bytes; stored as SHA-256 in `connect_codes`, valid 5 minutes) and the browser goes to `return_url?code=…&state=…`.
3. The plugin checks `state` and calls `POST /api/connect/exchange`. The code is redeemed once by `app_connect_exchange()` (`SECURITY DEFINER`, because there is no signed-in user and so no tenant to satisfy row-level security on `sites`); the response carries the site key and a **new** site secret, because only the secret's hash is stored. Connecting therefore rotates the secret; anything else using the old one must be updated.

The code buys the secret, so it may only go back to the WordPress site: `return_url` must be on the same origin as `home_url` (https when deployed, except localhost), and an existing site must already list that origin. Cancelling returns `return_url?error=access_denied&state=…`.

## Not done yet

- Postgres row-level security as a second layer behind the guards.
- Changing a member's role from the UI (Better Auth supports it; no screen yet).
- Google sign-in was not exercised end to end (needs a Google OAuth client).
