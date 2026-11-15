# Test results: WordPress plugin (rate1-connector 0.1.0) and PHP helper

Run on 15 Nov 2026 (Windows 11, Docker Desktop 28, PHP 8.4 locally, Node 25). **Everything passed.**

## How to re-run

```bash
wp-plugin/tests/run.sh                    # everything, about 4 minutes; containers are removed at the end
wp-plugin/tests/run.sh --keep             # keep WordPress running on http://localhost:8088
wp-plugin/tests/run.sh --skip-plugin-check
```

Single parts:

```bash
cd wp-plugin && vendor/bin/phpcs               # after composer install
php wp-plugin/tests/unit/run.php               # plugin unit tests
php integrations/php/tests/test.php            # helper tests (mock collector on :4010 for the network part)
node wp-plugin/tests/integration.mjs           # Docker WordPress + CF7 + mock collector + Plugin Check
php wp-plugin/build.php                        # zip -> wp-plugin/dist/rate1-connector-0.1.0.zip
```

## Summary

| Step | Tool / environment | Result |
| --- | --- | --- |
| Coding standards | phpcs 3 + WPCS 3.1 + PHPCompatibilityWP (testVersion 7.4-) on `rate1-connector/` | clean, 0 errors, 0 warnings (suppressions below) |
| Plugin Check | official `plugin-check` plugin, `wp plugin check --include-experimental --include-low-severity-errors --include-low-severity-warnings` plus runtime checks (`--require=…/cli.php`) | **No errors found**, 0 warnings |
| PHP 7.4 lint | `php:7.4-cli-alpine`, `php -l` on every plugin and helper file | ok |
| Plugin unit tests | plain PHP with minimal WP stubs; PHP 8.4 and PHP 7.4 | 200/200 on both |
| Helper tests | `integrations/php/tests/test.php`; PHP 8.4 and PHP 7.4; mock collector | 57/57 on both |
| Integration | WordPress 7.1.4 (php 8.3-fpm + nginx), MariaDB 11.4, Contact Form 7 6.2.5, mock collector; plugin installed from the built zip | 160/160 |
| Zip | `php wp-plugin/build.php` | `dist/rate1-connector-0.1.0.zip`, 12 files, plugin files only |

## What was tested

### Tag (§3)

All in integration, plus unit tests.

- Anonymous request to `/` and to a post:
  - `<script data-site="pk_…" … defer … src="http://host.docker.internal:4010/v1/r1.js">` is printed inside `<head>`.
  - The src has no `?ver=`.
  - No `Set-Cookie`.
  - The secret is not in the page.
- Logged-in administrator: no tag. Logged-in subscriber: tag.
- With the internal-traffic setting off, the administrator gets the tag.
- With no or an invalid key, no tag is printed.

### Settings

Integration: real HTTP with auth cookies, nonce taken from the page.

- **Page contents.**
  - The page loads for an administrator.
  - The secret field is rendered empty and the secret never appears in the HTML.
  - The page shows "A secret is saved", a disabled "Connect to Rate 1" button and the status table: last hello, queue size, dropped count.
- **Saving.**
  - Saving via `admin-post.php` returns 302 with `rate1_saved=1`.
  - An empty secret field keeps the stored secret.
  - Saving sends a hello, and the page then shows "Settings saved." and "Last hello: OK".
- **Rejected input.**
  - An invalid secret or key is rejected and the stored value is unchanged.
  - A bad nonce gets 403.
  - A subscriber's save is rejected.
- **Options.**
  - On activation the secret and queue options are created with autoload off.
  - The secret stays autoload off after an update.

### Form request (§6)

Real Contact Form 7, submitted through its REST endpoint as the browser would. The submission adds `r1_pv` and `r1_path` the way r1.js would, plus unique field values, a visitor user agent and an `X-Forwarded-For`.

- **One submit gives exactly one `POST /v1/r`**, checked 1.5 s after the first call arrived.
- **The body:**
  - is valid against `server-request.schema.json` according to the mock collector, which enforces `additionalProperties: false`
  - has exactly the ten §6 keys
  - carries `pv`, `path=/back-pain`, `source=cf7`, `form_id=<post id>`, `spam=false` and `spam_reason=null`
  - has `rid` = `cf7:<id>:<uuid4>` and `ts` = server ms
- **Headers:**
  - `Authorization: Bearer sk_…` is accepted (`auth_ok`).
  - The user agent is the plugin's.
- **Nothing leaks:** no field value, the visitor's user agent or the IP appears anywhere in the recorded request.
- **Fallbacks:**
  - An invalid `r1_pv` gives `pv: null`.
  - Without `r1_path`, the path comes from the same-site Referer, normalised to `/Kontakt`.
  - A foreign Referer gives `path: null`.
