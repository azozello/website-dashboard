# Rate 1 PoC — Data contract v1

Version 1.0 · 15 Nov 2026 · Status: proposal, to be agreed
Scope: PoC build steps 1 and 3 from `docs/Website-Dashboard-Specification.md` (tracking + Search Console + overview and page list; connect flow + setup checklist). Test sites: custom PHP, WordPress, Wix.

This contract is the only thing the four workstreams share. Anything not written here is internal to one workstream and can change freely. A change to anything here = edit this doc + a changelog line at the bottom + updated fixtures (§13).

---

## 0. Workstreams and interfaces

| Workstream | Owns | Shares only |
| --- | --- | --- |
| W1 Infra (Hetzner) | Servers, reverse proxy, TLS, Postgres, backups, deploys | §2 |
| W2 r1.js + WordPress plugin (+ PHP snippet, Wix setup guide) | Browser tracking, WordPress integration, install instructions | §3–§8 |
| W3 Ingest backend | Collector endpoints, processing rules, writing tracking data | §4–§10 |
| W4 Dashboard | UI and its API, site admin, Search Console sync, page scanner, setup checks | §10–§12 |

| # | From → To | Endpoint | Auth |
| --- | --- | --- | --- |
| I1 | Browser (r1.js) → Ingest | `POST /v1/e` | Site key + Origin check |
| I2 | Browser (r1.js) → Ingest | `GET /v1/config/{site_key}` | Public |
| I3 | Site server (WP plugin, PHP snippet) → Ingest | `POST /v1/r` | Site secret |
| I4 | Wix Automations → Ingest | `POST /v1/w/{webhook_token}` | Token in URL |
| I5 | WP plugin → Ingest | `POST /v1/plugin/hello` | Site secret |
| I6 | WP plugin ↔ Dashboard | Connect handoff (§8) | One-time code |
| I7 | Ingest → Postgres → Dashboard | Tables in §10 | Database roles |
| I8 | Dashboard → Google | Search Console API | OAuth |

---

## 1. Conventions

- **Format:** JSON, UTF-8.
- **Time:** client events carry `ts` (Unix ms, client clock, informational only). The server stores `received_at` (UTC) as the truth. Reporting days use the site's timezone (default Europe/Berlin).
- **IDs:**
  - `site_key`: `pk_` + 24 base62 characters. Public, appears in page HTML.
  - `site_secret`: `sk_` + 40 base62. Server-side only, stored hashed.
  - `webhook_token`: `wh_` + 32 base62. Wix only, stored hashed.
  - Page token `pv`: 16 base62, new on every page load and every in-page route change.
  - Event id `eid`: 8 base62, random per event.
- **Path normalisation** (r1.js, ingest and the Search Console import all apply the same rule): take the URL pathname; drop query and fragment; percent-decode; remove a trailing slash except for `/`; keep letter case. `https://site.example/Back-Pain/?utm_source=x#top` → `/Back-Pain`.
- **Versioning:** path prefix `/v1` and envelope field `"v": 1`. Adding optional fields is not breaking; receivers ignore unknown fields. A breaking change gets `/v2`.
- **Idempotency:** browser events dedupe on (`pv`, `eid`); server requests dedupe on (site, `rid`); Wix webhooks on (site, `submission_id`) when present.
- **Privacy rules for every workstream:**
  - Never store or log a raw IP address, a full user agent string, form field values, query parameters other than `utm_*`, or a referrer's path or query (host only).
  - No cookies, localStorage or other device storage, from r1.js or from any collect host.

---

## 2. Infra contract (W1)

