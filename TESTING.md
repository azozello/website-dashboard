# Testing

Run on Windows 11, Node 25.2, PHP 8.4, Docker 28, Chromium (Playwright 1.65.1 headless shell 159), 15 Nov 2026.

| Part | Command | Result |
| --- | --- | --- |
| r1.js size | `cd tracker && npm run build` | **3,876 B gzipped** (7,817 B minified), budget 5,120 B |
| r1.js unit | `cd tracker && npm test` | **75 / 75 passed** |
| r1.js browser | `cd tracker && npm run test:e2e` | **9 / 9 passed** |
| Ingest | `cd ingest && npm test` | **106 / 106 passed** (incl. 30 fixture checks) |
| Real chain | `cd ingest && docker compose -f docker-compose.test.yml up -d && npm run test:e2e` | **4 / 4 passed** (+2 WordPress, see below) |
| Deploy | `cd deploy && docker compose --env-file .env.example build` + smoke | images build, smoke passed |
| WordPress plugin | `wp-plugin/tests/run.sh` | phpcs clean, Plugin Check no errors, 200 + 57 unit, 160 / 160 integration |

Typecheck (`npm run typecheck`) is clean in `tracker/` and `ingest/`.

## r1.js

**Unit (vitest + jsdom, fake timers).** Every envelope captured in every test is validated against `contract/v1/event-envelope.schema.json`.

| Area | Covered |
| --- | --- |
| Path normalisation | all 24 shared vectors in `contract/v1/path-normalisation.json`, 512-char cap |
| Click rules | `tel:` (any case, nested targets), `mailto:`, `wa.me`, `api.whatsapp.com`, `whatsapp:`, booking path (normalised, sub-paths, www-insensitive, not other hosts, not `/bookings` for `/booking`), `data-r1-cta`, link scheme beats wrapper, label from text/`aria-label`, 60-char cap |
| Active time | 30 s idle window, interactions extend it, hidden time excluded, starts-hidden case, reset |
| Page view | all §4 fields; referrer host only (query with "secret" never sent); same-site/empty referrer → null; utm/clid |
| Batching / transport | 1 s debounce; 30 clicks → envelopes of 1/25/5; `sendBeacon` refused/throwing/missing → `fetch` keepalive/no-cors/omit; config fetched once per page load |
| Single-page navigation | push/replace/pop; same normalised path ignored; final engage then `nav: spa` with new `pv`, `ref`/`load_ms` null, late title picked up; scroll/sections/active time reset; old route's sections not credited to the new view; `spa: "off"` |
| Engage | hidden → `final: false`, pagehide → `final: true`, no resend without change, resend after return, pagehide-before-hidden keeps final last, bfcache restore resumes the same `pv` |
| Scroll / sections | max scroll; not read from the unsettled first layout; 40 % of element or viewport; config selectors scoped by path; broken selector ignored; max 20 names, 60 chars |
| Hidden fields | added to initial and late forms (once), updated on route change and right before submit |
| Consent | only page views until `consent(true)`; `consent(false)` stops again |
| API / forms_browser | `step` validation, `formOk`, success element after submit → `form_ok` once; gives up after 15 s |
| Debug | `test: true`, CORS fetch, panel shows `pv`, events, `← 204` |
| Robustness / privacy | invalid key → no init; throwing beacon/fetch, bad selectors and bad API calls never throw; zero console calls; no cookies or Web Storage |

**Browser (Playwright, Chromium).** Test site on `localhost:4021`, mock collector on `127.0.0.1:4020` (a different site) validating every payload against the schemas. Each test also asserts: all payloads valid, `Content-Type: text/plain`, correct `Origin`, no storage/cookie/IndexedDB access (instrumented), no page errors, no console output, no requests to hosts other than the site and the collector.

