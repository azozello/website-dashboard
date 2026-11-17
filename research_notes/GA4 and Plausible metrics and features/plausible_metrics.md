# Plausible Analytics: everything it collects and reports (as of Nov 2026)

Source key, used in the citations below:
- [Metrics defs](https://plausible.io/docs/metrics-definitions) is the official glossary (page "last updated Nov 11, 2026").
- [Stats API](https://plausible.io/docs/stats-api) is the Stats API v2 reference.
- [Data policy](https://plausible.io/data-policy).
- [Script ext](https://plausible.io/docs/script-extensions).
- [Changelog (product)](https://plausible.io/changelog) covers the Cloud product.
- [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md) covers the open-source / Community Edition (CE) releases.
- [Pricing](https://plausible.io/#pricing).
- [Self-hosting](https://plausible.io/docs/self-hosting) compares CE with Cloud.

---

## 1. Dashboard top-level metrics and how each is defined

### Takeaway
The top row has seven core metrics: Unique Visitors, Total Visits, Total Pageviews, Views per Visit, Bounce Rate, Visit Duration and Current Visitors. Plausible has since added Time on Page (reworked in 2025 to use engagement signals), Scroll Depth (Mar 2025), Exit Rate, Conversion Rate, unique and total conversions, and Total/Average Revenue. Bounce rate was redefined in Nov 2025, when events could be marked non-interactive.

### Cited Findings
**Traffic metrics**
- **Unique Visitors**: "The number of people who visited your site." Because there are no cookies, the same person on different devices or on different days counts separately. Several sessions by one person on the same day count once. — [Metrics defs](https://plausible.io/docs/metrics-definitions)
- **Total Visits (Sessions)**: a set of actions a user takes on the site. A session ends after 30 minutes without activity. — [Metrics defs](https://plausible.io/docs/metrics-definitions)
- **Total Pageviews**: total page loads. One visitor loading 5 pages adds 5. — [Metrics defs](https://plausible.io/docs/metrics-definitions)
- **Current Visitors**: visitors who loaded a page in the last 5 minutes. Dashboard filters don't affect it. — [Metrics defs](https://plausible.io/docs/metrics-definitions)

**Engagement metrics**
- **Bounce Rate**: the percentage of visitors who land on a page and leave without meaningfully engaging. A visit is not a bounce if it views a second page or triggers a custom event. Events sent with `{interactive: false}` don't prevent a bounce. — [Metrics defs](https://plausible.io/docs/metrics-definitions)
  - The v3.1.0 change (2025-11-13): "a session is a bounce only if it has fewer than 2 pageviews and no interactive custom events". In the same release, custom events can be marked non-interactive in both the tracker and the Events API. — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)
  - `bounce_rate` was added to the Entry Pages breakdown in v3.1.0. — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)
- **Visit Duration**: time visitors spend on the site. One-page visits count as 0 s and are included in the average. — [Metrics defs](https://plausible.io/docs/metrics-definitions)
- **Views per Visit (Pages/Session)**: average pageviews per visit, including repeat views of the same page. — [Metrics defs](https://plausible.io/docs/metrics-definitions)
- **Time on Page**: "the average amount of time spent per visitor viewing a particular page". The script sends an `engagement` event on each navigation or tab switch. Time in inactive tabs is not counted, and bounced visitors are included. — [Metrics defs](https://plausible.io/docs/metrics-definitions)
  - The engagement-based calculation counts from **1 Mar 2025** (announced 8 Apr 2025). Earlier periods show the legacy metric. The metric can be graphed and sorted in Top Pages. — [Changelog](https://plausible.io/changelog)
  - v3.0.0 (2025-04-11): the tracker reports maximum scroll depth and engaged time in an `engagement` event, with params `sd` and `e`. `time_on_page` became graphable and sortable, available in the API, and included in CSV/GA4 export and import. — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)
- **Scroll Depth**: how far visitors scroll, as the average percentage of page height reached. — [Metrics defs](https://plausible.io/docs/metrics-definitions)
  - Tracked automatically on all pages since **10 Mar 2025**. It shows in Top Pages and in the top row once a page filter is applied. — [Changelog](https://plausible.io/changelog); [Scroll depth doc](https://plausible.io/docs/scroll-depth)
  - It shows "-" when there is too little data. — [Scroll depth doc](https://plausible.io/docs/scroll-depth)
  - The Stats API defines it as "page scroll depth averaged per session". — [Stats API](https://plausible.io/docs/stats-api)
- **Exit Rate**: exits from a page divided by that page's total pageviews. — [Metrics defs](https://plausible.io/docs/metrics-definitions)
  - It can be sorted and compared in Exit Pages > Details (v3.0.0) and is shown to one decimal place. — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)

**Goal and revenue metrics** (in the top row when a goal filter is applied)
- **Conversion Rate (CR)**: unique conversions divided by unique visitors. Both are affected by filters. Shown to 2 decimals since v3.0.0. — [Metrics defs](https://plausible.io/docs/metrics-definitions); [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)
- **Unique Conversions**: shown as "Uniques" in the Goals report and as "Visitors" in a goal breakdown. — [Metrics defs](https://plausible.io/docs/metrics-definitions)
- **Total Conversions**: every completion, including repeats. Shown as "Total" in the Goals report and as "Events" in a breakdown. — [Metrics defs](https://plausible.io/docs/metrics-definitions)
- **Total Revenue** and **Average Revenue**: total and average value of tracked orders. Both appear in the top graph when a revenue goal filter is applied. — [Metrics defs](https://plausible.io/docs/metrics-definitions); [Revenue doc](https://plausible.io/docs/ecommerce-revenue-tracking)

**Dashboard-level reporting features added 2024–2026**
- Comparisons for all reports (v3.0.0). — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)
- Periods `28d` and `91d` added. `7d` and `30d` no longer include today. "Last 30 days" became "Last 28 days" (v3.0.0). — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)
- A "Last 24 Hours" range was added on 11 Feb 2026. — [Changelog](https://plausible.io/changelog)
- A visitor **percentage** column on all reports (v3.2.0, 2026-01-16; Cloud 5 Jan 2026). — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md); [Changelog](https://plausible.io/changelog)
- Top, Entry and Exit Pages can show full URLs instead of paths (24 Jun 2026). — [Changelog](https://plausible.io/changelog)
- **Annotations** on the traffic chart, either personal or site-shared (14 Jul 2026). — [Changelog](https://plausible.io/changelog)
- **Saved segments**: personal segments on all plans and site segments for teams (6 Mar 2025). Shared links can be restricted to a segment (Jan 2026). — [Changelog](https://plausible.io/changelog)
- **Consolidated Views**: combined traffic across sites on the All Sites page (17 Nov 2025). — [Changelog](https://plausible.io/changelog)
- A Revenue column in expanded reports (sources, pages, locations, devices, custom props) when a revenue goal is applied (24 Nov 2025). — [Changelog](https://plausible.io/changelog)
- Traffic spike and drop email notifications. The spike email includes the top 3 pages. Weekly and monthly email reports include top goal conversions (v2.1.2 / v3.0.0 / v3.1.0). — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)

### Inferences
- "Unique visitors" over a multi-day range effectively sums per-day uniques per device. A person who visits daily for a week can count up to 7 times. This follows from the daily salt (section 4) and the "different days count separately" definition.
- Time on Page and Scroll Depth are page-level metrics. They appear in the top row only with a page filter, and the API requires `event:page` for them, so neither is a site-wide KPI.
- Time on Page is not comparable across 1 Mar 2025, because the calculation changed on that date.

### Gaps
- The exact scroll-depth aggregation formula (per-pageview max, averaged per session and then across sessions?) is only partly described. The [Stats API](https://plausible.io/docs/stats-api) says "averaged per session". The [Scroll depth doc](https://plausible.io/docs/scroll-depth) doesn't give the math.
- Time on Page wording differs slightly between sources. [Metrics defs](https://plausible.io/docs/metrics-definitions) says "per visitor"; the [Stats API](https://plausible.io/docs/stats-api) says "average seconds on a page per visit".

---

## 2. Breakdowns/dimensions, and Stats API v2 dimensions and filter operators

### Takeaway
The dashboard reports cover Sources (Channels, Sources, five UTM params), Pages (Top, Entry, Exit), Locations (Country, Region, City), Devices (Browser + version, OS + version, Screen size, which is really a device category), Hostnames, Goals and Properties. In the Stats API v2 these map to 4 `event:*`, 23 `visit:*` and 5 `time*` dimensions. Filters support `is`, `is_not`, `contains`, `contains_not`, `matches` and `matches_not`, combined with `and`, `or` and `not`. There are also the behavioural filters `has_done` / `has_not_done`, a `case_sensitive` modifier and segment filters.

### Cited Findings
**Sources and campaigns**
- **Source**: referring sites. **Channels** group sources into categories such as "Organic Social", "Paid Search" and "Email". — [Metrics defs](https://plausible.io/docs/metrics-definitions)
  - The Channels report was added in v3.0.0. — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)
  - An **AI Assistants** channel was added on 10 Jun 2026, broken down by source (e.g. ChatGPT, Claude). Historical data was reclassified. — [Changelog](https://plausible.io/changelog)
- **Direct / None**: visitors who typed the URL, clicked a link in an email, came from messaging apps ("dark social"), or sent no referrer. — [Metrics defs](https://plausible.io/docs/metrics-definitions)
- **UTM parameters**: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`. — [Metrics defs](https://plausible.io/docs/metrics-definitions)
  - The UTM Medium report shows `(gclid)` and `(msclkid)` for paid search clicks without an explicit medium (v3.0.0). — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)
- **Referrer drilldown**: clicking a source shows the referring pages and their traffic over time. — [Metrics defs](https://plausible.io/docs/metrics-definitions)
  - Referrers are parsed with the referer-parser DB. Unmatched referrers fall back to their hostname as the source. — [Events API](https://plausible.io/docs/events-api)
  - Source names are stored capitalised (v2.1.2). — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)
- Query strings are discarded except for supported campaign and referral parameters. — [Data policy](https://plausible.io/data-policy)

**Pages**
- **Top Pages**, **Entry Pages** (first page viewed) and **Exit Pages** (last page viewed). — [Metrics defs](https://plausible.io/docs/metrics-definitions)
- Entry and exit page are set only from pageviews, not custom events (v2.1.0). — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)
- **Hostname** is available as a dimension and filter (`event:hostname`, `visit:entry_page_hostname`, `visit:exit_page_hostname`). — [Stats API](https://plausible.io/docs/stats-api)

**Locations**
- Country, region and city, derived from the IP and never exact. — [Data policy](https://plausible.io/data-policy)
- VPN, Tor and iCloud Private Relay traffic usually shows as "Anonymous VPN Service" in Countries. — [Bot filtering doc](https://plausible.io/docs/bot-traffic-filtering)
- With a goal filter, the Countries, Regions and Cities details show conversions and CR (v2.1.0). — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)

**Devices**
- **Browser** and **Browser version**, and **Operating System** and **OS version**. Stored as major/minor version only. — [Metrics defs](https://plausible.io/docs/metrics-definitions); [Data policy](https://plausible.io/data-policy)
- **Screen Size**: "despite its name", this is the device category (desktop / mobile / tablet), derived from the User-Agent, which is discarded after categorisation. — [Metrics defs](https://plausible.io/docs/metrics-definitions)
- UA parsing uses the device-detector DB. Unrecognised agents may not appear. — [Events API](https://plausible.io/docs/events-api)
- Details views with search and sort for each of these were added in v2.1.2. — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)

**Other values**
- **(not set)**: values that can't be matched, such as an unknown browser. — [Metrics defs](https://plausible.io/docs/metrics-definitions)
- **(none)**: an empty or missing custom-property value, or a missing hostname. — [Custom props](https://plausible.io/docs/custom-props/introduction); [Events API](https://plausible.io/docs/events-api)

**Stats API v2 dimensions** — [Stats API](https://plausible.io/docs/stats-api)
- Event dimensions: `event:goal`, `event:page` (wildcards such as `/blog*`), `event:hostname`, `event:props:<name>`.
- Visit dimensions: `visit:entry_page`, `visit:entry_page_hostname`, `visit:exit_page`, `visit:exit_page_hostname`, `visit:source`, `visit:referrer`, `visit:channel`, `visit:utm_medium`, `visit:utm_source`, `visit:utm_campaign`, `visit:utm_content`, `visit:utm_term`, `visit:device`, `visit:browser`, `visit:browser_version`, `visit:os`, `visit:os_version`, `visit:country`, `visit:region`, `visit:city`, `visit:country_name`, `visit:region_name`, `visit:city_name`.
- Time dimensions: `time`, `time:hour`, `time:day`, `time:week`, `time:month`.
- Session metrics (`bounce_rate`, `views_per_visit`, `visit_duration`) can't be combined with event dimensions, except `event:page` and `event:hostname` (with `event:page`).

**Stats API v2 filters** — [Stats API](https://plausible.io/docs/stats-api)
- Operators: `is`, `is_not`, `contains`, `contains_not`, `matches`, `matches_not`. Regex uses RE2 syntax.
- Logical operators: `and`, `or`, `not`. Top-level filters are an implicit AND.
- Behavioural operators: `has_done`, `has_not_done` filter sessions by whether another event occurred.
- Modifier: `case_sensitive` (e.g. `{"case_sensitive": false}`) on `is` and `contains`.
- Segment filter: `["is", "segment", [<id>]]`.
- `event:goal` supports only `is` and `contains`.
- Time dimensions can't be filtered. Use `date_range` instead.
- Version history: `has_done`/`has_not_done`, `case_sensitive` and the segment filter arrived in v3.0.0. — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)
- Dashboard: `is` and `is not` lost wildcard support in v2.1.2 (use `contains` instead), and a `contains_not` UI filter was added. Multiple custom-property filters have worked since v2.1.0. — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)

### Inferences
- There is no screen-resolution or viewport dimension, no language/locale dimension, and no new-vs-returning dimension. None appears in the docs or the API dimension list (consistent with the no-persistent-ID design).
- The dimension set for a small-business tool is fairly minimal: about 23 visit dimensions plus custom props.

### Gaps
- I didn't find the full official list of Channel names. Only "Organic Social", "Paid Search", "Email" and "AI Assistants" are confirmed above.
- Before 2025 the docs derived "Screen size" from screen width. The current glossary says it comes from the User-Agent. I didn't find a dated changelog entry for that switch.

---

## 3. Goals, events, custom properties, revenue, funnels, journeys and auto-tracking

### Takeaway
There are three goal types: pageview, custom event and scroll depth (since Mar 2025). Goals can be narrowed by up to 3 property values. Custom properties allow 30 per event (key ≤300 chars, value ≤2,000) and are Business-only. Revenue goals take any ISO-4217 currency, converted to one base currency per goal. Funnels have 2–8 steps and come in three types (sequential, strict, flexible). User Journeys launched May 2026. The Oct 2025 site-specific script lets you toggle outbound links, file downloads and form submissions in settings without changing the snippet. Outbound links is on by default for new sites. 404, hash routing, custom events, props and revenue still need manual setup.

### Cited Findings
**Goal types and naming**
- Pageview goals track page visits. Custom event goals track actions. Display names can be edited, and goals can be narrowed by property values (e.g. "Purchase (Business – yearly)"). — [Custom event goals](https://plausible.io/docs/custom-event-goals)
  - Goals can filter on up to **3** custom properties and values, for pageview, custom event and scroll goals (4 Feb 2026). — [Changelog](https://plausible.io/changelog)
- **Scroll Depth goals** take any threshold from 1–100% on a pathname, with wildcards (e.g. `/blog*`). They show only Uniques and CR, not Total. — [Scroll depth doc](https://plausible.io/docs/scroll-depth)
- Goal filters support `contains` (v2.1.2) and "is not" (v3.0.0; Cloud 23 Jan 2025). — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md); [Changelog](https://plausible.io/changelog)
- **Tagged events**: add the CSS class `plausible-event-name=My+Event` to an element (`+` becomes a space). Use `--` where the CMS rewrites `=`. — [Custom event goals](https://plausible.io/docs/custom-event-goals)

**Custom properties (Business plan)**
- Limits: up to **30** props per event, property name ≤**300** chars, value ≤**2,000** chars. Values must be scalars (string, number, boolean). — [Custom props](https://plausible.io/docs/custom-props/introduction)
  - The Events API discards extras beyond 30. — [Events API](https://plausible.io/docs/events-api)
- Props can attach to pageviews or to custom events. — [Custom props](https://plausible.io/docs/custom-props/introduction)
- PII is prohibited, including names, emails, addresses, phone numbers, card or passport numbers, precise locations, IPs, and cookie or ad IDs. Values can't be deleted individually; only deleting the site removes them. — [Custom props](https://plausible.io/docs/custom-props/introduction)
- The Properties report was added in v2.1.0. Props must be added in Site Settings before they show (v2.1.0), and the report has auto-selected a property since v2.1.2. — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)
- The new script has a `customProperties` hook that derives props at runtime (v3.1.0). — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)

**Revenue goals (Business plan)**
- You enable revenue on a custom event goal and send `revenue: {amount, currency}`. — [Revenue doc](https://plausible.io/docs/ecommerce-revenue-tracking)
  - Example: `plausible("Purchase", {revenue: {currency: "USD", amount: 10.29}})`. The CSS classes `plausible-revenue-amount` and `plausible-revenue-currency` also work, as does the Events API.
  - Amounts are in major units, as numbers or numeric strings.
  - An invalid currency code still records the event, but without revenue.
- **Currencies**: any ISO 4217 code (uppercase). Each goal converts to a base currency chosen at creation, which can't be changed later. — [Revenue doc](https://plausible.io/docs/ecommerce-revenue-tracking)
- Metrics: unique conversions, total conversions, CR, total revenue and average revenue. Revenue is attributed to the visit's source, campaign and pages. Renewals and refunds in later visits are not attributed. €0 orders lower the average. — [Revenue doc](https://plausible.io/docs/ecommerce-revenue-tracking)

**Funnels (Business plan)** — [Funnel doc](https://plausible.io/docs/funnel-analysis)
- **2–8 steps**. Steps can be pages and custom events (from the last 30 days) or goals (wildcard pages, scroll, props, revenue). There is no branching.
- Types:
  - **Sequential** (default): steps in order, other activity allowed in between.
  - **Strict**: steps must be consecutive. Added 14 Apr 2026.
  - **Flexible**: only the first and last steps are required. Added 23 Sep 2026. — [Changelog](https://plausible.io/changelog)
- Metrics: visitors per step, drop-off %, overall CR, and revenue and revenue per visitor on revenue steps. Period comparison was added 9 Sep 2026. — [Changelog](https://plausible.io/changelog)
- Steps can be built by searching pages and events, without creating goals first (2 Nov 2026). — [Changelog](https://plausible.io/changelog)
- Funnels span subdomains, and a return from an external payment page counts as the same session.

**User Journeys (Business plan)** — [User journeys doc](https://plausible.io/docs/user-journeys)
- Up to **20** steps, forward from a page, goal or event, or backward from a conversion. Each step has a "No further action" drop-off row. CR is shown as a % of starting visitors.
- All dashboard filters apply. Revenue and property-filtered goals are not supported yet.
- Launched 27 May 2026 in the Explore tab. — [Changelog](https://plausible.io/changelog)

**Automatic tracking and the 2025 script**
- The new site-specific script launched 8 Oct 2025 (CE v3.1.0, 2025-11-13). Optional measurements are toggled in site settings, so changes "take effect automatically without needing to update the snippet". The same release added automatic form-submission tracking and an official GTM template. — [Changelog](https://plausible.io/changelog); [Script ext](https://plausible.io/docs/script-extensions); [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)
- **Settings toggles ("default tracking")**: outbound links, file downloads, form submissions. **Manual setup ("additional tracking")**: custom events, 404 error pages, hashed page paths (hash-based routing), custom properties, ecommerce revenue. — [Script ext](https://plausible.io/docs/script-extensions)
- `plausible.init()` options and defaults — [Script ext](https://plausible.io/docs/script-extensions):
  - `endpoint` (default `https://plausible.io/api/event`)
  - `hashBasedRouting` (false)
  - `fileDownloads` (false, or `{fileExtensions}`)
  - `outboundLinks` (false)
  - `formSubmissions` (false)
  - `customProperties` (`{}` or a function)
  - `captureOnLocalhost` (false)
  - `autoCapturePageviews` (true)
  - `logging` (true)
  - `transformRequest` (a function)
- There is also an NPM ESM module, `@plausible-analytics/tracker`. — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)
- **Outbound Link: Click** is the auto-created goal name. It records the `url` prop and is "enabled when adding a new site" by default. The NPM package needs `outboundLinks: true`. — [Outbound links doc](https://plausible.io/docs/outbound-link-click-tracking)
- **File Download** is the goal name. It records the `url` prop. — [File downloads doc](https://plausible.io/docs/file-downloads-tracking)
  - Default extensions: pdf, xlsx, docx, txt, rtf, csv, exe, key, pps, ppt, pptx, 7z, pkg, rar, gz, zip, avi, mov, mp4, mpeg, wmv, midi, mp3, wav, wma, dmg.
  - A custom `fileExtensions` list replaces the defaults.
- **Form: Submission** is a single goal, which can be broken down by page, referrer, location and device. — [Metrics defs](https://plausible.io/docs/metrics-definitions)
  - The WordPress plugin 2.2.0 also adds a "WP Form Completions" goal. — [Changelog](https://plausible.io/changelog)
- **404 error pages** track broken links (manual snippet). Path-based special events such as "404" no longer need `props.path` set (v3.1.0). — [Metrics defs](https://plausible.io/docs/metrics-definitions); [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)
- **Engagement**: since v3.0.0 the tracker automatically sends an `engagement` event carrying max scroll depth (`sd`) and engaged time (`e`). Scroll depth and engagement time are collected while the page is open. — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md); [Data policy](https://plausible.io/data-policy)
- **Events API body**: `domain`, `name` (`pageview` is special), `url` (≤2,000 chars excluding domain and query string), `referrer`, `props` (≤30), `revenue {currency, amount}`, `interactive` (default true). — [Events API](https://plausible.io/docs/events-api)
  - Headers: `User-Agent` (required), `X-Forwarded-For` / `CF-Connecting-IP`, `X-Debug-Request`.

**Data import and export**
- GA4 import, including custom events, and CSV import and export (v2.1.0). — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)
- Properties are included in exports (v3.1.0). — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)
- Looker Studio connector (Jan 2025). Enterprise scheduled raw-event exports (Jan 2026). — [Changelog](https://plausible.io/changelog)

### Inferences
- In practice the script auto-captures pageviews plus engagement (scroll and time) events, and with default site settings outbound clicks too. Downloads and forms are one-click toggles. 404, hash routing, props and revenue need code.
- The auto-goal names (`Outbound Link: Click`, `File Download`, `Form: Submission`) are the de facto event taxonomy a competitor would need to match for migration.

### Gaps
- **Sources conflict on defaults.** [Metrics defs](https://plausible.io/docs/metrics-definitions) lists the auto-tracked features as "not enabled by default". The [Outbound links doc](https://plausible.io/docs/outbound-link-click-tracking) says outbound links is enabled by default for new sites. `init()` defaults are `false` ([Script ext](https://plausible.io/docs/script-extensions)), but they describe NPM/manual use, not the settings toggles.
- I couldn't confirm the exact goal name for 404 events (historically "404") or for cloaked affiliate links (historically "Cloaked Link: Click"). The fetched docs don't state them, though [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md) v2.1.0 names "404 pages" and "cloaked links" among the special goals.
- The fetched docs don't state a limit on goals per site or on funnels per site.
- The legacy script-extension filenames (e.g. `script.hash.js`, `script.outbound-links.js`, `script.tagged-events.js`) weren't on the fetched pages, so they are unverified here.
- The revenue doc doesn't name the exchange-rate source.

---

## 4. Counting visitors without cookies, sessions, and bot/spam filtering

### Takeaway
A visitor ID is `hash(daily_salt + website_domain + ip_address + user_agent)`, and the salt is deleted every 24 h. Uniqueness therefore holds only within one day, one site and one device. A visit is a run of events from the same UA, IP and domain with gaps under 30 minutes. Cloud filters bots by automation-browser flag, UA lists, referrer-spam lists, data-centre IP ranges (about 32K or 40.8K, depending on the doc) and an in-house traffic-pattern algorithm. CE only filters by UA and referrer spam.

### Cited Findings
**Visitor ID and its limits**
- The ID is `hash(daily_salt + website_domain + ip_address + user_agent)`. It is specific to one website and one device. The salt is rotated and deleted every 24 h. — [Data policy](https://plausible.io/data-policy)
- Limitation: the same person is counted again on a new day, so returning visitors can't be recognised across days. — [Data policy](https://plausible.io/data-policy)
  - The same person on different devices also counts separately. — [Metrics defs](https://plausible.io/docs/metrics-definitions)

**Sessions**
- A session ends after 30 min of inactivity. — [Metrics defs](https://plausible.io/docs/metrics-definitions)
- Events with the same UA, IP and domain within 30 min of the last event join the visit; otherwise a new visit starts. — [Events API](https://plausible.io/docs/events-api)
- Session identifiers support entry and exit pages, pageviews per visit and visit duration. — [Data policy](https://plausible.io/data-policy)

**Bot and spam filtering**
- Methods (Cloud) — [Bot filtering doc](https://plausible.io/docs/bot-traffic-filtering):
  1. The script sends nothing from automation-controlled browsers (Selenium, Playwright).
  2. Known bot and crawler User-Agents are blocked.
  3. Known referrer-spam domains are filtered.
  4. About **40,800** data-centre IP ranges are filtered.
  5. An in-house traffic-pattern algorithm drops non-human traffic.
  - The Events API is subject to the same UA and DC-IP filters.
  - Filters are updated continuously.
- Trade-offs — [Bot filtering doc](https://plausible.io/docs/bot-traffic-filtering):
  - Some VPN or iCloud Private Relay visits on data-centre IPs are dropped.
  - Both false positives and false negatives occur.
  - New bots may appear until they are identified.
  - AI crawlers don't run JavaScript, so they never appear.
- The Events API returns 202 even for dropped events and sets the `x-plausible-dropped: 1` header. Dropped events can't be recovered. — [Events API](https://plausible.io/docs/events-api)
- **Shields** (manual): country block, hostname allow-list, IP block (single IPs only, no ranges) and page exclusions. They apply going forward only. — [Bot filtering doc](https://plausible.io/docs/bot-traffic-filtering)
  - Page, IP and country block lists were added in v2.1.0. — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)
- Self-exclusion: the script reads (never writes) a `plausible_ignore` localStorage flag. — [Data policy](https://plausible.io/data-policy)
- Cloud vs CE — [Self-hosting](https://plausible.io/docs/self-hosting):
  - Cloud: "advanced" filtering (algorithmic detection, UA and referrer-spam exclusion, ~32K data-centre IP ranges).
  - CE: "basic" filtering by UA and referrer-spam domains only.

### Inferences
- Visitors who share an IP and identical UA on the same day (e.g. an office NAT with a standard browser build) collapse into one visitor. This is my inference from the hash inputs; the [Data policy](https://plausible.io/data-policy) doesn't state it.
- An IP or UA change mid-session (mobile network handover, browser update) splits the visit, because session matching uses the same inputs.

### Gaps
- **Sources conflict on the data-centre range count**: ~32K in [Self-hosting](https://plausible.io/docs/self-hosting) vs ~40,800 in [Bot filtering doc](https://plausible.io/docs/bot-traffic-filtering). The bot-filtering doc is probably the newer figure, but neither page is dated in the fetched content.
- No source details how the hash is computed (algorithm, or whether the IP is truncated first).

---

## 5. What Plausible explicitly does NOT collect

### Takeaway
Plausible stores no cookies, localStorage IDs or persistent identifiers, no raw IPs or raw UA strings, no exact location, and does no cross-site, cross-device or cross-app tracking. All data stays in the EU. The data-policy page itself doesn't use the word "fingerprinting".

### Cited Findings
- Not collected or used: cookies, localStorage or browser cache for identification, persistent visitor IDs, raw IP addresses, raw User-Agent strings, exact locations, cross-device / cross-website / cross-app tracking, and personal data identifying individuals. — [Data policy](https://plausible.io/data-policy)
- The raw IP is not stored. It is used only for the visitor hash and the Location report. — [Events API](https://plausible.io/docs/events-api)
- The UA is discarded after device categorisation. — [Metrics defs](https://plausible.io/docs/metrics-definitions)
- What *is* collected — [Data policy](https://plausible.io/data-policy):
  - page URL (hostname + path, query string stripped except campaign params)
  - referrer and UTMs
  - browser and OS (major/minor version)
  - device type
  - country, region and city
  - scroll depth and engagement time
  - pageviews and custom events
  - custom props and revenue (only if configured)
  - timestamps
  - session identifiers
- Site owners must not send PII in props. — [Custom props](https://plausible.io/docs/custom-props/introduction)
- Hosting: Cloud data is processed and stored in the EU ("Visitor data does not leave the EU") on European-owned infrastructure. The company is an Estonian entity. — [Data policy](https://plausible.io/data-policy)
  - The Cloud server is in Germany. — [Self-hosting](https://plausible.io/docs/self-hosting)

### Inferences
- The absence of persistent IDs is what removes new-vs-returning, multi-day uniques, cohort/retention, cross-device and user-level reports from Plausible's feature set.

### Gaps
- The [Data policy](https://plausible.io/data-policy) page doesn't explicitly address fingerprinting. Plausible's no-fingerprinting statement may sit on another page (e.g. the privacy-focused analytics marketing page), which wasn't fetched.

---

## 6. Google Search Console integration

### Takeaway
Plausible pulls search query, clicks, impressions, CTR and position live from the GSC API, without storing them, into the Google source of the Sources report. Only keywords with at least one click appear, the data lags 24–36 h, and it can be filtered by page, country and device.

### Cited Findings
- Fields: search query, clicks, impressions, CTR and position. Plausible doesn't store them. — [GSC doc](https://plausible.io/docs/google-search-console-integration)
- Placement: Sources > Google. The keyword list shows visitors; expanding it shows impressions, CTR and position. — [GSC doc](https://plausible.io/docs/google-search-console-integration)
- Limits — [GSC doc](https://plausible.io/docs/google-search-console-integration):
  - Data is delayed about 24–36 h.
  - Only keywords with at least 1 click appear.
  - Google samples keyword data, so totals may not match total Google visitors.
  - Unlinking hides the data immediately.
- Filters: page, country and device. Added in v2.1.0. — [GSC doc](https://plausible.io/docs/google-search-console-integration); [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)
- Search and pagination in Google Keywords Details (v2.1.2). Dynamic property lookup in settings (v3.1.0). — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)
- Setup uses Google OAuth from Site Settings > Integrations. Domain and URL-prefix properties are both supported. — [GSC doc](https://plausible.io/docs/google-search-console-integration)

### Inferences
- GSC is presented as a general feature, not plan-gated. The [Pricing](https://plausible.io/#pricing) page doesn't assign it to a tier.

### Gaps
- The docs don't say whether CE supports GSC out of the box (it would need the operator's own Google OAuth credentials).
- GSC data isn't listed among the Stats API v2 dimensions or metrics ([Stats API](https://plausible.io/docs/stats-api)), so it appears to be dashboard-only.

---

## 7. Stats API v2 metric names and query options

### Takeaway
The v2 `/api/v2/query` endpoint exposes 14 metrics: `visitors`, `visits`, `pageviews`, `views_per_visit`, `bounce_rate`, `visit_duration`, `events`, `scroll_depth`, `time_on_page`, `percentage`, `conversion_rate`, `group_conversion_rate`, `average_revenue` and `total_revenue`. `exit_rate` is not documented as a public metric. The API is a Business-plan feature, limited to 600 req/h by default.

### Cited Findings
**Metrics** — [Stats API](https://plausible.io/docs/stats-api)

| Metric | Meaning | Restriction |
|---|---|---|
| `visitors` | unique visitors | |
| `visits` | visits | |
| `pageviews` | pageviews | |
| `views_per_visit` | pageviews ÷ visits | |
| `bounce_rate` | % | |
| `visit_duration` | seconds | |
| `events` | pageviews + custom events; equals "Total Conversions" under a goal filter | |
| `scroll_depth` | average per session | needs `event:page` filter or dimension |
| `time_on_page` | average seconds per visit | needs `event:page` |
| `percentage` | share of visitors | needs a dimension |
| `conversion_rate` | goal visitors ÷ all visitors | needs `event:goal` filter or dimension |
| `group_conversion_rate` | same, but the divisor is per dimension group | needs `event:goal` |
| `average_revenue` | | needs revenue goals and `event:goal`; returns null with `meta.metric_warnings` if it can't be computed |
| `total_revenue` | | same as `average_revenue` |

- Revenue values are objects `{value, currency, short, long}`.

**Query options** — [Stats API](https://plausible.io/docs/stats-api)
- Required: `site_id`, `metrics`, `date_range`.
- `date_range`: custom dates or datetimes, or `day`, `24h`, `7d`, `28d`, `30d`, `91d`, `month`, `6mo`, `12mo`, `year`, `all`.
- `include.imports`, `include.time_labels`, `include.total_rows`.
- `include.trim_relative_date_range` (v3.1.0). — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)
- `pagination` (default limit 10,000).
- `order_by` (can't use `event:goal`).
- Rate limit: 600 req/h by default; more on request. — [Stats API](https://plausible.io/docs/stats-api)
  - CE API keys are effectively unlimited (v2.1.2). — [CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)

**Related APIs**
- The Sites API is Enterprise-only on Cloud ([Pricing](https://plausible.io/#pricing)) and absent from CE ([Self-hosting](https://plausible.io/docs/self-hosting)).
- The Looker Studio connector runs on the Stats API (Jan 2025). — [Changelog](https://plausible.io/changelog)

### Inferences
- Exit rate, unique/total conversion labels, and GSC keyword data are visible in the dashboard but not exposed as named v2 metrics or dimensions.

### Gaps
- `exit_rate` is a dashboard metric (v3.0.0), but the fetched [Stats API](https://plausible.io/docs/stats-api) page doesn't list it. It may exist undocumented or internally.
- The exact JSON syntax for `has_done` / `has_not_done` wasn't captured.

---

## 8. Plan tiers (Cloud) and Cloud vs Community Edition differences

### Takeaway
Core traffic metrics, goals and custom events, scroll depth, time on page, GSC and email reports are available on every plan. Custom properties, revenue, funnels, user journeys, the Stats API, the Looker Studio connector and consolidated views are Business-tier. SSO, the Sites API, the managed proxy and raw exports are Enterprise. CE (AGPLv3, released twice a year) lacks funnels, user journeys, revenue goals, SSO and the Sites API, and has only basic bot filtering.

### Cited Findings
**Cloud plans** — [Pricing](https://plausible.io/#pricing)
- Prices: Starter $9/mo (1 site), Growth $14/mo (up to 3 sites and 3 members), Business $19/mo (up to 10 sites and 10 members), Enterprise custom-priced (10+ sites). The pageview slider runs from 10k to 10M+.
- Business adds: custom properties, funnels and user journeys, ecommerce revenue attribution, Stats API (600 req/h), Looker Studio connector, consolidated view.
- Enterprise adds: Sites API, SSO, Managed Proxy, scheduled raw event exports, priority support.
- Growth adds: shared segments, team management, shared links, embedded dashboards.
- All plans: goals and custom events, saved segments, email and Slack reports, GA import, annotations. Starter shows "no retention limit".

**Feature-specific tier notes**
- Business only: custom props ([Custom props](https://plausible.io/docs/custom-props/introduction)), revenue ([Revenue doc](https://plausible.io/docs/ecommerce-revenue-tracking)), funnels ([Funnel doc](https://plausible.io/docs/funnel-analysis)), user journeys ([User journeys doc](https://plausible.io/docs/user-journeys)).
- Managed Proxy is Enterprise only (Jul 2025). SSO via SAML 2.0 arrived Jul 2025. — [Changelog](https://plausible.io/changelog)

**CE vs Cloud** — [Self-hosting](https://plausible.io/docs/self-hosting)
- CE lacks: marketing funnels, user journeys, ecommerce revenue goals, SSO, Sites API, Data Studio/Looker connector.
- CE has basic bot filtering only and a long-term release twice a year (Cloud updates several times a week).
- CE is AGPLv3, community support only, hosted anywhere. Both editions run the same code.
- The `plausible/community-edition` deployment repo is MIT-licensed and "funded by our cloud subscribers". — [CE repo](https://github.com/plausible/community-edition)

### Inferences
- Custom properties, scroll depth, time on page, segments, GSC and the Stats API are not on CE's missing list, so they appear to be available in CE ([Self-hosting](https://plausible.io/docs/self-hosting) lists only the exclusions above).
- The latest CE release confirmed here is v3.2.0 (Jan 2026) ([CHANGELOG.md](https://github.com/plausible/analytics/blob/master/CHANGELOG.md)). Cloud features from 2026 (flexible/strict funnels, AI Assistants channel, annotations, full-URL pages, 3-prop goal filters) may arrive in CE later or never, for the premium ones.

### Gaps
- **Sources conflict on segments.** [Changelog](https://plausible.io/changelog) (Mar 2025) says site segments need the Business plan. The current [Pricing](https://plausible.io/#pricing) page shows shared segments from Growth. This may be a later change.
- The pricing summary doesn't map pageview limits or the starting price per pageview tier to plans, and doesn't list data retention for Growth, Business or Enterprise.
- The fetched pages don't confirm CE geolocation accuracy (DB-IP vs MaxMind, city-level).
