# Cloudflare Web Analytics: metrics, dimensions and features (as of November 2026)

Scope: Cloudflare Web Analytics (also called RUM, for Real User Monitoring) is free and cookieless. These notes compare it with Rate 1. Status is as of 2026-11-16. The latest Web Analytics changelog entry is dated 2026-10-13.

Source shorthand used below (full URLs inline):
- DOCS-HLM = https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/
- DOCS-DIM = https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/
- DOCS-CWV = https://developers.cloudflare.com/web-analytics/data-metrics/core-web-vitals/
- DOCS-PLT = https://developers.cloudflare.com/web-analytics/data-metrics/page-load-time-summary/
- DOCS-FAQ = https://developers.cloudflare.com/web-analytics/faq/
- DOCS-LIM = https://developers.cloudflare.com/web-analytics/limits/
- CHANGELOG = https://developers.cloudflare.com/changelog/product/web-analytics/

---

## Q1. Two collection modes: JS beacon vs edge (zone) analytics

### Takeaway
"Web Analytics" is the JS beacon (RUM) product. It works on any site, and its data collection is the same whether you install it manually (non-proxied) or Cloudflare injects it automatically (proxied). Only the reporting endpoint differs. Edge "zone analytics" is a separate product for proxied sites, built from server logs. It can't be blocked by ad blockers but has no Web Vitals. On Free it shows only requests, bandwidth, unique visitors and countries; Pro and above get page views, visits and roughly 20 filters.

