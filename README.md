# website-dashboard (Rate 1 PoC)

| Folder | What | Contract |
| --- | --- | --- |
| `specs/` | `Data-Contract-v1.md`: the only interface between the parts | – |
| `contract/` | JSON Schemas, shared path vectors, mock collector, proposed contract edits | all |
| `fixtures/` | Example payloads per endpoint (valid / invalid / sender violations) | §13 |
| `tracker/` | `r1.js` browser tracker (TypeScript → one IIFE, ≈3.9 KB gzipped) | §3–§5 |
| `ingest/` | Collector service on `collect.<domain>` (Node, Fastify, Postgres) | §4–§10 |
| `wp-plugin/` | WordPress plugin `rate1-connector` | §6, §8 |
| `integrations/php/` | One-file helper for custom PHP form handlers | §6 |
| `integrations/wix/` | Wix install guide (non-developers) | §3, §7 |
| `dashboard/` | React dashboard on `app.<domain>`: sign-in, organisations, sites, WordPress connect; no site data yet | §8, §10–§12 |
| `api/` | Dashboard API on `app.<domain>/api` (Node, Fastify, Better Auth): sign-in with MFA, tenants, sites, WordPress connect | §8, §10 |
| `infra/` | Hetzner server (Terraform), Docker Compose (Caddy, ingest, app, Postgres), deploy-on-merge CI, backups | §2 |

Test results: [TESTING.md](TESTING.md).