| Item | Value |
| --- | --- |
| Region | Hetzner, EU location (Nuremberg or Falkenstein) |
| Hosts | `collect.<domain>`: ingest service, serves r1.js and all `/v1/*`. `app.<domain>`: dashboard and its API. Separate hosts. `collect` never sets cookies; `app` cookies are host-only (no `Domain=`). |
| TLS | HTTPS only, automatic certificates; HSTS on `app` |
| Reverse proxy | In front of both hosts. Passes the client IP in `X-Forwarded-For` (or `CF-Connecting-IP` if Cloudflare is added in front). Ingest trusts that header only from `TRUSTED_PROXY_CIDRS`. |
| Limits at proxy | `/v1/e`: body ≤ 16 KB, 120 requests/min per IP. `/v1/r`, `/v1/w`, `/v1/plugin/*`: 60 requests/min per IP |
| Database | Postgres 16, database `rate1`. Roles: `ingest_rw` (writes tracking tables, reads `sites` and `site_config`), `app_rw` (writes site, admin, auth and Search Console tables, reads everything). `ingest_rw` has no access to the auth tables. |
| r1.js | Served from `collect` at `/v1/r1.js` (Cache-Control 1 h); versioned copies at `/v1/r1.<version>.js` |
| Health | `GET /healthz` on both hosts → `200 {"ok": true, "version": "…"}` |
| Logs | Proxy access logs off for `/v1/*`, or IP-masked. No request bodies from `/v1/*` in application logs. |
| Backups | Daily Postgres dump, 7-day retention |
| Environment variables | `ENV` (test or prod), `DATABASE_URL`, `COLLECT_BASE_URL`, `APP_BASE_URL`, `TRUSTED_PROXY_CIDRS`, `CLIENT_IP_HEADER`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`; app API only: `BETTER_AUTH_SECRET`, `SMTP_URL`, `MAIL_FROM` |
| Test-only endpoint | `GET /v1/_echo` on `collect` when `ENV=test` → `{"ip_seen", "ua_seen", "origin"}`, to prove the proxy passes the real client IP |

---

## 3. What a site adds (W2 writes the install guide)

- **Script tag**, in the `<head>` of every page:
  `<script defer src="https://collect.<domain>/v1/r1.js" data-site="pk_…"></script>`
  Optional attribute `data-consent="required"`: r1.js sends only page views until `window.r1.consent(true)` is called.
- **Per platform:**
  - **WordPress:** the plugin prints the tag; nothing else.
  - **Wix:** Settings → Custom Code → Head → All pages → **Load code once**. r1.js detects page changes itself.
  - **PHP:** paste the tag into the shared header include.
- **Sections (optional markup):** `data-r1-section="prices"` on any element. Alternatively selectors in the site config (§5), set from the dashboard.
- **Booking buttons that aren't links to a booking path (optional):** `data-r1-cta="booking"`.
- **Hidden fields** r1.js adds to every `<form>` on the page: `r1_pv` (page token) and `r1_path` (normalised path). Server hooks read them.
- **JS API:** `window.r1.step(flow, flowId, step, name?)` for booking or calculator steps; `window.r1.formOk(formId)` for custom browser-side success; `window.r1.consent(true|false)`.

---

## 4. Browser events — `POST /v1/e` (I1)

**Transport:** `navigator.sendBeacon`, body = JSON string with `Content-Type: text/plain`. Fallback: `fetch` with `keepalive: true`, `mode: "no-cors"`, `credentials: "omit"`. r1.js never reads the response, except in debug mode (`?r1_debug=1`): there it uses a CORS fetch and shows the status, and the collector returns `Access-Control-Allow-Origin` for allowed origins.

**Envelope**

| Field | Type | Meaning |
| --- | --- | --- |
| `v` | int | Contract version, `1` |
| `k` | string | Site key |
| `wd` | bool | `navigator.webdriver` |
| `test` | bool | `true` when the page was opened with `?r1_debug=1` |
| `ev` | array | 1–25 events |

**Events**

| Field | In events | Type | Meaning |
| --- | --- | --- | --- |
| `type` | all | string | `pageview`, `engage`, `click`, `step`, `form_ok` |
| `eid` | all | string(8) | Random per event |
| `pv` | all | string(16) | Page token |
| `path` | all | string ≤ 512 | Normalised path |
| `ts` | all | int | Client Unix ms |
| `nav` | pageview | string | `load` (real page load) or `spa` (in-page route change) |
| `ref` | pageview | string ≤ 255 or null | Referrer host only; null if none or same site |
| `utm` | pageview | object | `source`, `medium`, `campaign`, `term`, `content` (each ≤ 100) |
| `clid` | pageview | array | Which click IDs were present: `gclid`, `fbclid`, `msclkid`. Names only, never values |
| `title` | pageview | string ≤ 200 | Page title |
| `vw` | pageview | int | Viewport width in px |
| `load_ms` | pageview | int or null | Load time from Navigation Timing; null for `spa` |
| `active_ms` | engage | int | Cumulative active time for this page view: tab visible and an interaction in the last 30 s |
| `scroll` | engage | int 0–100 | Highest scroll % reached |
| `sections` | engage | array ≤ 20 | Section names seen (40% of the element, or 40% of the viewport, visible) |
| `final` | engage | bool | `true` when sent on page hide or route change |
| `kind` | click | string | `call`, `whatsapp`, `email`, `booking_cta` |
| `label` | click | string ≤ 60 | Button text, optional |
| `flow` | step | string | `booking` or `calculator` |
| `flow_id` | step | string ≤ 60 | Which booking or calculator |
| `step` | step | int 1–20 | Step reached |
| `name` | step | string ≤ 60 | Step name, optional |
| `form` | form_ok | string ≤ 100 | Form id |

**Click rules in r1.js:** `tel:` → `call`; `wa.me`, `api.whatsapp.com` or `whatsapp:` → `whatsapp`; `mailto:` → `email`; `[data-r1-cta="booking"]` or a link to a booking path from the config → `booking_cta`.

**Example**

```json
{
  "v": 1,
  "k": "pk_3fK9sQ2LmV7xYp1aB8cD4eFg",
  "wd": false,
  "test": false,
  "ev": [
    {"type": "pageview", "eid": "a1B2c3D4", "pv": "Qm7Xk2Lp9Rt4Vb8N", "path": "/back-pain", "ts": 1794758400000, "nav": "load", "ref": "www.google.com", "utm": {}, "clid": [], "title": "Back pain treatment", "vw": 390, "load_ms": 1840},
    {"type": "click", "eid": "e5F6g7H8", "pv": "Qm7Xk2Lp9Rt4Vb8N", "path": "/back-pain", "ts": 1794758431000, "kind": "call", "label": "Call us"},
    {"type": "engage", "eid": "i9J0k1L2", "pv": "Qm7Xk2Lp9Rt4Vb8N", "path": "/back-pain", "ts": 1794758460000, "active_ms": 52000, "scroll": 68, "sections": ["headline", "prices"], "final": true}
  ]
}
```

**Responses:** `204` accepted · `400` invalid (body names the field) · `403` unknown key or origin not allowed · `413` too large · `429` rate limited.

**Ingest rules (W3)**

- Validate the envelope and fields; drop unknown event types; truncate strings to their limits.
- The `Origin` header must be in the site's allowed origins; if `Origin` is missing, fall back to the `Referer` host.
- Drop the batch if the user agent is a known bot or `wd` is `true`, unless `test` is `true` (then store it, flagged as test).
- `pageview`: insert if the `pv` is new; the first one wins.
- `engage`: merge into its page view: highest `active_ms`, highest `scroll`, union of `sections`. If the page view is missing, create a stub with `nav = "unknown"`.
- `click`, `step`: insert, deduped on (`pv`, `eid`); steps are unique per (visit, `flow_id`, `step`).
- `form_ok`: create a request with `confirmation = "browser"` if a request rule (§5) covers that form.
- A page view whose path matches a thank-you rule (§5) creates a request with `confirmation = "thankyou"`.

---

## 5. Site config — `GET /v1/config/{site_key}` (I2)

This is the one endpoint whose response a page reads. It returns `Access-Control-Allow-Origin: *` and `Cache-Control: max-age=300`. The dashboard writes the config (`site_config` table); ingest serves it.

```json
{
  "v": 1,
  "config_version": 3,
  "spa": "auto",
  "sections": [{"path": "/back-pain", "selector": "#prices", "name": "prices"}],
  "booking_paths": ["/booking"],
  "forms_browser": [{"form": "contact", "selector": "form", "success_selector": ".form-success"}]
}
```

**Request rules** (stored in `site_config.request_rules`; only `forms_browser` is exposed to the browser). Each form has exactly one primary method (`counts: true`); any other method on the same form is a shadow (`counts: false`), stored and shown only for comparison.

| Method | Typical platform | Matches on | Linked to a visit? |
| --- | --- | --- | --- |
| `server` | WordPress plugin, PHP snippet | `source` + `form_id` | Yes, through `r1_pv` |
| `webhook` | Wix Automations | Form name | No (unattributed) |
| `browser` | Wix, fallback anywhere | Selector + success selector, or `window.r1.formOk` | Yes |
| `thankyou` | PHP without code changes | Thank-you path; credited to the previous page in the visit | Yes |

PoC default for Wix: `browser` is primary, `webhook` is the shadow, so page rates work and the two counts can be compared.

---

## 6. Server requests — `POST /v1/r` (I3)

**Headers:** `Authorization: Bearer sk_…`, `Content-Type: application/json`.

| Field | Type | Meaning |
| --- | --- | --- |
| `v` | int | `1` |
| `rid` | string ≤ 120 | Sender's idempotency id, e.g. `cf7:12:<submission uuid>` |
| `ts` | int | Server Unix ms |
| `pv` | string(16) or null | From the `r1_pv` hidden field |
| `path` | string or null | From `r1_path`; else the HTTP Referer path, normalised |
| `channel` | string | `form`, `booking`, `calculator` |
| `source` | string | `cf7`, `elementor`, `wpforms`, `gravity`, `custom` |
| `form_id` | string ≤ 100 | Form id in its plugin |
| `spam` | bool | Spam verdict |
| `spam_reason` | string or null | `honeypot`, `plugin`, `too_fast` |

Never sent: form field values, names, emails, phone numbers, the visitor's IP address.

```json
{"v": 1, "rid": "cf7:12:8e1c0f6a-0b7e-4c1e-9a55-2f1d3b6a9c10", "ts": 1794758475000, "pv": "Qm7Xk2Lp9Rt4Vb8N", "path": "/back-pain", "channel": "form", "source": "cf7", "form_id": "12", "spam": false, "spam_reason": null}
```

**Responses:** `202 {"ok": true, "request_id": "…"}` · `200` duplicate `rid` (treat as success) · `400` invalid · `401` bad secret.

**Sender rules (W2):**
- Send only after the form plugin has accepted the submission (Contact Form 7: mail sent; Elementor: new record saved), using the form plugin's own spam verdict.
- Non-blocking, with a 3 s timeout. On failure, retry from a background queue (WP-Cron) up to 3 times with the same `rid`.
- **PHP snippet:** the same call from the form handler, with `source = "custom"`.

**Ingest (W3):** link `pv` → page view → visit. If `pv` is missing or unknown, store the request with no visit (unattributed). `confirmation = "server"`.

---

## 7. Wix webhook — `POST /v1/w/{webhook_token}` (I4)

**Wix setup:** Automations → trigger Wix Forms "Form submitted" → action "Send HTTP request" → the URL with the token. Use a custom structure containing only `{"form": "<form name>", "submission_id": "<if available>"}`, never "all keys and values".

**Ingest (W3):** keep only the keys `form` and `submission_id`, and discard everything else without storing it. Create a request with `confirmation = "webhook"`, no visit, no path. Dedupe on `submission_id` when present. Responses: `202` / `401`.

---

## 8. WordPress plugin ↔ platform (I5, I6)

**Hello — `POST /v1/plugin/hello`** (`Authorization: Bearer sk_…`), sent on activation, on settings save and daily.

```json
{
  "v": 1,
  "platform": "wordpress",
  "plugin_version": "0.1.0",
  "wp_version": "6.9",
  "php_version": "8.3",
  "home_url": "https://wp-test.example",
  "theme": "astra",
  "head_hook_ok": true,
  "forms": [{"source": "cf7", "id": "12", "title": "Contact"}, {"source": "elementor", "id": "a1b2c3", "title": "Quick enquiry"}],
  "cache": [{"plugin": "wp-rocket", "delay_js": true, "r1_excluded": true}],
  "consent": [{"plugin": "borlabs-cookie", "r1_category": "unknown"}]
}
```

Response: `{"ok": true, "site_id": "…", "config_version": 3}`. Ingest stores the body in `plugin_status.env`.

**Connect handoff** (the "one-click" install; fallback in the PoC is pasting the keys by hand):

1. The plugin's "Connect" button opens `https://app.<domain>/connect/wordpress?home_url=…&return_url=<wp-admin url>&state=<random>`.
2. The agency user logs in; the dashboard creates the site (or picks an existing one that already allows the `home_url` origin) and redirects to `return_url?code=<one-time, valid 5 min>&state=…`. `return_url` must be on the `home_url` origin (https outside development). Cancelling redirects to `return_url?error=access_denied&state=…`.
3. The plugin checks `state` and calls `POST https://app.<domain>/api/connect/exchange` with `{"code": "…"}` → `{"site_key": "pk_…", "site_secret": "sk_…"}`. The site secret is new (only its hash is stored), so connecting rotates it. Invalid, used or expired code → `400 {"error": "invalid_code"}`.
4. The plugin stores the keys and sends a hello.

