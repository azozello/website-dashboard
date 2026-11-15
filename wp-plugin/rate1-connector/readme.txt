=== Rate 1 Connector ===
Contributors: rate1
Tags: analytics, conversion rate, contact form 7, elementor, privacy
Requires at least: 6.3
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Connects your site to Rate 1: adds the tracking tag and reports form submissions, without field values, IP addresses or cookies.

== Description ==

Rate 1 shows which pages turn visitors into enquiries. This plugin connects a WordPress site to Rate 1:

* **Tracking tag.** Adds the Rate 1 script (r1.js) to the head of every front-end page. By default it is not loaded for logged-in users who can edit posts, so your own visits are not counted.
* **Form submissions.** When Contact Form 7, Elementor Pro Forms, WPForms or Gravity Forms accepts a submission, the plugin tells Rate 1 that a request happened: which form, on which page, and whether the form plugin judged it spam. It never reads or sends the values visitors type into the form.
* **Caching plugins.** Keeps r1.js out of "Delay JavaScript", deferral, minification and combining in WP Rocket, LiteSpeed Cache and Autoptimize.
* **Status report.** Tells Rate 1 which form, caching and consent plugins are active and whether the tag is present on your homepage, so the Rate 1 setup checklist can tell you what to fix.

No cookies, no local storage, no IP addresses, no user agents, no form field values.

== External services ==

This plugin connects to the Rate 1 collector at `https://collect.bazed.live`, operated by Rate 1. It is needed to measure your site's conversion rates in your Rate 1 dashboard.

* **Tracking script.** Every front-end page loads `https://collect.bazed.live/v1/r1.js` in the visitor's browser. The script reports page views, engagement (active time, scroll depth, sections seen) and clicks on call, WhatsApp, email and booking buttons. It sets no cookies and uses no device storage. The collector sees the visitor's IP address and user agent as part of the HTTP request; it uses them only to compute a daily-changing pseudonymous visitor key and never stores them.
* **Form requests.** When a supported form plugin accepts a submission, your server sends `POST https://collect.bazed.live/v1/r` with: the form plugin, the form id, the page path, a random page token, the spam verdict, a timestamp and a random request id. No field values, names, email addresses, phone numbers, IP addresses or user agents are sent.
* **Status report ("hello").** On activation, when you save the settings and once a day, your server sends `POST https://collect.bazed.live/v1/plugin/hello` with: plugin, WordPress and PHP versions, your site address, the active theme, whether the tag was found on your homepage, the names and ids of your forms, and which caching and consent plugins are active.

Server-to-server requests are authenticated with your site secret. Nothing is sent until you enter a site key (tag) or site secret (form requests and status report).

Terms of service and privacy policy: to be published before the first public release (PoC build).

== Installation ==

1. Upload the plugin and activate it.
2. Go to Settings → Rate 1.
3. Paste the site key (`pk_…`) and site secret (`sk_…`) from your Rate 1 dashboard and click "Save and check connection".

If you use a page cache, clear it after saving so the tag appears on cached pages.

== Frequently Asked Questions ==

= Which form plugins are supported? =

Contact Form 7 and Elementor Pro Forms. WPForms and Gravity Forms are supported as well.

= Are form contents sent to Rate 1? =

No. The plugin reads only two hidden fields added by r1.js (a random page token and the page path) and the form id. Field values are never read or sent.

= Does it slow down form submissions? =

No. The request to Rate 1 is sent after the visitor's response has been delivered, with a 3 second timeout. If it fails, it is retried in the background (WP-Cron) up to 3 times.

= What happens to spam? =

Submissions that the form plugin marks as spam are reported with a spam flag and are not counted as requests. Contact Form 7 and Gravity Forms expose their spam verdicts. Elementor Pro and WPForms reject spam before a submission is recorded, so the plugin never sees it.

== Changelog ==

= 0.1.0 =
* First release: tracking tag, Contact Form 7, Elementor Pro, WPForms and Gravity Forms requests with retry queue, caching plugin exclusions, status report.
