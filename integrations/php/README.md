# Rate 1 for custom PHP sites

Two things connect a hand-built PHP site to Rate 1:

1. **The tag.** Paste it into the shared header include, inside `<head>`, so it is on every page:
   ```html
   <script defer src="https://collect.bazed.live/v1/r1.js" data-site="pk_…"></script>
   ```
2. **Form requests.** Pick one of the two options below.

## Option A: one function call in your form handler

Copy `rate1.php` next to your form handler. It is a single file with no dependencies and needs PHP 7.4+. Then add these lines where your handler has **accepted** the submission (validated, saved or mailed):

```php
require_once __DIR__ . '/rate1.php';
define('RATE1_SITE_SECRET', 'sk_…');   // from the Rate 1 dashboard; or set the RATE1_SITE_SECRET env var
rate1_send_request('contact');         // your name for this form
```

What it does:

- It reads only the two hidden fields that r1.js adds to every form: `r1_pv` (page token) and `r1_path` (page path). If `r1_path` is missing, it uses the path of the HTTP Referer, but only when the Referer is your own site.
- It sends `POST https://collect.bazed.live/v1/r` with `source: "custom"` and your form id.
- It never sends field values, names, emails, phone numbers, the visitor's IP address or user agent.
- **It never slows the visitor down.** The call is made at the end of the request. On PHP-FPM and LiteSpeed that happens after the page has been sent to the visitor. The timeout is 3 seconds.
- **It never breaks your handler.** It never throws and never prints anything, not even a PHP warning. It returns `true` or `false`.

Options (second argument):

| Option | Default | Meaning |
| --- | --- | --- |
| `spam` | `false` | Your own spam verdict, e.g. a honeypot field was filled. Spam is reported but not counted. |
| `spam_reason` | `null` | `honeypot`, `plugin` or `too_fast` (only with `spam`) |
| `channel` | `form` | `form`, `booking` or `calculator` |
| `secret` | `RATE1_SITE_SECRET` | Pass the secret directly instead |
| `defer` | `true` | `false` sends immediately and returns whether the collector accepted it (HTTP 200/202). Useful for testing. |

Example with a honeypot:

```php
$isSpam = !empty($_POST['website']);   // hidden honeypot field
rate1_send_request('contact', ['spam' => $isSpam, 'spam_reason' => $isSpam ? 'honeypot' : null]);
```

Call it **once per accepted submission**. Calling it twice for the same form in the same request reuses the same request id, so the collector stores it once. Failed calls are not retried: there is no background queue on a plain PHP site. If the collector is unreachable, that request is missing from Rate 1.

## Option B: no code changes (thank-you page rule)

If your form redirects to a thank-you page (e.g. `/danke`), you don't need any PHP. In the Rate 1 dashboard, add a **thank-you page rule** for that path. Every visit that reaches the thank-you page counts as one request, credited to the page the visitor came from.

This needs only the tag (step 1). Two limits:

- It counts visits to the thank-you page, so a reload or a direct visit also counts. At most one request is counted per visit and rule.
- Spam can't be told apart.

Option A is more precise when you can edit the handler.

## Tests

```bash
cd contract/mock-collector && PORT=4010 node server.mjs &   # mock collector
php integrations/php/tests/test.php                          # 57 checks
```

The tests cover:

- the §1 path vectors in `contract/v1/path-normalisation.json`
- the payload's exact keys
- that no field values are sent
- the Referer fallback
- that the helper never throws or prints
- the 3 s timeout against a slow collector
- schema validation by the mock collector
- deferred sending at shutdown, over curl and over plain PHP streams (`php -n`)

`wp-plugin/tests/run.sh` also runs them on PHP 7.4.