---

## 9. Processing rules (W3; the dashboard relies on them)

- **Visitor key:** first 32 hex characters of SHA-256(daily salt ‖ site id ‖ client IP ‖ user agent). The salt is 32 random bytes per UTC day, deleted when the day ends. The client IP comes from the trusted header (§2).
- **Visit:** same site and visitor key with under 30 minutes since its last event → same visit; otherwise a new visit. The salt change at 00:00 UTC also starts a new visit.
- **Landing path:** path of the visit's first page view. `seq` numbers the page views within a visit in order.
- **Source channel**, from the visit's first page view; the first matching rule wins:
  1. `gclid` present, or `utm_source` = google with `utm_medium` in (cpc, ppc, paid) → `google_ads`
  2. Any other `utm_source` → `campaign`
  3. Referrer host `google.*` → `google_organic`
  4. Referrer host Bing, DuckDuckGo, Ecosia or Yahoo → `other_search`
  5. Referrer host Facebook, Instagram, LinkedIn, X/t.co, TikTok or YouTube → `social`
  6. Any other referrer → `referral`
  7. Otherwise → `direct`

  Also store `source_detail` (the `utm_source` or the referrer host).
- **Device:** from the user agent → `mobile`, `tablet`, `desktop`; fallback on viewport width (< 768 mobile, < 1024 tablet).
- **Bots:** known bot user agents or `wd = true` → not stored (stored with the test flag when `test = true`).
- **Thank-you requests:** at most one per visit per rule; `path` = the previous page view's path.

