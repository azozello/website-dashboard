# Contract artifacts (v1)

Machine-checkable companions to `specs/Data-Contract-v1.md`.

| Path | What |
| --- | --- |
| `v1/event-envelope.schema.json` | `POST /v1/e` envelope + 5 event types (strict: what r1.js may send) |
| `v1/server-request.schema.json` | `POST /v1/r` (strict: no extra keys, so leaked form fields fail) |
| `v1/wix-webhook.schema.json` | `POST /v1/w/{token}`: only `form`, `submission_id` |
| `v1/plugin-hello.schema.json` | `POST /v1/plugin/hello` |
| `v1/site-config.schema.json` | `GET /v1/config/{site_key}` response |
| `v1/path-normalisation.json` | Shared §1 test vectors (r1.js, ingest, WP plugin, PHP helper, Search Console import) |
| `mock-collector/` | Node mock collector validating every payload against these schemas (used by tracker e2e and plugin tests) |

The schemas are strict on the **sender** side. Receivers stay lenient as §1 says (unknown fields ignored, strings truncated).

## Proposed contract edits

Decisions taken while building that the contract doesn't spell out. Each is implemented as written here; please confirm or change.

| # | Section | Proposed text |
| --- | --- | --- |
| 1 | §1 path | "Remove **all** trailing slashes except for `/`. If any `%` escape is malformed or the decoded bytes aren't valid UTF-8, keep the path undecoded. Normalise **once, at the source** (r1.js, plugin Referer fallback, Search Console import); receivers don't normalise again, because the rule isn't idempotent (`/100%25` → `/100%`)." |
| 2 | §4 `active_ms` | "The start of a page view counts as an interaction." (Without it, a reader who never touches the page gets 0 s.) |
| 3 | §4 `sections` | "Each name ≤ 60 characters." |
| 4 | §4 `final` | "`final: false` on `visibilitychange→hidden`; `final: true` on `pagehide` and route change. After a final engage, nothing more for that `pv` unless the page is restored from the back/forward cache (same `pv` continues)." |
| 5 | §5 `spa` | "`auto` (default) or `off` (no in-page route detection)." |
| 6 | §5/§10 `request_rules` | Shape: `[{"method": "server"\|"webhook"\|"browser"\|"thankyou", "form": "<form name>", "source"?, "form_id"? (server), "path"? (thankyou), "counts"?: true}]`. Without a matching rule, `server` and `webhook` requests count; `browser` and `thankyou` need a rule. |
| 7 | §10 `site_config` | Add column `spa` (served in §5, missing from §10). |
| 8 | §10 `requests` | `source` = `wix` for webhooks, NULL for browser/thank-you; `external_id` = `rid` / `submission_id` / `pv:eid` / `ty:<visit>:<rule>`. |
| 9 | §3 consent | "Hidden form fields are added even before consent." (They hold only the random `pv` of a page view that is sent anyway.) |
| 10 | §2 limits | "Rate limits may be enforced by ingest instead of the proxy." (single VM, stock Caddy has no rate limiter) |
| 11 | §7 webhook | Accept a numeric `form`/`submission_id` and store it as text. |
| 12 | §9 visits | "Test and non-test events never share a visit." |
| 13 | §8 hello | Optional `head_hook_error`: `no_site_key`, `request_failed`, `http_<code>`, `tag_missing`. Formats: `wp_version` full (e.g. `7.1.4`), `php_version` major.minor, `theme` = active stylesheet slug, `cache[].plugin` / `consent[].plugin` = plugin folder slugs (so `delay_js_ok` can rely on them). |
| 14 | §6 retries | "3 retries after the first attempt (4 in total), backoff 1 / 5 / 15 min, same `rid` and body, `ts` = submission time. Transport errors, 3xx, 408, 429, 5xx are retried; other 4xx are permanent. Background retries apply to WordPress only; the PHP helper makes one attempt." |
| 15 | §6 `path` | "Referer fallback only when the Referer is the site's own host (`www.`-insensitive); otherwise null." |
| 16 | §6 spam | "Elementor Pro and WPForms reject spam before their hooks fire, so they always report `spam: false`. CF7 reports `honeypot` only when a honeypot add-on logs that agent. Nothing reports `too_fast` yet." |
| 17 | §6 CF7 | **Product question:** CF7 `mail_failed` (accepted, but the email failed) is not sent today, per "mail sent". Should it count? |
| 18 | §3 / §12 tag | WordPress prints extra attributes (`id`, `data-wp-strategy`) in its own order; the `has_script` scanner should match `src` + `data-site`, not the exact string. |
