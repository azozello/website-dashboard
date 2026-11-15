# Ingest (collect host)

The collector at `https://collect.bazed.live`: receives r1.js events, server-side form requests, Wix webhooks and WordPress plugin hellos, applies the processing rules, writes Postgres. Implements `specs/Data-Contract-v1.md` §2 (its part), §4–§10. Node 22+, Fastify, `pg`.

```bash
npm install
npm test                    # 106 tests on in-process Postgres (PGlite), no Docker needed
npm run typecheck
npm run build               # dist/main.js, dist/cli.js (esbuild)

# real chain: Chromium → r1.js → ingest over HTTP → Postgres 16
docker compose -f docker-compose.test.yml up -d
npm run build:tracker && npm run test:e2e
# + WordPress: run ../wp-plugin/tests/run.sh --keep first (leaves WordPress on :8088)
WP_E2E=1 npm run test:e2e
docker compose -f docker-compose.test.yml down

# run locally against that Postgres
DATABASE_URL=postgres://rate1:rate1@127.0.0.1:5433/rate1 npm run dev
```

## Endpoints

| Endpoint | Auth | Responses |
| --- | --- | --- |
| `GET /healthz` | – | `200 {"ok": true, "version"}`, `503` if Postgres is down |
| `GET /v1/r1.js`, `/v1/r1.<version>.js` | – | `Cache-Control: public, max-age=3600` / versioned `immutable` |
| `GET /v1/config/{site_key}` (I2) | public | `200` config, `Access-Control-Allow-Origin: *`, `max-age=300`; `404` unknown key |
| `POST /v1/e` (I1) | site key + Origin (Referer host fallback) | `204` · `400 {"field"}` · `403` · `413` (>16 KB) · `429` (>120/min/IP) |
| `POST /v1/r` (I3) | `Bearer sk_…` | `202 {"request_id"}` · `200` duplicate rid · `400` · `401` · `429` (>60/min/IP) |
| `POST /v1/w/{webhook_token}` (I4) | token in URL | `202` · `401` · `400` |
| `POST /v1/plugin/hello` (I5) | `Bearer sk_…` | `200 {"ok", "site_id", "config_version"}` · `401` |
| `GET /v1/_echo` | only with `ENV=test` | `{"ip_seen", "ua_seen", "origin"}` |

Bodies are parsed as text whatever the content type (sendBeacon sends `text/plain`).

## Site admin (until the dashboard owns `sites`)

```bash
node dist/cli.js create-site --name "Praxis Müller" --platform wordpress --origin https://www.praxis-mueller.de --origin https://praxis-mueller.de
# → site_key, site_secret (shown once), webhook_token + URL for wix, script tag
node dist/cli.js set-origins --site pk_… --origin https://…
node dist/cli.js set-config  --site pk_… --file config.json   # bumps config_version
node dist/cli.js rotate-secret --site pk_…
node dist/cli.js list-sites
```

On the server: `docker exec rate1-ingest-1 node dist/cli.js …` (see `infra/README.md`).

`config.json` for `set-config`:

```json
{
  "spa": "auto",
  "sections": [{"path": "/back-pain", "selector": "#prices", "name": "prices"}],
  "booking_paths": ["/booking"],
  "forms_browser": [{"form": "contact", "selector": "form", "success_selector": ".form-success"}],
  "request_rules": [
    {"method": "server", "source": "cf7", "form_id": "12", "form": "contact", "counts": true},
    {"method": "browser", "form": "contact", "counts": true},
    {"method": "webhook", "form": "Kontakt", "counts": false},
    {"method": "thankyou", "path": "/danke", "form": "contact", "counts": true}
  ]
}
```

## Processing (what the dashboard can rely on)

- **Visitor key** = first 32 hex of SHA-256(daily salt ‖ site id ‖ client IP ‖ UA). Salt: 32 random bytes per UTC day in `salts`, older days deleted. Neither IP nor UA is stored or logged (tested).
- **Client IP** from `CLIENT_IP_HEADER` only when the TCP peer is in `TRUSTED_PROXY_CIDRS`; for `X-Forwarded-For` the rightmost non-trusted hop.
- **Visits:** same site + visitor key + test flag, last event < 30 min ago. Test (`?r1_debug=1`) and real traffic never share a visit. Batches of one visitor are serialised with an advisory lock, so `seq` is gap-free.
- **Source channel / detail, device:** §9 rules from the visit's first page view (`src/classify.ts`).
- **Bots:** known bot/tool UAs (incl. `HeadlessChrome`, empty UA) and `wd: true` are dropped with `204`, unless `test: true`.
- **pageview:** first one wins; fills a stub that an earlier engage created; links any server request that arrived first with the same `pv`.
- **engage:** max `active_ms`, max `scroll`, union of `sections` (first-seen order, ≤20); missing page view → stub with `nav = 'unknown'`.
- **click / step:** dedupe on (`pv`, `eid`) / unique (visit, `flow_id`, `step`).
- **form_ok:** a `browser` request only if `request_rules` has `{method: "browser", form}` or `forms_browser` has that form.
- **Thank-you rules:** at most one request per visit per rule, `path`/`pv` = the previous page view in the visit.
- **Server requests:** `pv` → page view → visit; unknown `pv` → unattributed (linked later if the page view arrives); `path` falls back to the page view's path. Senders normalise paths; ingest doesn't normalise them again (normalising twice isn't idempotent for `%25`, `%3F`).
- **Webhook:** keeps only `form` and `submission_id`; everything else is discarded unread. `source = 'wix'`, no visit, no path; dedupe on `submission_id`.
- **`counts`:** from the matching request rule; with no rule, `server` and `webhook` requests count.
- **Idempotency:** unique `(site_id, confirmation, external_id)`: `rid` (server), `submission_id` (webhook), `pv:eid` (browser), `ty:<visit>:<rule>` (thank-you).
- **Retention:** every 6 h: visits (cascading page views, clicks, steps) and requests older than 14 months; salts of past days.

## Environment (§2)

`ENV` (`test` | `prod`), `DATABASE_URL`, `COLLECT_BASE_URL`, `APP_BASE_URL`, `TRUSTED_PROXY_CIDRS` (comma-separated), `CLIENT_IP_HEADER` (default `X-Forwarded-For`), `PORT` (8080), `R1_JS_DIR` (folder with `r1.js`), `APP_VERSION`.

Logs: no request logging at all; errors log the route pattern and message only (no URLs, so no webhook tokens; no bodies; no IPs).