---

## 10. Database (I7) — Postgres

The dashboard reads these tables directly in the PoC. Ingest reads only `sites` and `site_config` among the dashboard-owned tables.

| Table | Written by | Read by | Main columns |
| --- | --- | --- | --- |
| `sites` | Dashboard | Ingest, dashboard | id, name, platform (php, wordpress, wix), timezone, allowed_origins[], site_key, site_secret_hash, webhook_token_hash, created_at, org_id (nullable; the owning organisation, null = visible to nobody in the dashboard) |
| `user`, `session`, `account`, `verification`, `twoFactor`, `organization`, `member`, `invitation`, `rateLimit` | Dashboard | Dashboard | Sign-in and tenancy (Better Auth schema, `api/migrations/002_auth.sql`). Tenant = `organization`; `member` (organizationId, userId, role: owner, admin, member) |
| `site_config` | Dashboard | Ingest | site_id, config_version, sections, booking_paths, forms_browser, request_rules, updated_at |
| `site_pages` | Dashboard (scanner) | Dashboard | site_id, path, title, in_sitemap, has_script, contact_links, suggested_sections, scanned_at |
| `salts` | Ingest | Ingest | day, salt |
| `visits` | Ingest | Dashboard | id, site_id, visitor_key, started_at, last_seen_at, landing_path, source_channel, source_detail, utm_campaign, device, test |
| `pageviews` | Ingest | Dashboard | pv, site_id, visit_id, seq, path, title, nav, received_at, load_ms, active_ms, scroll, sections[], has_engage |
| `clicks` | Ingest | Dashboard | id, site_id, visit_id, pv, kind, label, received_at |
| `flow_steps` | Ingest | Dashboard | site_id, visit_id, pv, flow, flow_id, step, name, received_at |
| `requests` | Ingest | Dashboard | id, site_id, visit_id (nullable), pv (nullable), path (nullable), channel, confirmation (server, webhook, browser, thankyou), source, form_id, counts, spam, spam_reason, external_id, received_at |
| `plugin_status` | Ingest | Dashboard | site_id, platform, plugin_version, env (hello body), last_hello_at |
| `gsc_connections` | Dashboard | Dashboard | site_id, property, status, refresh_token_enc, last_sync_at |
| `gsc_daily` | Dashboard | Dashboard | site_id, date, path, query (null = page total), clicks, impressions, position |
| `site_checks` | Dashboard | Dashboard | site_id, check_id, status (pass, fail, pending), reason, checked_at |