- **Spam:**
  - CF7's disallowed-words list gives status `spam`, sent with `spam: true, spam_reason: "plugin"`.
  - A simulated honeypot add-on, which logs spam agent `honeypot`, gives `spam_reason: "honeypot"`.
  - A `validation_failed` submission sends nothing.
- **Elementor Pro: not testable live (no licence).** Covered by a unit test with a stubbed `Form_Record` and handler:
  - `form_id` = `get_form_settings('id')`
  - `rid` = `elementor:<id>:<uuid4>`, `spam: false`
  - `pv` and `path` come from `$_POST`
  - field values in the record and in `$_POST` are not sent
  - a hook fired twice in one request gives one payload with the same rid
  - malformed records are ignored
  - with `R1_MOCK_URL` set, the payload is also validated by the mock collector against the real schema
- **WPForms and Gravity Forms:** unit tests with stub arguments.
  - WPForms: `rid` `wpforms:42:<uuid>`.
  - Gravity: `rid` `gravity:3:<entry id>`, and a spam entry gives `spam: true, reason: "plugin"`.
- **Further unit cases:**
  - CF7 statuses `mail_failed`, `aborted` and `acceptance_missing` send nothing.
  - No secret, or an invalid one, means nothing is sent.
  - `form_id` is cut to 100 characters and `rid` stays at most 120.

### Retry queue

Integration with the mock collector's `/_fail` and `wp cron event run`; the logic is also unit-tested.

- **503, 503, then 202:**
  - Each failure is queued, with attempts 1 → 2 and the next attempt about 60 s later.
  - A cron event is scheduled.
  - All 3 attempts carry the same rid and an identical body.
  - The queue then ends up empty and nothing is dropped.
- **503 every time:** 1 attempt plus 3 retries, then the item leaves the queue and the dropped counter goes up by 1.
- **400:** not retried, counted as dropped.
- **Unit tests also cover:**
  - backoff of 60/300/900 s
  - 401 counted as permanent
  - transport errors and 429/408/3xx/5xx retried
  - a queue cap of 200, with overflow counted as dropped
  - at most 20 sends per cron run
  - malformed queue items ignored

### Never slowing the visitor

Integration:

- With the collector delaying 8 s, the CF7 submit took 63 ms against a 64 ms baseline, thanks to `fastcgi_finish_request()`.
- The send timed out after 3 s and was queued. The retry succeeded with the same rid.
- **Hosts without `fastcgi_finish_request`.** This is simulated with the `rate1_connector_finish_request` filter. Nothing is sent during the visitor's request: the payload is queued as due now, `spawn_cron()` runs and the WP-Cron loopback request delivers it.

### Hello (§8)

Integration:

- **Activation.**
  - With no secret, no hello is sent and the stored result is `no_secret`.
  - With a secret, activation sends a hello that is valid against `plugin-hello.schema.json`, with `auth_ok` and `head_hook_ok: true`.
- **Settings save** sends a hello. The daily cron hook `rate1_connector_hello` is scheduled on activation and its run sends a hello.
- **Fields checked:** `v`, `platform`, `plugin_version`, `wp_version`, `php_version`, `home_url` and `theme`. `forms` contains `{cf7, <id>, "Contact"}`, `cache` and `consent` are empty, and the body contains no secret.
- **Tag removed from the page** gives `head_hook_ok: false, head_hook_error: "tag_missing"`.
- **WP Rocket stub** (defines `WP_ROCKET_VERSION` and `get_rocket_option('delay_js') = 1`) gives `{wp-rocket, delay_js: true, r1_excluded: true}`. All three WP Rocket filters return the r1.js needle.
- **Borlabs Cookie stub** gives `{borlabs-cookie, r1_category: "unknown"}`.
- **Real Autoptimize 3.1.17** gives `{autoptimize, delay_js: false, r1_excluded: true}`.
  - With JS aggregation on, Autoptimize really aggregates CF7's scripts while the r1.js tag stays untouched.
  - In "defer, don't aggregate" mode the tag keeps a single `defer`.
- **Real LiteSpeed Cache 7.9.3** gives `{litespeed-cache, delay_js: true, r1_excluded: true}`. LiteSpeed's page optimisation needs a LiteSpeed server, so nginx passes `X-LSCACHE=on` in the test.
  - In delay mode it really delays CF7's scripts (`type="litespeed/javascript"`) while r1.js is untouched.
  - **Negative control:** with our filters removed, LiteSpeed rewrites r1.js to `type="litespeed/javascript" data-src=…`, and the hello reports `r1_excluded: false`.
  - In combine-plus-delay mode, including external JS, r1.js stays its own untouched tag. Without the exclusion, LiteSpeed tries to download and inline it.

