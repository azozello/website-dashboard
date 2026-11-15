# rate1-connector (WordPress plugin)

Part of W2 in `specs/Data-Contract-v1.md`. The plugin:

- prints the r1.js tag in `<head>` (§3),
- reports accepted form submissions to `POST /v1/r` (§6),
- sends the hello to `POST /v1/plugin/hello` (§8).

| | |
| --- | --- |
| Slug / text domain | `rate1-connector` |
| Version | 0.1.0 |
| Requires | WordPress 6.3+ (script `strategy`), PHP 7.4+ |
| Tested with | WordPress 7.1.4, PHP 8.3 (FPM), Contact Form 7 6.2.5, Autoptimize 3.1.17, LiteSpeed Cache 7.9.3 |
| Collector | `RATE1_CONNECTOR_COLLECT_URL`, default `https://collect.bazed.live`. Override it in `wp-config.php` only for tests. |

## Layout

```
wp-plugin/
  rate1-connector/            the shipped plugin (only this goes into the zip)
    rate1-connector.php       header, constants, bootstrap
    includes/                 one class per concern (see "What each part does")
    uninstall.php
    readme.txt                wordpress.org readme, incl. "External services"
  build.php                   builds dist/rate1-connector-<version>.zip
  composer.json, phpcs.xml.dist   dev only: phpcs (WPCS 3 + PHPCompatibilityWP)
  tests/
    run.sh                    runs everything (see "Tests")
    integration.mjs           Docker WordPress + CF7 + mock collector + Plugin Check
    docker-compose.yml, nginx.conf
    mu-plugins/rate1-test-env.php   test-only helpers (mail stub, simulated honeypot, toggles)
    fixtures/plugins/         WP Rocket and Borlabs Cookie stubs (detection only)
    unit/                     plain-PHP unit tests with minimal WP stubs
```

## Dev setup

```bash
cd wp-plugin
composer install            # phpcs + WordPress Coding Standards + PHPCompatibilityWP
vendor/bin/phpcs            # must be clean
php build.php               # -> dist/rate1-connector-0.1.0.zip (dist/ is gitignored)
```

The build checks that the `Version` header, `RATE1_CONNECTOR_VERSION` and the readme's `Stable tag` match. It zips only `rate1-connector/`, so no dev files go in.

## Tests

One command from the repo root:

```bash
wp-plugin/tests/run.sh                 # everything, about 3–4 minutes
wp-plugin/tests/run.sh --keep          # leave WordPress running on http://localhost:8088
wp-plugin/tests/run.sh --skip-plugin-check
```

The runner needs bash, PHP with zip, Composer, Node 18+ and Docker, and uses ports 8088 and 4010. It runs these steps:

1. Starts `contract/mock-collector` on :4010, unless it is already running.
2. Runs phpcs.
3. Runs the unit tests on the local PHP (`php wp-plugin/tests/unit/run.php`).
4. Runs the `integrations/php` helper tests.
5. Repeats lint, the unit tests and the helper tests on PHP 7.4 in `php:7.4-cli-alpine`.
6. Runs `node wp-plugin/tests/integration.mjs`. It wipes and starts the Docker stack (MariaDB, nginx, `wordpress:php8.3-fpm-alpine`, `wordpress:cli-php8.3`), installs WordPress and Contact Form 7, installs the built zip, runs all integration tests, runs the official Plugin Check (`wp plugin check --include-experimental` plus runtime checks), then runs `docker compose down -v`.

Results are written to `tests/integration-results.json` and `tests/plugin-check-output.txt`. Both are regenerated on every run.

**Docker networking.** nginx and php-fpm share one network namespace (`network_mode: service:web`), and nginx listens on 8088 inside the container too. So `WP_HOME=http://localhost:8088` works from the browser and from PHP inside the container. That matters for the homepage check and for WP-Cron loopbacks. The mock collector on the host is reached at `http://host.docker.internal:4010`.

**LiteSpeed Cache in the test.** LiteSpeed Cache optimises pages only when it thinks it runs on a LiteSpeed server, so `nginx.conf` passes `X-LSCACHE=on`. The test then checks three things:

- Delay mode delays the CF7 scripts but not r1.js.
- With our filters removed (negative control), LiteSpeed rewrites r1.js to `type="litespeed/javascript"`. That means it would only run after the visitor interacts with the page.
- In combine mode, including external JS, r1.js stays its own tag. Without the exclusion, LiteSpeed would try to download r1.js and inline it into its bundle.

## What each part does