**Retention:** visits, pageviews, clicks, flow_steps and requests 14 months; salts 1 day.

---

## 11. Metric definitions (the dashboard computes; everyone uses these words)

- **Visit:** a non-test row in `visits`, counted by `started_at` in the site's timezone. "Visitors" in the product spec = visits in the PoC.
- **Counted request:** a row in `requests` with `spam = false` and `counts = true`.
- **Converting visit:** a visit with at least one counted request linked to it.
- **Unattributed requests:** counted requests with no visit (Wix webhook, tracker blocked). Shown in the site's request total, not in page rates.
- **Rate 1 (site)** = converting visits ÷ visits.
- **Rate 1 (page P)**, by credit mode; the PoC default is landing page:
  - **Landing page:** converting visits that started on P ÷ visits that started on P.
  - **Where it happened:** visits with a counted request sent from P ÷ visits that viewed P.
  - **Every page viewed:** converting visits that viewed P ÷ visits that viewed P.
- **Range:** 95% Wilson interval on every rate.
- **Time on page:** mean `active_ms` over page views with `has_engage`; also show the coverage (share of page views that have engagement data).
- **Scroll depth:** share of engaged page views with `scroll` ≥ 25 / 50 / 75 / 100.
- **Contact clicks:** count by `kind`.
- **Search terms:** `gsc_daily`, joined to page views on the normalised path.