### Cited Findings
**JS beacon (Web Analytics / RUM)**
- Works "without changing your DNS or using Cloudflare's proxy". It needs only a Cloudflare account and a JS snippet. It collects data with the browser Performance API. — [About](https://developers.cloudflare.com/web-analytics/about/)
- **Manual setup** (any site, including DNS-only or non-Cloudflare sites): you paste the snippet before `</body>`. Only pages that render the snippet are measured. Beacons go to `cloudflareinsights.com/cdn-cgi/rum`. — [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/); [Get started](https://developers.cloudflare.com/web-analytics/get-started/)
- **Automatic setup** (proxied sites only): Cloudflare injects the script on every page and subdomain of the zone unless Rules limit it. Beacons go to the site's own `/<domain>/cdn-cgi/rum`. — [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/)
- Automatic injection fails if the origin sends `Cache-Control: public, no-transform`, and it needs valid HTML. — [Get started](https://developers.cloudflare.com/web-analytics/get-started/); [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/)
- The script loads from `static.cloudflareinsights.com/beacon.min.js`. Timing comes from Navigation Timing L2, with L1 `performance.timing` as fallback. Core Web Vitals are sent when the page is first hidden after load. — [Data origin and collection](https://developers.cloudflare.com/web-analytics/data-metrics/data-origin-and-collection/)
- The docs say Web Analytics is "designed primarily for customers who do not use Cloudflare's proxy". Proxied customers already get edge analytics on the Analytics tab. — [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/)
- RUM measures only the initial client request, not Worker subrequests. — [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/)

**Edge / server-side zone analytics (proxied sites only)**
- The edge option collects data "at Cloudflare's edge servers via a DNS change". It is described as accurate because it reads server logs, needs no code and adds no client download. Site-speed data is beacon-only. — [cloudflare.com/web-analytics](https://www.cloudflare.com/web-analytics/)
- Edge analytics "can't be blocked" by ad blockers, because every request is measured. — [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/)
- **Free plan** zone analytics: requests, bandwidth, **unique visitors**, and requests by country (map plus top 5). Counts include crawlers and threats. — [Zone analytics](https://developers.cloudflare.com/analytics/account-and-zone-analytics/zone-analytics/)
- **Pro, Business and Enterprise** HTTP Traffic analytics, from edge logs: requests, data transfer, API requests, **page views** (HTML 2xx responses) and **visits** (referer ≠ hostname). Filters cover cache status, data center, source ASN, country, device type, IP, referer host, host, method, HTTP version, path, **query string**, content type, edge and origin status, security action and source, browser, OS, user agent and X-Requested-With. Enterprise Bot Management adds JA3/JA4. — [Zone analytics](https://developers.cloudflare.com/analytics/account-and-zone-analytics/zone-analytics/)
- Pro, Business and Enterprise is "the only route to a URL-level breakdown from server-side data". — [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/)
- Zone analytics also has a Security tab (threats, top threat countries, top crawlers/bots, SSL share) and a Performance tab (Argo origin response time add-on, HTTP version, bandwidth saved, content types). Every plan can view at least 30 days. — [Zone analytics](https://developers.cloudflare.com/analytics/account-and-zone-analytics/zone-analytics/)
- The marketing page lists these metrics across both modes: top pages, views, top referrers, top hostnames, top URLs, countries, **status codes** (edge), and site speed (beacon only). — [cloudflare.com/web-analytics](https://www.cloudflare.com/web-analytics/)

### Inferences
- For the comparison, treat "Cloudflare Web Analytics" as the beacon product. Edge analytics only exists if the site runs on Cloudflare's proxy, which most WordPress, Wix and PHP small-business sites don't. Wix sites can't be proxied in the usual way.
- The beacon gets performance data and Web Vitals but loses visitors who use ad blockers. Edge analytics counts every request but includes bots in the Free view, and Free shows no page or referrer breakdown.

### Gaps
- Zone analytics docs list "unique visitors" on Free without defining it. It is commonly understood to be IP-based, but I found no current official definition.
- I found no official list of the longer zone-analytics time ranges per plan. The docs say only "at least 30 days".

---

## Q2. Metrics and dimensions (complete list)

### Takeaway
The beacon product reports three traffic measures: visits (referrer-based, no uniques), page views and page load time. On top of those it has a deep performance layer: a timing waterfall, Core Web Vitals with element-level Debug View, and LCP/INP sub-parts added Oct 2026. It has 10 filterable dimensions, including bot exclusion and the navigation type added in 2026. It doesn't count unique visitors, sessions, bounce rate, time on page, UTM or events.

### Cited Findings
**A. Traffic metrics (beacon)**

| Official name | One-line definition | Source |
|---|---|---|
| Visits | "A page view that originated from a different website or direct link". The visit is referrer-based (HTTP referer ≠ site hostname). One visit can include several page views. | [DOCS-HLM](https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/) |
| Page views | "A successful HTTP response with a content-type of HTML". SPA route changes also count (see SPA below). | [DOCS-HLM](https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/) |
| Page load time | "The total amount of time required to load the page." | [DOCS-HLM](https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/) |
| Core Web Vitals | Google's user-experience metrics (see C). | [DOCS-HLM](https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/) |
| (No unique visitors) | Cloudflare chose not to count unique IPs, "which would require storing state about what each visitor does". Visits are counted from distinct referral or navigation events instead. | [Launch blog Dec 2020](https://blog.cloudflare.com/privacy-first-web-analytics/); [RUM Diaries blog](https://blog.cloudflare.com/the-rum-diaries-enabling-web-analytics-by-default) |

**B. Page load time summary (timing waterfall)**

| Official name | Definition | Source |
|---|---|---|
| Page load | Total load time. It isn't the sum of the stages below, because it includes untracked gaps such as pre-DNS time. | [DOCS-PLT](https://developers.cloudflare.com/web-analytics/data-metrics/page-load-time-summary/) |
| DNS | `domainLookupEnd − domainLookupStart` | [DOCS-PLT](https://developers.cloudflare.com/web-analytics/data-metrics/page-load-time-summary/) |
| TCP | `connectEnd − connectStart`, including TLS | [DOCS-PLT](https://developers.cloudflare.com/web-analytics/data-metrics/page-load-time-summary/) |
| Request | `responseStart − requestStart` (time to first byte of response) | [DOCS-PLT](https://developers.cloudflare.com/web-analytics/data-metrics/page-load-time-summary/) |
| Response | `responseEnd − responseStart` (download time) | [DOCS-PLT](https://developers.cloudflare.com/web-analytics/data-metrics/page-load-time-summary/) |
| Processing | `domComplete − domInteractive` (render, including blocking resources) | [DOCS-PLT](https://developers.cloudflare.com/web-analytics/data-metrics/page-load-time-summary/) |
| Load Event | `loadEventEnd − loadEventStart` | [DOCS-PLT](https://developers.cloudflare.com/web-analytics/data-metrics/page-load-time-summary/) |
| First Paint | Navigation until the first pixels render | [DOCS-PLT](https://developers.cloudflare.com/web-analytics/data-metrics/page-load-time-summary/) |
| First Contentful Paint | Navigation until the first DOM content renders | [DOCS-PLT](https://developers.cloudflare.com/web-analytics/data-metrics/page-load-time-summary/) |
| Connection time split (new 2026-10-13) | `connectionTimeWithoutTLS` and `tlsTime` (TLS handshake). The combined `connectionTime` field is kept. | [CHANGELOG](https://developers.cloudflare.com/changelog/product/web-analytics/) |
| Resource load times / resource attribution tables | Show which assets take the most time. Uses Resource Timing. | [RUM Diaries blog](https://blog.cloudflare.com/the-rum-diaries-enabling-web-analytics-by-default) |

**C. Core Web Vitals (RUM Web Vitals report)**

| Official name | Definition | Source |
|---|---|---|
| Largest Contentful Paint (LCP) | Main-content load time, in ms. Rated Good / Needs Improvement / Poor on Google's thresholds. | [DOCS-CWV](https://developers.cloudflare.com/web-analytics/data-metrics/core-web-vitals/) |
| Interaction to Next Paint (INP) | Responsiveness to clicks, taps and keys, in ms | [DOCS-CWV](https://developers.cloudflare.com/web-analytics/data-metrics/core-web-vitals/) |
| Cumulative Layout Shift (CLS) | Unexpected layout shift, unitless. **Chromium-only** (Firefox and Safari lack the Layout Instability API). | [DOCS-CWV](https://developers.cloudflare.com/web-analytics/data-metrics/core-web-vitals/) |
| LCP sub-parts (new 2026-10-13) | TTFB, resource load delay, resource load duration, element render delay | [DOCS-CWV](https://developers.cloudflare.com/web-analytics/data-metrics/core-web-vitals/); [CHANGELOG](https://developers.cloudflare.com/changelog/product/web-analytics/) |
| INP sub-parts (new 2026-10-13) | Input delay, processing duration, presentation delay. Shown as P25–P999 percentiles in microseconds; a negative value means unavailable. | [CHANGELOG](https://developers.cloudflare.com/changelog/product/web-analytics/) |
| Debug View (element-level debugging) | For each metric, the top 5 worst elements by CSS selector (usable in `document.querySelector()`), at P75. Expanding a row shows P50, P90 and P99. LCP shows source URL and size in bytes. CLS shows "Current"/"Previous" layout of the largest shifted element. | [DOCS-CWV](https://developers.cloudflare.com/web-analytics/data-metrics/core-web-vitals/) |
| CWV filters | URL, browser, OS, country, element, and more | [DOCS-CWV](https://developers.cloudflare.com/web-analytics/data-metrics/core-web-vitals/) |
| (Deprecated) FID | No longer documented. The current CWV page lists only LCP, INP and CLS. The 2026 docs don't mention FID. | [DOCS-CWV](https://developers.cloudflare.com/web-analytics/data-metrics/core-web-vitals/) |

**D. Dimensions / filters (beacon dashboard)**

| Official name | Definition | Source |
|---|---|---|
| Country | Visitor's country | [DOCS-DIM](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/) |
| Host | Domain of the page URL | [DOCS-DIM](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/) |
| Path | Page path within the site (top pages) | [DOCS-DIM](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/) |
| Referer | External referring link. The dashboard shows the **referer host**; **referer path** is available only via GraphQL. | [DOCS-DIM](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/) |
| Device type | Desktop, mobile or tablet | [DOCS-DIM](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/) |
| Browser | For example Chrome or Safari | [DOCS-DIM](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/) |
| Operating system | Visitor OS | [DOCS-DIM](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/) |
| Site | Site/domain for account-level segmentation (zone or gray-clouded site) | [DOCS-DIM](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/) |
| Exclude Bots | When set to "Yes", removes bot traffic so the data is "a closer representation of real user traffic" | [DOCS-DIM](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/) |
| Navigation type (new 2026-04-30) | How the HTML document loaded. Values: Navigate, Navigate Cache, Navigate Prefetch Cache, Prerender, Reload, Reload Cache, Back-forward, Back-forward Cache, Restore, Soft Navigation, Routing APIs. Matchers: equals, does not equal, in, not in. Listed under the Page views tab. | [DOCS-DIM](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/); [CHANGELOG](https://developers.cloudflare.com/changelog/product/web-analytics/) |
| Element (CWV only) | CSS selector of the element hurting a vital | [DOCS-CWV](https://developers.cloudflare.com/web-analytics/data-metrics/core-web-vitals/) |

**E. Data sent per page view (independent technical review, 2020)**
- The beacon sends visit and page-view data, browser and OS names, referrer, country, navigation type and detailed Performance API asset timings. A per-load UUIDv4 `pageloadId` joins the two submissions (load and unload) and isn't stored persistently. — [ctrl.blog review, Dec 2020](https://www.ctrl.blog/entry/review-cloudflare-analytics/)

### Inferences
- Rate 1 can claim that Cloudflare has **no unique visitors, sessions, bounce rate, visit duration, entry/exit pages, UTM/campaigns, goals, events or form leads**. Its traffic layer is visits, page views, top paths, referrer hosts, country, device, browser and OS.
- Cloudflare's real strength is web performance (RUM, CWV and element debugging). That is a different job from marketing or lead analytics.
- Because visits are referrer-based, a reload or a referrer-less internal navigation can be miscounted. The 2026 soft-navigation change also moved pageview and visit volumes (see Q4).

### Gaps
- I found no official numeric list of the dashboard's breakdown panels or tab names beyond "Page views" (sidebar) and the "Debug View". The exact tab set (for example Visits / Page views / Performance / Core Web Vitals) isn't confirmed from a primary source.
- I couldn't retrieve an official GraphQL field reference for the RUM datasets (see Q4).

---

## Q3. Filters, date ranges, retention, sampling, unique visitors

### Takeaway
You can access 6 months of data. Raw beacon data is kept unsampled for only 7 days and then down-sampled to about 10%. Dashboard and API queries are adaptively sampled between 0.0001% and 100%. The default view is the last 24 hours, with a dropdown and click-drag zoom. There are no unique-visitor counts.

### Cited Findings
- Data access: "previous six months". — [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/)
- Unsampled beacon data is kept 7 days, then aggregated to about 10% of original volume for long-term storage. — [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/)
- Dashboard and API queries sample dynamically from 0.0001% to 100% depending on filters and row volume. The GraphQL `sampleInterval` field shows the rate used. Low-traffic sites are sampled at higher percentages. Ingestion itself doesn't sample: every received beacon is recorded. — [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/)
- Adaptive Bit Rate (ABR) chooses the resolution of each chart from data size, date range and other factors. — [About](https://developers.cloudflare.com/web-analytics/about/)
- RUM is "progressively sampled, so some requests are never captured". This is one reason RUM and traffic analytics differ. — [Observatory FAQ](https://developers.cloudflare.com/speed/observatory/faq/)
- Filters: **Add filter**, then criteria from the Dimensions list, then **Apply**. The default range is the previous 24 hours. A dropdown changes the range, and click-drag on the graph zooms to a custom period. Breakdowns (for example top visits by country or device type) sit below the graph. — [Filters](https://developers.cloudflare.com/web-analytics/configuration-options/filters/)
- At launch the dashboard had global filters plus "zoom" and "group by" actions, and you could switch between page views and visits. — [Launch blog](https://blog.cloudflare.com/privacy-first-web-analytics/)
- Navigation Type filter operators: equals, does not equal, in, not in. — [CHANGELOG](https://developers.cloudflare.com/changelog/product/web-analytics/)
- **Historical:** in Dec 2020 the dashboard showed only the "last seven days" (independent review). The archived 2021 Plausible comparison also claimed a 7-day and one-site limit. Both are superseded by the current 6 months and 10+ sites. — [ctrl.blog](https://www.ctrl.blog/entry/review-cloudflare-analytics/); [Plausible archived 2021](https://webcf.waybackmachine.org/web/20210423134521/https://plausible.io/vs-cloudflare-web-analytics)
- Unique visitors: the beacon product doesn't count them (see Q2A). Free-plan edge zone analytics shows "unique visitors" (undefined in docs). — [Zone analytics](https://developers.cloudflare.com/analytics/account-and-zone-analytics/zone-analytics/)

### Inferences
- Any period older than 7 days is shown from roughly 10% sampled data. A low-traffic small-business site could see estimated, rounded numbers on monthly or 6-month views. Rate 1 can contrast this with exact counts and longer retention, if it offers them.
- There's no documented comparison-to-previous-period feature.

### Gaps
- I found no documented list of preset date-range options (for example 30 min, 6 h, 7 d or 30 d) in current docs.
- I found no documentation of a period-over-period comparison feature.

---

## Q4. Features (events, UTM, API, exports, alerts, team, site limits, SPA, integrations, 2024–2026 changes)

### Takeaway
There are no custom events, goals, conversions, funnels, UTM/campaign reports, alerts or documented exports as of Nov 2026; the FAQ still says events and UTM are "not supported yet". The features it does have are a free GraphQL API (4 RUM datasets), up to 10 non-proxied sites (soft limit) and unlimited proxied sites, an account-wide view of up to 1,000 sites, path Rules (paid plans), an EU-visitor exclusion toggle, SPA soft-navigation tracking, one-click Pages and WordPress.com setup, and GTM loading.

### Cited Findings
**Features present**

| Feature (official name) | Description | Source |
|---|---|---|
| Add a site / Manage site | Add a hostname, then copy the snippet (manual) or pick a proxied zone (automatic). Edit the hostname and settings under Manage site. | [Get started](https://developers.cloudflare.com/web-analytics/get-started/) |
| Automatic setup options | Enable; **Enable, excluding visitor data in the EU** (snippet not injected for EU visitors); Enable with JS Snippet installation (manual); Disable | [Get started](https://developers.cloudflare.com/web-analytics/get-started/) |
| EU exclusion | "Drop all metrics collected by our EU data centers". Changelog entry dated Feb 26, 2024; the URL slug says 2025-02-25, so the date is uncertain. | [Changelog post](https://developers.cloudflare.com/changelog/post/2025-02-25-rum-exclude-eu/) |
| Rules | Include or exclude hostnames and paths (Manage site > Advanced options > Add rule). Proxied sites only. Limits: Free 0, Pro 5, Business 20, Enterprise 100. Configuration Rules (`disable_rum`) override them. | [Rules](https://developers.cloudflare.com/web-analytics/configuration-options/rules/); [DOCS-LIM](https://developers.cloudflare.com/web-analytics/limits/); [Config rules settings](https://developers.cloudflare.com/rules/configuration-rules/settings/) |
| Multiple sites | Non-proxied: **10 sites** (a "soft limit", raisable via support). Proxied: **no limit**. | [DOCS-LIM](https://developers.cloudflare.com/web-analytics/limits/); [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/) |
| Account-wide (all sites) view | Aggregate view of up to **1,000 sites** at once. Reliability improved 2026-07-14; above 1,000 you must filter. Introduced 2021 as "View Web Analytics for all sites" with site-tag filtering. | [DOCS-LIM](https://developers.cloudflare.com/web-analytics/limits/); [CHANGELOG](https://developers.cloudflare.com/changelog/product/web-analytics/); [2021 blog](https://blog.cloudflare.com/enhancing-privacy-focused-web-analytics-to-better-meet-your-metrics-needs/) |
| Snippet reuse | One snippet per page. A snippet can be shared across subdomains of one apex domain but not across domains. | [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/) |
| SPA support | Added 2021 by overriding History `pushState` and listening for `popstate`; hash routers weren't supported at launch. The previous route is reported on each route change, and the last one on tab hide via `sendBeacon`. | [2021 blog](https://blog.cloudflare.com/enhancing-privacy-focused-web-analytics-to-better-meet-your-metrics-needs/); [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/) |
| Soft navigation measurement (changed 2026) | Uses Chrome's Soft Navigation API, which measures LCP on SPA navigations. New `navigationType` values: `soft-navigation` and `routing-apis` (fallback for Safari, Firefox and older Chromium, with no LCP); before, everything was `navigate`. Rollout finished 2026-09-04. **Pageview and visit volumes may change.** | [Changelog 2026-08-21](https://developers.cloudflare.com/changelog/post/2026-08-21-improved-soft-navigation-measurement-for-single-page-applications/) |
| GraphQL Analytics API | RUM datasets: `rumPageloadEventsAdaptiveGroups`, `rumPerformanceEventsAdaptiveGroups`, `rumWebVitalsEventsAdaptiveGroups`, `rumWebVitalsEventsAdaptive` (raw). Referer path and sub-part percentiles are exposed. `sampleInterval` shows sampling. | [DLS GraphQL datasets](https://developers.cloudflare.com/data-localization/metadata-boundary/graphql-datasets/); [DOCS-DIM](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/); [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/) |
| GraphQL dimensions (community example) | `rumPageloadEventsAdaptiveGroups` grouped by `date`, `countryName`, `requestHost`, `requestPath`, `refererHost`, `deviceType` with `count`. This is from a community gist, not an official reference, and the gist now returns 404. | [Gist (search snippet)](https://gist.github.com/altescape/f9209768e15ec25b0489517ef67b32b8) |
| Site management API | Site configs via API (`auto_install`, `enabled:false`, delete via `site_info` endpoint) | [RUM Diaries blog](https://blog.cloudflare.com/the-rum-diaries-enabling-web-analytics-by-default) |
| Enabled by default (Free zones) | From **2025-10-15**, Web Analytics is on by default for all free proxied domains, excluding EU visitors by default. Pro and above must opt in. | [RUM Diaries blog](https://blog.cloudflare.com/the-rum-diaries-enabling-web-analytics-by-default) |
| Pages one-click | Pages project > Metrics > Enable. The snippet is added on next deploy. | [Get started](https://developers.cloudflare.com/web-analytics/get-started/) |
| Tag managers (GTM) | Load the script with the `beacon.min.js?token=` form | [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/) |
| CSP / SRI support | Allow the beacon in `script-src`; `connect-src` is `'self'` (auto) or `cloudflareinsights.com` (manual). Auto-injection adds `integrity`; manual can't use SRI because the script isn't version-pinned. | [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/) |
| Observatory integration | Enabling RUM from an Observatory speed test creates a Web Analytics config. Observatory combines RUM with synthetic tests and replaced the 2019 Speed Tab; it went GA in 2023. | [Observatory FAQ](https://developers.cloudflare.com/speed/observatory/faq/); [Observatory GA blog](https://blog.cloudflare.com/cloudflare-observatory-generally-available) |
| WordPress | No official Web Analytics toggle found in Cloudflare's own WP plugin. WordPress.com has an "Add to Cloudflare" toggle that auto-adds the JS. Third-party WP plugins exist: "Helper for Cloudflare Web Analytics" inserts the snippet; "Easy Analytics with Cloudflare RUM" and "FlareStats" are read-only dashboards. | [WordPress.com and Cloudflare](https://developers.cloudflare.com/support/third-party-software/content-management-system-cms/wordpress.com-and-cloudflare/); [Easy Analytics plugin](https://wordpress.org/plugins/web-analytics-with-cloudflare/); [FlareStats readme](https://cdn.jsdelivr.net/wp/flarestats/trunk/readme.txt); [Helper plugin readme](https://cdn.jsdelivr.net/wp/plugins/helper-for-cloudflare-web-analytics/trunk/readme.txt) |

**Features absent (official)**
- **Custom events**: "Not supported yet. Support may be added later." — [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/)
- **UTM parameters**: not supported, because query strings aren't logged. — [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/)
- **Alerts / real-time**: listed as future work in 2021. The 2025 RUM Diaries post called alerting and "actionable insights" future work, with a "comprehensive platform targeted for mid-2026". No such launch appears in the changelog up to 2026-10-13. — [2021 blog](https://blog.cloudflare.com/enhancing-privacy-focused-web-analytics-to-better-meet-your-metrics-needs/); [RUM Diaries](https://blog.cloudflare.com/the-rum-diaries-enabling-web-analytics-by-default); [CHANGELOG](https://developers.cloudflare.com/changelog/product/web-analytics/)
- **Custom integrations** posting to `/cdn-cgi/rum` aren't supported. It returns 405 for non-POST requests since 2026-05-13. — [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/); [CHANGELOG](https://developers.cloudflare.com/changelog/product/web-analytics/)

**Changelog 2024–2026 (complete per changelog page)**
- 2024-02-26 (slug says 2025-02-25): EU visitor exclusion toggle.
- 2025-10-15: enabled by default on Free zones ([RUM Diaries](https://blog.cloudflare.com/the-rum-diaries-enabling-web-analytics-by-default)).
- 2026-04-30: Navigation Type dimension and filter.
- 2026-05-13: `/cdn-cgi/rum` returns 405 for non-POST.
- 2026-07-14: account-wide dashboard reliability; 1,000-site aggregate cap.
- 2026-08-21 (done 2026-09-04): soft-navigation measurement; pageview and visit counts shifted.
- 2026-10-13: LCP and INP sub-parts, TLS time split.
— [CHANGELOG](https://developers.cloudflare.com/changelog/product/web-analytics/)

### Inferences
- Goals, conversions, funnels and form-lead tracking aren't available in Web Analytics. The adjacent Cloudflare product for event tracking is **Zaraz**, a server-side tag manager. It has its own GraphQL datasets (`zarazTrackAdaptiveGroups` etc., available in US and EU) but only forwards events to third-party tools; it is not a reporting UI for goals. — [DLS GraphQL datasets](https://developers.cloudflare.com/data-localization/metadata-boundary/graphql-datasets/)
- Team access presumably follows standard Cloudflare account membership and roles, since Web Analytics lives at the account level. It has no Web Analytics-specific sharing, public dashboards or client reports.
- There's no Search Console integration and no lead or form tracking. Those are clear Rate 1 differentiators.

### Gaps
- I found no official complete field reference for the RUM GraphQL datasets. The schema is discoverable only via introspection, and the community gist is gone.
- I found no documentation of CSV or other dashboard export. The GraphQL API appears to be the only export path, but this isn't confirmed.
- I didn't confirm whether Cloudflare's official WordPress plugin can enable Web Analytics.
- I found no Web Analytics-specific documentation for team roles, public or shared dashboards, or email reports.

---

## Q5. Privacy

### Takeaway
Cloudflare doesn't use cookies, localStorage or fingerprinting, and it strips IPs at the edge before data reaches core. It doesn't log query strings. But RUM data is **US-only**: the RUM GraphQL datasets aren't available under the Data Localization Suite's EU Customer Metadata Boundary. Cloudflare is a US company, and GDPR is handled mainly by an "exclude EU visitors" toggle rather than by EU hosting.

### Cited Findings
- "We don't use any client-side state (like cookies or localStorage) for analytics purposes." Cloudflare doesn't track users over time by IP, User Agent or fingerprinting. — [RUM Diaries](https://blog.cloudflare.com/the-rum-diaries-enabling-web-analytics-by-default); [Launch blog](https://blog.cloudflare.com/privacy-first-web-analytics/)
- The beacon "doesn't use cookies or `localStorage`" and "doesn't fingerprint users by IP address, User Agent, or other data". — [DOCS-CWV](https://developers.cloudflare.com/web-analytics/data-metrics/core-web-vitals/)
- "Cloudflare Web Analytics does not collect or use your visitors' personal data." — [About](https://developers.cloudflare.com/web-analytics/about/)
- Edge pre-processing "removes personal information like IP addresses" before data goes to a core data center. — [RUM Diaries](https://blog.cloudflare.com/the-rum-diaries-enabling-web-analytics-by-default)
- Query strings aren't logged, to avoid collecting sensitive data. — [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/)
- Cloudflare doesn't monetize visitor data through ad tracking or buyer profiles. — [cloudflare.com/web-analytics](https://www.cloudflare.com/web-analytics/)
- Cloudflare doesn't track individual users across customers' properties. — [Data origin](https://developers.cloudflare.com/web-analytics/data-metrics/data-origin-and-collection/)
- **Data location:** under the Data Localization Suite Customer Metadata Boundary, RUM datasets are "US only". If the boundary is set to EU, "queries for these fields will return empty results". — [DLS GraphQL datasets](https://developers.cloudflare.com/data-localization/metadata-boundary/graphql-datasets/)
- **GDPR posture:** the EU-exclusion toggle exists "to comply with GDPR and CCPA". It drops metrics from EU data centers. The default-on rollout excludes EU visitors by default. — [Changelog EU exclusion](https://developers.cloudflare.com/changelog/post/2025-02-25-rum-exclude-eu/); [RUM Diaries](https://blog.cloudflare.com/the-rum-diaries-enabling-web-analytics-by-default)
- **Historical criticism (2020):** the beacon set a `__cfduid` identifier cookie, which Cloudflare planned to deprecate by mid-2021. The privacy policy said Cloudflare "_may_ log the IP addresses of end users". — [ctrl.blog](https://www.ctrl.blog/entry/review-cloudflare-analytics/)
- Competitor criticism: closed source, so the script can't be verified; US company under US jurisdiction. — [Plausible vs Cloudflare](https://plausible.io/vs-cloudflare-web-analytics) (competitor source, biased)

### Inferences
- Cloudflare's own default of excluding EU visitors suggests it doesn't consider RUM data processing a clean fit for EU users without that toggle. With EU exclusion on, an EU small business would lose most of its own visitors' data. This is a strong angle for an EU-hosted Rate 1.
- "Cookieless" holds as of 2026. The `__cfduid` issue is historical.

### Gaps
- I didn't retrieve the current Cloudflare privacy policy or DPA text specific to Web Analytics data, such as retention of IPs in edge logs or sub-processors.
- I found no official statement of the physical storage region for RUM data beyond the "US only" metadata-boundary classification.

---

## Q6. Pricing

### Takeaway
Web Analytics is free on every Cloudflare plan with no traffic cap. Paid zone plans add rule slots (Pro 5, Business 20, Enterprise 100) and much richer edge HTTP analytics (page views, visits, path, query string and many filters) for proxied sites. The free tier's only hard limits are 10 non-proxied sites (soft), 6-month access and sampling.

### Cited Findings
- Free, with "no limits based on traffic volume"; it serves sites from about 1 to 1 billion requests per day. — [Launch blog](https://blog.cloudflare.com/privacy-first-web-analytics/)
- The marketing page lists no paid analytics tiers. The edge proxy option includes caching and unmetered DDoS "with any plan you choose". — [cloudflare.com/web-analytics](https://www.cloudflare.com/web-analytics/)
- Site limits: 10 non-proxied, unlimited proxied. Rule limits: Free 0, Pro 5, Business 20, Enterprise 100. — [DOCS-LIM](https://developers.cloudflare.com/web-analytics/limits/)
- Pro, Business and Enterprise get advanced HTTP traffic analytics from edge logs, including URL-level server-side data. — [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/); [Zone analytics](https://developers.cloudflare.com/analytics/account-and-zone-analytics/zone-analytics/)
- Enterprise users can use Logpush to export logs to their own tools. — [Zone analytics](https://developers.cloudflare.com/analytics/account-and-zone-analytics/zone-analytics/)

### Inferences
- For a non-proxied WordPress, Wix or PHP site, the effective price is €0 for beacon analytics. Paying for a Cloudflare plan doesn't add marketing analytics features (events, UTM, goals) to Web Analytics.

### Gaps
- I didn't verify current 2026 USD prices for the Pro and Business zone plans, Observatory test quotas per plan, or Zaraz pricing.

---

## Q7. Limitations and criticisms

### Takeaway
It's a minimal traffic counter attached to a strong free performance (RUM/CWV) tool. It has no events, goals, UTM, funnels, uniques or sessions, and no alerts. It keeps 6 months of data, sampled after 7 days, with US-only data. The beacon can be blocked by ad blockers. Most published criticism comes from competitors.

### Cited Findings
- Ad blockers, including Adblock Plus, Brave and DuckDuckGo, can block the beacon. — [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/); [Observatory FAQ](https://developers.cloudflare.com/speed/observatory/faq/)
- IE11 sends no beacons. Older browsers fall back to XHR, so the last SPA payload can be lost on close. — [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/)
- No custom events, no UTM, 6-month window, 7-day unsampled then ~10%. — [DOCS-FAQ](https://developers.cloudflare.com/web-analytics/faq/)
- CLS is Chromium-only. LCP isn't collected on Safari/Firefox soft navigations (`routing-apis`). — [DOCS-CWV](https://developers.cloudflare.com/web-analytics/data-metrics/core-web-vitals/); [Changelog 2026-08-21](https://developers.cloudflare.com/changelog/post/2026-08-21-improved-soft-navigation-measurement-for-single-page-applications/)
- Methodology changes in 2026 altered pageview and visit volumes, so historical trend lines aren't comparable. — [Changelog 2026-08-21](https://developers.cloudflare.com/changelog/post/2026-08-21-improved-soft-navigation-measurement-for-single-page-applications/)
- Plausible (a competitor) says the product is "thin" beyond page views, visits, referrers, countries and devices, with no live visitors, bounce rate, visit duration, campaigns or goals. It also calls some totals estimates, says it is closed source and US-jurisdiction, and says the headline numbers won't match Plausible's. — [Plausible vs Cloudflare](https://plausible.io/vs-cloudflare-web-analytics)
- Swetrix (a competitor) says it "relies heavily on data sampling. For historical reports, it might only count 1 out of 10 visitors". It also says you can't track custom events, live visitors, UTM or funnels. — [Swetrix comparison](https://swetrix.com/comparison/cloudflare-analytics/vs-plausible) (via search snippet)
- An independent 2020 review (6/10) found a server-side bug that "misidentifies almost all page views as visits to `/`". It also noted that reloads re-count visits, `beforeunload` breaks bfcache, and there are no source maps. The beacon was 4.31 KB compressed versus GA's 19.01 KB. — [ctrl.blog](https://www.ctrl.blog/entry/review-cloudflare-analytics/) (dated; bugs may be fixed)
- Old claims of "7 days only, 1 site" (Plausible 2021) are obsolete. — [Plausible archived 2021](https://webcf.waybackmachine.org/web/20210423134521/https://plausible.io/vs-cloudflare-web-analytics)
- The free-plan edge view includes bots and crawlers. — [Zone analytics](https://developers.cloudflare.com/analytics/account-and-zone-analytics/zone-analytics/)

### Inferences
- Positioning for Rate 1: Cloudflare matches it on "cookieless + free" and beats it on Web Vitals depth. Rate 1 can differentiate on EU hosting and EU data, exact or longer retention, form-lead tracking, goals and events, UTM, unique-visitor estimates, a Search Console dashboard, and WordPress/Wix/PHP-native setup.

### Gaps
- I found no neutral, independent 2025–2026 benchmark of Cloudflare's accuracy against other tools; available comparisons are competitor-authored.
- I couldn't verify whether the 2020 path bug and the reload double-counting persist in 2026.