| Class | Hooks | Behaviour |
| --- | --- | --- |
| `Rate1_Connector_Tag` | `wp_enqueue_scripts`, `script_loader_tag` | Enqueues `…/v1/r1.js` (handle `rate1-r1`, version `null` so there is no `?ver=`, `strategy: defer`, in head). Adds `data-site="pk_…"` to that tag. Skipped when there is no valid key, or for logged-in users with `edit_posts` while "internal traffic" is on (the default). |
| `Rate1_Connector_Forms` | `wpcf7_submit` | CF7 (signature `($contact_form, $result)`, checked in CF7 6.2.5 `includes/contact-form.php`). Sends on `mail_sent` (spam=false) and `spam` (spam=true). The reason is `honeypot` if CF7's spam log has an agent containing "honeypot", else `plugin`. `validation_failed`, `acceptance_missing`, `aborted` and `mail_failed` are not sent. |
| | `elementor_pro/forms/new_record` | `($record, $handler)`. `form_id` = `$record->get_form_settings('id')`, the form element id. Always spam=false: Elementor rejects honeypot and reCAPTCHA failures before this hook, so it exposes no spam verdict afterwards. |
| | `wpforms_process_complete` | `($fields, $entry, $form_data, $entry_id)`. `form_id` = `$form_data['id']`. spam=false: WPForms stops before this hook for spam. |
| | `gform_after_submission` | `($entry, $form)`. `rid` = `gravity:<form>:<entry id>`. `$entry['status'] === 'spam'` gives spam=true, reason `plugin`. |
| | | Reads only `$_POST['r1_pv']` (must match `^[0-9A-Za-z]{16}$`, else null) and `$_POST['r1_path']` (must start with "/" and be valid UTF-8; control characters are removed and it is cut to 512). It falls back to the HTTP Referer path, normalised per §1, but only if the Referer is this site. `rid` = `<source>:<form_id>:<uuid4>`, issued once per form per request. No secret means nothing is sent. |
| `Rate1_Connector_Sender` | `shutdown` (`PHP_INT_MAX-10`), cron `rate1_connector_process_queue` | Payloads are collected during the request. At shutdown it calls `fastcgi_finish_request()` / `litespeed_finish_request()`, then `wp_remote_post(…/v1/r)` with a 3 s timeout and `Authorization: Bearer sk_…`. 200 and 202 count as success. Transport errors, 3xx, 408, 429 and 5xx are retried. Other 4xx are permanent and counted as dropped. Without a finish function nothing is sent during the visitor's request: the payload is queued as due now, a single cron event is scheduled and `spawn_cron()` is called. Queue: option `rate1_connector_queue` (autoload off), items `{payload, attempts, next_at}`, retries after 60 s / 300 s / 900 s with the same body and rid, then dropped and counted (`rate1_connector_dropped`). At most 200 items, 20 sends per cron run. Filter `rate1_connector_finish_request` (bool) turns off the early finish. Nothing about payload contents is logged. |
| `Rate1_Connector_Hello` | `activated_plugin`, settings save, daily cron `rate1_connector_hello` | Builds the §8 body. `head_hook_ok` comes from a server-side GET of `home_url('/')` with no cookies, looking for a `<script>` tag with `/v1/r1.js` and `data-site="<key>"`. Optional extra field `head_hook_error`: `no_site_key`, `request_failed`, `http_<code>` or `tag_missing`. The outcome is stored in `rate1_connector_last_hello`. |
| `Rate1_Connector_Compat` | see next section | Cache plugin exclusions; the `cache` and `consent` arrays of the hello. |
| `Rate1_Connector_Admin` | `admin_menu`, `admin_post_rate1_connector_save` | Settings → Rate 1 has key, secret (password field, always rendered empty; empty input keeps the stored secret; "remove" checkbox), the internal-traffic switch and a disabled "Connect to Rate 1" button (placeholder for the §8 handoff). The status table shows last hello, homepage tag check, last `/v1/r` status, queue size, dropped count and collector. Saving goes through `admin-post.php` with a nonce and `manage_options`, and sends a hello. |
| `uninstall.php` | | Deletes every `rate1_connector_*` option and clears both cron hooks, on every site of a multisite network. |

Options: `rate1_connector_site_key` (autoload), `rate1_connector_site_secret` (autoload off, created on activation, never printed), `rate1_connector_exclude_editors`, `rate1_connector_queue` (autoload off), `rate1_connector_dropped`, `rate1_connector_last_hello`, `rate1_connector_last_send`.

## Cache plugin filters