### Path normaliser (§1)

All 24 cases in `contract/v1/path-normalisation.json` pass, in the plugin (`Rate1_Connector_Path::normalise`) and in the helper (`rate1_normalise_path`), on PHP 8.4 and 7.4.

Extra unit cases:

- UTF-8-safe cut at 512 characters
- `r1_path` checks: kept as-is (no second decode), invalid UTF-8 and control characters handled, no leading "/" rejected
- Referer: same host, `www.` variant, foreign host and relative path

### Uninstall

Integration:

- An item was waiting in the queue, and cron events were scheduled by hand after deactivation.
- `wp plugin uninstall` then left no `rate1_connector_*` options, no `rate1_connector_*` cron events and no plugin files, and the tag was gone.

### PHP helper

- **Payload:**
  - exactly the §6 keys
  - `rid` `custom:<form>:<uuid4>`, stable for the same form within one request
  - `channel`, `spam` and `spam_reason` options handled
  - no field values
  - Referer fallback only for the same host
- **Never throws, never prints, even with `display_errors=1`:** an invalid secret, arrays passed as arguments and an unreachable collector all return `false`.
- **Against the mock collector:**
  - a valid call gets 202
  - the Bearer secret is accepted
  - the helper's own user agent is used
  - a 503 returns `false`
  - a collector delaying 6 s makes it give up after 3 s
  - deferred mode sends at shutdown of a separate PHP process, both over curl and over plain PHP streams (`php -n`)

## phpcs / Plugin Check suppressions (all justified inline)

- **`WordPress.Security.NonceVerification.Missing` on `$_POST['r1_pv']` and `$_POST['r1_path']`.**
  - These are read-only reads inside the form plugin's own submit handler, which does its own nonce and spam checks.
  - The values are validated strictly and never stored or echoed.
- **`ValidatedSanitizedInput.InputNotSanitized` on `r1_path`.** `sanitize_text_field()` would strip `%xx` sequences that belong to a normalised path. The value is validated by `Rate1_Connector_Path::clean_field()` instead.
- **`NonceVerification.Recommended` on the settings page's `rate1_saved` / `rate1_errors`.** These are display-only flags set by our own nonce-checked redirect.
- **`EnqueuedResourceParameters.MissingVersion`.** The version is `null` on purpose: the contract tag has no `?ver=`, and the collector versions r1.js itself.
- **`SlowDBQuery.slow_db_query_meta_query`.** This is the Elementor form scan, which runs only for the hello and is capped at 100 documents.
- **`PrefixAllGlobals.DynamicHooknameFound` / `NonPrefixedHooknameFound`.** These are third-party filters (WP Rocket, LiteSpeed, Autoptimize, core `https_local_ssl_verify`) read to verify our exclusion.

## Not tested, and why

- **Elementor Pro live:** no licence, so only the stubbed unit test. Its hook signature and `get_form_settings('id')` come from Elementor Pro's documented API and could not be checked against source.
- **WPForms and Gravity Forms live:** unit tests with stub arguments only.
  - Gravity Forms is commercial.
  - A WPForms Lite submit needs its JavaScript anti-spam token, so it was not automated.
- **WP Rocket live:** commercial. Detection and the filter wiring were tested with a stub. WP Rocket's own HTML rewriting was not run. The filter names and matching rules were verified in WP Rocket's source on GitHub (see README).
- **Perfmatters, FlyingPress, SiteGround Optimizer:** report only. Perfmatters detection is unit-tested; the other two are not tested.
- **Real consent plugins:** detection by folder, tested with a Borlabs Cookie stub only.
- **A real LiteSpeed web server:** the `litespeed_finish_request()` branch was not run. LiteSpeed Cache was tested on nginx with `X-LSCACHE=on`.
- **Apache with mod_php:** the "no finish function" path was exercised on FPM by forcing it with the `rate1_connector_finish_request` filter.
- **Multisite:** the uninstall loop over sites was not run; only a single site was tested.
- **Sites with `DISABLE_WP_CRON`:** not tested. There the queue waits for the real cron.
- **The plugin inside WordPress on PHP 7.4:** the Docker WordPress runs PHP 8.3. On PHP 7.4 only lint and the unit tests ran.
- **Real r1.js in a browser:** r1.js is built in parallel (tracker/). The integration test posts `r1_pv` and `r1_path` exactly as r1.js adds them; there is no browser end-to-end test here.
- **The §8 connect handoff:** not built. The Connect button is a disabled placeholder.