1. Bundle has no storage/cookie/console APIs, < 5 KB gzipped.
2. Classic site: page view with utm/clid/title/vw/`load_ms`, query values not leaked; call/email/WhatsApp/booking clicks; sections and scroll 100 %; final engage delivered on real navigation (`sendBeacon` in `pagehide`); steps on the next page.
3. Real form submit carries `r1_pv` = the page view's `pv` and `r1_path`.
4. Hidden tab → `final: false`; activity after return → second engage with more active time.
5. **Wix-like single-page site** (client router, async render, late title, forms recreated per route): 4 page views (`load` + 3 `spa` incl. back button), titles right, `prices` section only on its route, dynamic form tagged with the current `pv`, success message → `form_ok`, config fetched once.
6. Debug mode panel with `← 204`.
7. `data-consent="required"`.
8. Config endpoint returning 500 → defaults, still tracking.
9. Collector returning 503 → page and form keep working, nothing thrown.

## Ingest

**106 tests** (`ingest/test/`), in-process Postgres (PGlite) through the same `Db` interface as production.

- Units: shared path vectors, ids, §9 source channel (18 cases), device, bots, client IP behind trusted proxies (incl. IPv6, CF header), validation errors name the field, truncation, referrer host-only, webhook key stripping.
- Fixtures: every `fixtures/v1/` payload checked against the strict schema and the ingest validator (valid accepted; invalid rejected with the expected field; sender violations caught by the schema while ingest drops the extra keys).
- HTTP + DB: `/healthz`; `r1.js` cache headers; config CORS/cache, `request_rules` not exposed; page view → visit with source/device; origin check incl. Referer fallback; `400 {"field"}`, `413`; bots and `wd` dropped unless `test`; test visits separate; 30-min visit gap; UTC salt change starts a new visit and deletes the old salt; first page view wins; engage merge (max/union) and stubs; click and step dedupe; `form_ok` only with a rule; thank-you rule once per visit credited to the previous page; **IP, UA and secret never stored**; 120/min rate limit; `/v1/r` auth, 202/200 duplicate, pv linking (also late), spam and rule `counts`; webhook stores only `form`/`submission_id` and dedupes; hello stored; `/v1/_echo` only with `ENV=test`.

**Real chain (4 tests):** Chromium → test site → r1.js served by ingest → ingest over HTTP → **Postgres 16** (Docker).

- Classic site: one visit (campaign/newsletter, desktop), 3 page views in `seq`, engagement on all, scroll 100 %, sections, 3 clicks, 2 steps, a plugin-style `/v1/r` (202, then 200 duplicate) linked to the visit, a thank-you request credited to the previous page.
- Wix-like site: 3 page views in one visit with correct titles/sections, `browser` request from the success message (primary), Wix webhook with an extra `email` key stored as a shadow (`counts = false`) without the email.
- Debug mode against the real collector: CORS status shown, visit flagged `test`.
- Hello stored; config served from the database.

Finding along the way: Chromium sends unload-time beacons with the browser's built-in user agent, not a per-context override, so headless test browsers are (correctly) dropped as bots. The test sets the UA at browser launch.

## Deploy

- `docker compose config` valid; `caddy validate` → "Valid configuration".
- Both images build (`rate1/ingest` 262 MB, `rate1/caddy` 92 MB with the dashboard build).
- Smoke via Compose (Postgres 16 + ingest image): migrations applied, `/healthz` 200, `/v1/r1.js` served with `max-age=3600`, `create-site` CLI works, `/v1/_echo` through the published port reports the forwarded client IP.
- Not run locally: Caddy with host networking and real certificates (needs the VM and DNS).

## WordPress plugin and PHP helper

Full detail, including every phpcs suppression and its reason: [wp-plugin/TESTING-results.md](wp-plugin/TESTING-results.md). One command runs everything (about 4 minutes): `wp-plugin/tests/run.sh`.