All of these were checked against current source code; the links point to it. r1.js is matched by its host and path, e.g. `collect.bazed.live/v1/r1.js`. That string works both as a substring and as a regex, because the unescaped dots match themselves.

| Plugin | Filter (what it excludes from) | How it matches | Source |
| --- | --- | --- | --- |
| WP Rocket | `rocket_delay_js_exclusions` (Delay JavaScript execution) | regex `#…#i` against the whole `<script>` tag | [DelayJS/HTML.php#L119](https://github.com/wp-media/wp-rocket/blob/c470f2f/inc/Engine/Optimization/DelayJS/HTML.php#L119) |
| | `rocket_exclude_defer_js` (Load JavaScript deferred, also excludes from combine) | regex against the src | [DeferJS/DeferJS.php#L209](https://github.com/wp-media/wp-rocket/blob/c470f2f/inc/Engine/Optimization/DeferJS/DeferJS.php#L209) |
| | `rocket_minify_excluded_external_js` (minify + combine of external JS) | `strpos` (minify) / regex (combine) on the full URL | [Minify/JS/AbstractJSOptimization.php#L185](https://github.com/wp-media/wp-rocket/blob/c470f2f/inc/Engine/Optimization/Minify/JS/AbstractJSOptimization.php#L185) |
| LiteSpeed Cache | `litespeed_optm_js_defer_exc` (JS defer **and** delay, `optm-js_defer` 1 or 2) | substring on src | [optimize.cls.php#L109](https://github.com/litespeedtech/lscache_wp/blob/6a85a59/src/optimize.cls.php#L109), [API docs](https://docs.litespeedtech.com/lscache/lscwp/api/#litespeed_optm_js_defer_exc) |
| | `litespeed_optm_gm_js_exc` (same, in Guest Mode) | substring | [optimize.cls.php#L100](https://github.com/litespeedtech/lscache_wp/blob/6a85a59/src/optimize.cls.php#L100) |
| | `litespeed_optimize_js_excludes` (minify / combine) | substring | [optimize.cls.php#L849](https://github.com/litespeedtech/lscache_wp/blob/6a85a59/src/optimize.cls.php#L849) |
| Autoptimize | `autoptimize_filter_js_exclude` (aggregation; comma-separated string or `[needle => attr]` array, both handled) | `strpos` on the tag | [autoptimizeScripts.php#L298](https://plugins.trac.wordpress.org/browser/autoptimize/trunk/classes/autoptimizeScripts.php#L298) |

Notes:

- **Not used: `rocket_exclude_js`.** It matches only the URL path of local files, so it can't target an external script.
- **Autoptimize** never aggregates external scripts, and in "defer, don't aggregate" mode it skips tags that already have `defer`. Its exclusion is there as a safeguard, and free Autoptimize has no delay feature.
- **WP Rocket's "Load JS deferred"** skips tags that already have `defer`. Its "Delay JS" does not, so `rocket_delay_js_exclusions` is the filter that matters.
- **LiteSpeed reads its exclusions on `init` (priority 5).** The plugin therefore registers its filters at load time.
- **How the hello fills `delay_js`:**
  - WP Rocket: `get_rocket_option('delay_js')`.
  - LiteSpeed: `apply_filters('litespeed_conf', 'optm-js_defer') === 2`.
  - Autoptimize: `false`, since it has no delay feature.
- **How the hello fills `r1_excluded`:** it is `true` only if the plugin's own filters return the r1.js needle when applied, so a third party that removed our callback would show up as `false`.
- **Report only (`r1_excluded: false`):**
  - Perfmatters (`perfmatters`; `delay_js` from `perfmatters_options['assets']['delay_js']` if set, else null; not verified, closed source).
  - FlyingPress (`flying-press`; null).
  - SiteGround Optimizer (`sg-cachepress`; false, it has no delay feature).
  - Perfmatters documents `perfmatters_delay_js_exclusions` ([docs](https://perfmatters.io/docs/filters/)), so adding it later is a one-liner.
- **Consent plugins** are detected by active plugin folder: `borlabs-cookie`, `complianz-gdpr(-premium)`, `real-cookie-banner(-pro)`, `cookie-law-info` (CookieYes). Each is reported with `r1_category: "unknown"`.

## Privacy

- **What is sent:** only the §6 fields.
- **What is not sent:** the visitor's IP address, user agent, cookies or any form field value. Server requests carry the plugin's own user agent, `Rate1Connector/<version>; WordPress/<version>`.
- **Browser side:** no cookies and no device storage.
- **Integration tests:** they post unique field values, a fake `X-Forwarded-For` and a visitor user agent, then assert that none of them reaches the collector.