---

## 12. Setup checklist (W4 computes and shows; IDs are fixed)

| Check id | Platforms | Passes when | From |
| --- | --- | --- | --- |
| `script_live` | All | At least 1 non-test page view from an allowed origin in the last 24 h | pageviews |
| `pages_tagged` | All | Every sitemap page has `has_script = true` | site_pages |
| `test_event` | All | At least 1 test event in the last hour (the live-check button) | pageviews |
| `plugin_ok` | WordPress | Hello in the last 24 h and `head_hook_ok` | plugin_status |
| `delay_js_ok` | WordPress | No script-delaying cache plugin, or r1.js excluded from it | plugin_status |
| `form_request` | All | At least 1 non-spam request by the primary method in the last 7 days | requests |
| `wix_webhook` | Wix | At least 1 request with `confirmation = webhook` | requests |
| `buttons_found` | All | At least 1 contact link found by the scanner, or 1 contact click | site_pages, clicks |
| `csp_ok` | All | Homepage sends no CSP, or its CSP allows `collect.<domain>` in `script-src` and `connect-src` | Scanner |
| `gsc_connected` | All | Connection active and property matched | gsc_connections |

---

## 13. Fixtures and contract tests

- **W3 publishes `fixtures/v1/`:** valid and invalid example payloads for each endpoint, plus a seed set of 20 visits with their expected metric results (spam, an unattributed request, a visit with both a form and a booking, mobile and desktop).
- **W2** checks r1.js and plugin output against the payload fixtures.
- **W4** builds against the seed and asserts the expected numbers.
- **W1** verifies that `/v1/_echo` shows the real client IP behind the proxy.

---

## 14. Open decisions

| Decision | Proposed |
| --- | --- |
| Platform domain | To choose |
| Dashboard reads Postgres directly, or a read API from ingest | Directly (faster for the PoC) |
| Salt rotation and reporting day boundary | Salt at 00:00 UTC; reporting days in site timezone |
| Wix custom code category (essential vs analytics) | Ask the data protection specialist |
| Wix primary request method | `browser` primary, `webhook` shadow |
| WordPress connect handoff in the PoC | Build it; keep manual key paste as fallback |
| Cloudflare in front of `collect` | Optional; decide after the first load test |

---

## Changelog

- **1.0** (15 Nov 2026): first proposal.
- **1.1** (15 Nov 2026, proposed): dashboard sign-in and tenancy. §2: `app_rw` owns the auth tables, new app API variables. §10: `sites.org_id`, auth tables. Ingest unaffected (`org_id` is nullable).
- **1.2** (15 Nov 2026, proposed): §8 connect details: `return_url` on the `home_url` origin, existing sites must allow it, cancel answer, exchange rotates the site secret, `invalid_code` error.