| Step | Environment | Result |
| --- | --- | --- |
| Coding standards | phpcs + WPCS 3.1 + PHPCompatibilityWP (7.4-) | clean |
| Plugin Check | official `plugin-check`, experimental + low-severity + runtime checks | **No errors found**, 0 warnings |
| PHP 7.4 | `php:7.4-cli-alpine`: lint, unit and helper tests | ok |
| Plugin unit tests | PHP 8.4 and 7.4, WP stubs | **200 / 200** on both |
| PHP helper tests | PHP 8.4 and 7.4, mock collector | **57 / 57** on both |
| Integration | WordPress 7.1.4 (php 8.3-fpm + nginx), MariaDB 11.4, Contact Form 7 6.2.5, mock collector, plugin installed from the zip | **160 / 160** |
| WordPress → real ingest | Chromium → WordPress 7.1.4 + CF7 + plugin (from the zip) → real r1.js and `/v1/r` → ingest → Postgres 16 (`WP_E2E=1 npm run test:e2e` in `ingest/`) | **2 / 2 passed** |

What the integration run proves:

- **Tag:** in `<head>` with `defer`, no `?ver=`, right `data-site`; not for logged-in admins (setting on), yes for subscribers and with the setting off; never the secret in the HTML.
- **One CF7 submit = exactly one `/v1/r`**, valid against the strict schema, with `pv` and `path`, `rid = cf7:<id>:<uuid4>`; no field value, visitor UA or IP reaches the collector. Invalid `r1_pv` → `null`; missing `r1_path` → same-site Referer path; foreign Referer → `null`.
- **Spam:** CF7 disallowed words → `spam: true, spam_reason: "plugin"`; a honeypot add-on → `"honeypot"`; validation failures send nothing.
- **Retry queue:** 503, 503, 202 → same rid and body every time, queue empty after; 4 × 503 → dropped and counted; 400 not retried.
- **Never slows the visitor:** collector delaying 8 s → submit answered in 63 ms (baseline 64 ms); without `fastcgi_finish_request` the call is queued and delivered by WP-Cron.
- **Hello:** on activation (with a secret), settings save and the daily cron; valid against the schema; `head_hook_ok: true`, `tag_missing` when the tag is removed; CF7 form listed; WP Rocket and Borlabs stubs detected; real Autoptimize 3.1.17 and LiteSpeed Cache 7.9.3 leave r1.js untouched while optimising other scripts (negative control: without our filters LiteSpeed delays r1.js).
- **Settings:** secret field always empty, autoload off, empty field keeps it, bad nonce 403, subscribers can't save.
- **Uninstall:** no `rate1_connector_*` options, cron events or files left.
- **Elementor Pro:** no licence, so **only a unit test with a stubbed `Form_Record`** (form id from `get_form_settings('id')`, field values never sent, double-fired hook → one payload). WPForms and Gravity Forms: unit tests with stub arguments only.

**WordPress → real ingest** (`ingest/test/e2e/wordpress.e2e.ts`, run after `wp-plugin/tests/run.sh --keep`): the plugin's daily hello reaches ingest and is stored with `head_hook_ok: true` and the CF7 form; a real Chromium visitor opens a CF7 page, the plugin-printed tag loads r1.js from ingest, the page view is stored and its `pv` is in the form's `r1_pv`; the visitor fills and sends the form; exactly one `server` request is stored, linked to that page view's visit, with `path` `/kontakt-e2e` and `rid` `cf7:<id>:<uuid>`; the name, email and message appear nowhere in the database. (The browser reaches the collector via `--host-resolver-rules` because the Windows firewall drops host → LAN-IP traffic; containers use `host.docker.internal`.)

Not tested: Elementor Pro / WPForms / Gravity Forms live, WP Rocket's own rewriting (stub only), real consent plugins (stub), a LiteSpeed web server's `litespeed_finish_request`, Apache mod_php (forced via filter instead), multisite uninstall, `DISABLE_WP_CRON`, WordPress itself on PHP 7.4.
