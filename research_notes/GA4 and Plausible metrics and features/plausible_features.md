# Plausible Analytics: features and capabilities beyond raw metrics (as of Nov 2026)

Tier legend used below: **[Starter+]** = every paid tier; **[Growth+]**; **[Business+]**; **[Ent]** = Enterprise only; **[Cloud-only]** = not in Community Edition (CE). Tier mapping comes from the plausible.io home-page pricing section (fetched 2026-11-16) unless noted. During the 30-day trial, all Business features are unlocked ([docs/subscription-plans](https://plausible.io/docs/subscription-plans)).

## 1. Dashboard: one-page dashboard, date ranges, comparisons, filters, segments, realtime, sharing, embeds, dark mode

### Takeaway
All tiers get a single-page dashboard with filters, saved personal segments, comparisons (previous period, year over year, custom), annotations and realtime. Sharing features (shared links, password protection, embeds, site-wide segments and annotations) start at Growth. The Consolidated View across sites is Business+.

### Cited Findings
- **Simple dashboard / one-page dashboard**: key stats on one page, plus a lightweight script and built-in bot and referrer-spam filtering — [plausible.io home](https://plausible.io/)
- **Real-time dashboard**: updates every 30 seconds — [plausible.io home](https://plausible.io/). Docs page exists at /docs/realtime-dashboard — [docs index](https://plausible.io/docs)
- **Compare periods** [Starter+]: comparison modes "Previous period", "Year over year" and "Custom period" (any range, longer or shorter), with alignment options "Match day of week" or "Match exact date". Keyboard shortcut X toggles comparison — [docs/compare-stats](https://plausible.io/docs/compare-stats)
- **Period comparison arrows** on all dashboard metrics (Oct 30, 2024) — [changelog](https://plausible.io/changelog)
- **"Last 24 Hours" time range** with keyboard shortcut H (Feb 11, 2026) — [changelog](https://plausible.io/changelog). Stats API presets include `day`, `24h`, `7d`, `28d`, `30d`, `91d`, `month`, `6mo`, `12mo`, `year`, `all` and custom ISO 8601 ranges — [docs/stats-api](https://plausible.io/docs/stats-api)
- **Filters** [Starter+]: click any metric to filter. Filter menu covers Page (including Entry and Exit page), Source, Location, Goal and Hostname. Operators are "is", "is not", "contains" and "does not contain". Multi-value filters are supported, Esc clears all — [docs/filters-segments](https://plausible.io/docs/filters-segments)
- **Saved segments**: "Personal segments" are visible only to you; "Site segments" are visible to all team members with dashboard access (launched Mar 6, 2025) — [docs/filters-segments](https://plausible.io/docs/filters-segments); [changelog](https://plausible.io/changelog). Tiers: saved segments Starter+, shared segments Growth+ — [plausible.io home](https://plausible.io/)
- **Annotations** on the traffic chart, personal or shared (Jul 14, 2026). Personal notes are Starter+, shared annotations Growth+ — [changelog](https://plausible.io/changelog); [plausible.io home](https://plausible.io/)
- **Shared links** [Growth+]: a private, hard-to-guess URL that needs no Plausible login. **Password protection** is optional and can be set only at creation. A link can be **Limited to segment**: viewers can add filters on top but cannot remove the segment. Viewers don't count toward team limits. Links are managed under Site settings > Visibility — [docs/shared-links](https://plausible.io/docs/shared-links). Starter has "No team or sharing features" — [docs/subscription-plans](https://plausible.io/docs/subscription-plans)
- **Public stats**: make the dashboard viewable by anyone with the link — [docs/your-plausible-experience](https://plausible.io/docs/your-plausible-experience)
- **Embedded dashboard** [Growth+]: an iframe generated from a shared link, unbranded, so it can be white-labelled. Themes are light, dark or system. Background is a custom color or `transparent`. Default max width is 1024px, and `&width=manual` removes it. Password-protected links cannot be embedded — [docs/embed-dashboard](https://plausible.io/docs/embed-dashboard)
- **Consolidated View** [Business+]: one dashboard across all sites in a team, on the All Sites page (Nov 17, 2025). Imported GA data is excluded — [changelog](https://plausible.io/changelog); [docs/google-analytics-import](https://plausible.io/docs/google-analytics-import); [plausible.io home](https://plausible.io/)
- **Dashboard appearance / dark mode**: light, dark or follow the system theme, set under Account settings > Preferences — [docs/dashboard-appearance](https://plausible.io/docs/dashboard-appearance). A "darker dark theme" shipped Nov 5, 2025 — [changelog](https://plausible.io/changelog)
- **Reports and extras**: Top Channels report (Nov 2024); a dedicated "AI Assistants" channel with historical data reclassified (Jun 10, 2026); full-URL breakdown for Top, Entry and Exit Pages (Jun 24, 2026); sort reports by metric (Sep 2024); percentage columns (Jan 2026); revenue column in expanded reports (Nov 24, 2025); sort the Sites list by traffic or domain (Mar 2026) — [changelog](https://plausible.io/changelog)
- **Sites page**: the list of all sites with traffic sparklines — [docs index](https://plausible.io/docs) (/docs/landing-page)
- **Hostname filtering and blocking** (Apr 2024), **VPN traffic grouped separately** as "Anonymous VPN Service", and **country-level blocking** (Feb 2024) — [changelog](https://plausible.io/changelog); [vs-google-analytics](https://plausible.io/vs-google-analytics)
- **Excluding pages and traffic**: exclude pages, IPs, hostnames and countries; visitors exclude themselves via a `plausible_ignore` flag — [docs index](https://plausible.io/docs) (/docs/excluding); [data-policy](https://plausible.io/data-policy)

### Inferences
- The embed and the shared link are one mechanism, so embedded dashboards inherit the Growth+ gate and cannot be password-protected. Any embedded data is effectively public to whoever has the URL.
- Public stats (fully public dashboard) is probably also Growth+, because Starter excludes "sharing features". No page states this explicitly.

### Gaps
- The full list of date-range presets in the dashboard UI (e.g. month to date, year to date) and the keyboard-shortcut page were not fetched.
- No limit on the number of shared links or segments is documented.

## 2. Reports and notifications: email, Slack, traffic spikes and drops, CSV export

### Takeaway
Email and Slack reports and spike/drop alerts are on every tier (Starter+). CSV export is available from the dashboard (filter-aware, ZIP of top-N reports) and as a full aggregated site export. Scheduled raw event exports to S3 storage are Enterprise-only.

### Cited Findings
- **Email reports** [Starter+]: weekly (sent Mondays) and/or monthly (sent the 1st). Recipients don't count toward team limits — [docs/your-plausible-experience](https://plausible.io/docs/your-plausible-experience); [docs/subscription-plans](https://plausible.io/docs/subscription-plans); tier per [plausible.io home](https://plausible.io/) ("email/Slack reports")
- **Slack reports**: delivered by sending the email reports to a Slack channel's email address. Same weekly and monthly reports and alerts; no native Slack app — [docs/slack-reports](https://plausible.io/docs/slack-reports)
- **Traffic spike notifications**: an email or Slack alert when current visitors pass a threshold (default 10), with the current visitor count and top sources. Maximum two per site per 24 hours — [docs/slack-reports](https://plausible.io/docs/slack-reports)
- **Traffic drop alerts** added Jul 15, 2024 — [changelog](https://plausible.io/changelog)
- **Dashboard CSV export ("Export stats")**: a ZIP with one CSV per report. It follows the selected date range, filters and segments, with an "Include imported data" toggle. Most files hold the top 300 rows; pages and exit pages hold the top 100 — [docs/export-stats](https://plausible.io/docs/export-stats)
- **Full site export (Imports & Exports > Export to CSV)**: all native stats aggregated per item per day, not raw events. Queued and delivered by email. Usable after a trial or subscription ends, until data is deleted. Same format as CSV import — [docs/export-stats](https://plausible.io/docs/export-stats)
- **Scheduled raw event data exports** [Ent]: daily event-level data delivered to S3-compatible storage — [docs/export-stats](https://plausible.io/docs/export-stats); [docs/subscription-plans](https://plausible.io/docs/subscription-plans)
- **Data Studio (Looker Studio) connector** [Business+] [Cloud-only]: the official connector, built on the Stats API (Jan 21, 2025) — [changelog](https://plausible.io/changelog); [self-hosted page](https://plausible.io/self-hosted-web-analytics)

### Inferences
- Plausible has no scheduled PDF report or white-label emailed client report. Reports are fixed weekly or monthly summaries, which leaves room for a competitor offering client-ready reports for agencies.

### Gaps
- Whether email reports can be filtered or segmented, and what they contain beyond top stats, is not documented in the pages fetched.

## 3. Goals, funnels, user journeys, revenue, custom properties, ecommerce: tier requirements

### Takeaway
Goals, custom events and the automatic measurements (outbound links, downloads, form submissions, 404s, scroll depth) are Starter+. Custom properties, funnels, user journeys and revenue tracking are Business+ and Cloud-only (except custom properties, which are in CE).

### Cited Findings
- **Goals and custom events** [Starter+]: pageview goals, custom event goals (via CSS class names or JavaScript) and Scroll Depth goals (Mar 2025). Goals are editable (Aug 2024), "is not" filters work on goals (Jan 2025), and goals can be filtered by up to three custom properties (Feb 2026) — [plausible.io home](https://plausible.io/); [changelog](https://plausible.io/changelog)
- **Codeless or automatic goals**: outbound link clicks, file downloads and form submissions are toggles in Site Installation with no snippet change. 404 pages, hash routing, custom props and revenue need manual setup — [docs/script-extensions](https://plausible.io/docs/script-extensions)
- **Form submissions tracking**: once enabled, all form submissions across the site are detected and recorded under a single goal. Launched Oct 8, 2025 with the new script; the WordPress plugin had "form completion tracking" earlier (v2.2.0, Feb 2025) — [changelog](https://plausible.io/changelog); [search summary of plausible.io/docs/script-update-guide](https://plausible.io/docs/script-update-guide)
- **Other tracking guides**: email and phone link clicks, content impressions and clicks, site search, A/B tests, 404 error pages — [docs index](https://plausible.io/docs)
- **Scroll depth**: tracked automatically (Mar 10, 2025) — [changelog](https://plausible.io/changelog)
- **Time on page**: reworked as an engagement-based metric (Apr 8, 2025) — [changelog](https://plausible.io/changelog)
- **Funnels** [Business+] [Cloud-only]: 2 to 8 steps. Types are Sequential (default), Flexible (only first and last steps required, Sep 2026) and Strict (no detours, Apr 2026). Funnels can be compared across periods and show revenue per step (Sep 2026). Steps can be any page or event without creating a goal first (Nov 2, 2026), but wildcard, scroll-depth, property and revenue steps still need goals — [docs/funnel-analysis](https://plausible.io/docs/funnel-analysis); [changelog](https://plausible.io/changelog)
- **User Journeys** [Business+] [Cloud-only]: common visitor paths and drop-off points without a predefined sequence (May 27, 2026) — [changelog](https://plausible.io/changelog); [self-hosted page](https://plausible.io/self-hosted-web-analytics)
- **Ecommerce revenue tracking ("ecommerce revenue attribution")** [Business+] [Cloud-only]: a custom-event goal with revenue enabled and a fixed base currency. Purchases in any ISO 4217 currency are converted to that currency. Metrics are total revenue, average revenue, conversions and conversion rate. Sent via CSS class, JavaScript, npm `track` or the Events API — [docs/ecommerce-revenue-tracking](https://plausible.io/docs/ecommerce-revenue-tracking)
- **Shopify**: a custom pixel under Customer events tracks checkouts, purchases and revenue (Pixels integration, Oct 2024). **WooCommerce and Easy Digital Downloads** through the WordPress plugin track revenue, a purchase funnel, cart events and cart abandonment. **Magento**: third-party plugin — [docs/ecommerce-revenue-tracking](https://plausible.io/docs/ecommerce-revenue-tracking); [WP plugin page](https://wordpress.org/plugins/plausible-analytics/); [changelog](https://plausible.io/changelog)
- **Custom properties** [Business+]: up to 30 properties per event, names up to 300 characters, values up to 2,000 characters, scalar values only. Shown in the Properties tab, usable in filters and segments. Personal data is prohibited, and a recorded value can only be removed by resetting the site — [docs/custom-props](https://plausible.io/docs/custom-props/introduction)
- **Conversion attribution**: conversions are tied to UTM, `ref` and `source` campaign tags in the Campaigns tab — [docs/your-plausible-experience](https://plausible.io/docs/your-plausible-experience)

### Inferences
- Plausible's form tracking reports a count of submissions as a goal. It does not capture lead content or contact details, and could not, given its no-personal-data policy (custom properties prohibit names, emails and phone numbers). A product that tracks form leads is a clear differentiator here.
- WooCommerce revenue through the WP plugin presumably needs a Business plan, since revenue goals are Business+. The plugin page does not state this.

### Gaps
- No documented limit on the number of goals or funnels per site.

## 4. Installation and integrations

### Takeaway
The official integrations are the script snippet, WordPress plugin, Google Tag Manager template, npm package, Events API and Looker Studio connector. Wix, Squarespace, Webflow, Ghost and Shopify are covered only by community guides. A first-party proxy is documented for 7 stacks, and a managed CNAME proxy is Enterprise-only.

### Cited Findings
- **Tracking snippet**: placed in `<head>`; site-specific script with optional measurements toggled in Site settings > General > Tracking > Site installation. An **integration testing tool** verifies installation (May 2024) — [docs/plausible-script](https://plausible.io/docs/plausible-script); [changelog](https://plausible.io/changelog)
- **Script size**: 2.5 KB versus GA's 135 KB gzipped, "54 times smaller" — [vs-google-analytics](https://plausible.io/vs-google-analytics)
- **New script** (Oct 8, 2025): toggleable measurements, automatic form submission tracking, `plausible.init()` options (`endpoint`, `hashBasedRouting`, `fileDownloads`, `outboundLinks`, `customProperties`, `formSubmissions`, `captureOnLocalhost`, `autoCapturePageviews`, `logging`, `transformRequest`). Query strings are stripped except `ref`, `source` and `utm_*` — [changelog](https://plausible.io/changelog); [docs/script-extensions](https://plausible.io/docs/script-extensions)
- **New-script breaking changes**: drops the `data-api` custom-endpoint attribute and sending to multiple dashboards at once; the legacy script remains for those cases — [search summary of plausible.io/docs/script-update-guide](https://plausible.io/docs/script-update-guide)
- **Official integrations**: snippet, WordPress plugin, Google Tag Manager template (official template since Oct 2025), Data Studio connector (Business), NPM package, Events API — [docs/integration-guides](https://plausible.io/docs/integration-guides); [changelog](https://plausible.io/changelog)
- **NPM package**: bundles the tracker, so the site's script changes only when the package is updated — [docs/plausible-script](https://plausible.io/docs/plausible-script)
- **Official WordPress plugin "Plausible Analytics"**: v2.6.4, 10,000+ active installs, last modified Oct 22, 2026, rated 5/5 (29 reviews), requires WP 5.9+ and PHP 7.2+. Features:
  - one-click **proxy** to bypass adblockers
  - **stats inside WP admin**, with access configurable per user role
  - enhanced measurements: downloads, outbound and affiliate (cloaked) links, form submissions and completions, site search, 404s
  - **Search Console queries**
  - **WooCommerce and EDD revenue**, purchase funnel, cart abandonment
  - role-based tracking exclusion (admins not tracked by default)
  - UTM tracking, custom events, email and Slack reports, spike notifications, shareable dashboards
  - WPML and TranslatePress support; works with self-hosted CE
  
  — [wordpress.org plugin page](https://wordpress.org/plugins/plausible-analytics/)
- **Community guides** (not maintained by Plausible): Wix, Squarespace, Webflow, Ghost, Shopify, HubSpot, Hugo, NextJS, Carrd, Docusaurus and others. Community plugins: Drupal, Craft, Kirby, Magento, PrestaShop, Shopware, Statamic, TYPO3, Sanity and more. Frameworks: Gatsby, Nuxt, Vue, Django, Laravel, Jekyll, Elixir, Go, Ruby. Mobile: Android SDK, Flutter, Swift. Stripe, Paddle, Lemon Squeezy and Polar; Grafana, n8n, Prometheus. **Framer and Joomla are not listed** — [docs/integration-guides](https://plausible.io/docs/integration-guides)
- **Bypass adblockers (proxy)**: guides for Cloudflare, Vercel, Netlify, Nginx, Apache, Caddy and Laravel, plus the WP plugin's built-in proxy. Without a proxy, strict blockers may miss 5–25% of visitors. The visitor IP must be forwarded (`X-Forwarded-For`, and `CF-Connecting-IP` on Cloudflare), or bot filtering silently drops events — [docs/proxy/introduction](https://plausible.io/docs/proxy/introduction)
- **Managed Proxy** [Ent]: Plausible-run proxy set up with a CNAME (Jul 8, 2025) — [docs/proxy/introduction](https://plausible.io/docs/proxy/introduction); [changelog](https://plausible.io/changelog)
- **Consent management platforms**: Plausible can run outside the banner. Docs cover Cookiebot (`data-cookieconsent="ignore"`), Usercentrics, OneTrust, Cookie Information and GTM ("No additional consent required") — [docs/consent-management-platforms](https://plausible.io/docs/consent-management-platforms)
- **Google Analytics import** [Starter+]:
  - GA4 import: daily aggregates for up to 5 GA properties per dashboard, covering the period before the first Plausible data, with no overlap.
  - Not imported: goals (must be recreated), revenue, exit pages, scroll depth, browser versions, hourly data.
  - Imported data can be hidden ("Include imported data") and is excluded from the Consolidated View.
  
  — [docs/google-analytics-import](https://plausible.io/docs/google-analytics-import). GA4 and UA could both be imported into the same dashboard (Apr 23, 2024), with GA4 custom events importable (May 2024) — [changelog](https://plausible.io/changelog)
- **CSV import**: import stats from CSV (May 2024). Uses the same format as Plausible's own export — [changelog](https://plausible.io/changelog); [docs/export-stats](https://plausible.io/docs/export-stats)
- **Google Search Console integration**: Sources > Google shows search terms with clicks, and the expanded view adds impressions, CTR and position. Filterable by page, country and device (May 2024). Fetched live, not stored. 24–36 h lag. Only queries with at least one click are shown. Google's 50-token limit means a 51st connected site disconnects the first — [docs/google-search-console-integration](https://plausible.io/docs/google-search-console-integration); [changelog](https://plausible.io/changelog)

### Inferences
- UA import is effectively dead: Google deleted UA data in 2024, and current docs cover only GA4. This is inferred from the docs' GA4-only scope, not stated.
- Plausible's Search Console view is a keyword list inside the Sources report, not a standalone SEO dashboard. It has no trend charts for impressions or position and no impression-only queries, so a full Search Console dashboard is a real differentiator.
- For Wix targets, Plausible offers only a community guide and no official app. That is a gap a competitor with an official Wix integration could exploit.

### Gaps
- Search Console tier gating is not stated anywhere fetched. The home page lists it as a general feature.
- The exact npm package name and an official Framer guide were not confirmed.

## 5. APIs: Stats API v2, Events API, Sites API

### Takeaway
The Stats API v2 is Business+ with 600 requests per hour by default. The Events API (server-side and mobile) has no stated tier or rate limit. The Sites API (provisioning) is Enterprise-only and Cloud-only.

### Cited Findings
- **Stats API v2** [Business+]: `POST /api/v2/query`, bearer key scoped to a team (Owner, Admin, Editor or Billing roles can create keys). "600 requests per hour by default", higher on request or on Enterprise (600+).
  - Metrics: visitors, visits, pageviews, views_per_visit, bounce_rate, visit_duration, events, scroll_depth, percentage, conversion_rate, group_conversion_rate, average_revenue, total_revenue, time_on_page.
  - Dimensions: event, visit and time dimensions, plus `event:props:*`.
  - Filters: is, is_not, contains, contains_not, matches, matches_not; and/or/not; `has_done` and `has_not_done`; segments.
  - Pagination: limit 10,000.
  - Launched Oct 9, 2024; legacy v1 docs still linked.
  
  — [docs/stats-api](https://plausible.io/docs/stats-api); [plausible.io home](https://plausible.io/); [changelog](https://plausible.io/changelog)
- **Stats API playground** and "Viewing stats elsewhere" (data pipelines) docs exist — [docs index](https://plausible.io/docs)
- **Events API**: `POST /api/event` for server-side and mobile tracking.
  - Requires the visitor's User-Agent; X-Forwarded-For is optional.
  - Body: domain, name, url, referrer, up to 30 props, revenue {currency, amount}, and `interactive` (false excludes the event from bounce rate).
  - Always returns 202, with an `x-plausible-dropped` header when bot filtering rejects the event.
  - A server event joins a visit only if UA, IP and domain match within 30 minutes.
  
  — [docs/events-api](https://plausible.io/docs/events-api)
- **Sites API** [Ent] [Cloud-only]: under `/api/v1/sites`.
  - Sites: list, get, create, change domain, configure tracker script, delete.
  - Teams: list.
  - Shared links: find or create.
  - Goals and custom props: CRUD.
  - Guests: invite and remove.
  - Cursor pagination. Read-only endpoints work with a Stats API key.
  
  "Sites API is an Enterprise plan feature" — [docs/sites-api](https://plausible.io/docs/sites-api); [self-hosted page](https://plausible.io/self-hosted-web-analytics)
- **White-label integration guide** combines the Sites API, embeds and the Stats API for agencies and SaaS — [docs index](https://plausible.io/docs)

### Inferences
- Agencies managing many small-business sites cannot automate site provisioning below Enterprise. Programmatic access to stats needs at least Business.

### Gaps
- Events API rate limits and tier requirements are not documented on the page fetched.
- No Sites API rate limits are documented.

## 6. Team and admin

### Takeaway
Teams (Apr 2025) support multiple owners and five team roles plus two site-guest roles. Teams require Growth+ (Starter is solo). SAML SSO is Enterprise. Owners can enforce 2FA.

### Cited Findings
- **Teams**: create one at signup or from the account menu, belong to several, and each has its own subscription. Sites outside a team sit in "My personal sites". Teams launched Apr 1, 2025 with multiple owners, bulk invites and new roles — [docs/users-roles](https://plausible.io/docs/users-roles); [changelog](https://plausible.io/changelog)
- **Team roles**:
  - **Owner**: team, sites, subscription, 2FA enforcement, SSO; only an owner can delete the team.
  - **Admin**: members and sites; cannot grant Owner.
  - **Editor**: all dashboards plus site settings.
  - **Billing**: subscription and invoices.
  - **Viewer**: dashboards only, no API keys.
  
  **Site guest roles**: **Guest Editor** and **Guest Viewer**, per site — [docs/users-roles](https://plausible.io/docs/users-roles)
- **Limits**: sites 1 / 3 / 10 / 10+ and team members solo / 3 / 10 / 10+ for Starter / Growth / Business / Enterprise. Team members, guests and pending invites count; report recipients and shared-link viewers don't — [plausible.io home](https://plausible.io/); [docs/subscription-plans](https://plausible.io/docs/subscription-plans)
- **Two-factor authentication**: per account, and team owners can require 2FA for all members (Nov 5, 2025, with a security overview) — [docs index](https://plausible.io/docs) (/docs/2fa); [changelog](https://plausible.io/changelog)
- **Login management**: remote logout of active sessions (Sep 30, 2024) — [changelog](https://plausible.io/changelog)
- **Single Sign-On** [Ent] [Cloud-only]: SAML 2.0, with guides for Google Workspace, Okta and Entra ID. Includes "Force Single Sign-On", just-in-time provisioning (default role Viewer) and domain verification by DNS TXT, file or meta tag (Jul 29, 2025) — [docs/sso](https://plausible.io/docs/sso); [changelog](https://plausible.io/changelog)
- **Recover access / transfer ownership**: a documented process when an owner is unavailable. Docs recommend at least two owners — [docs/users-roles](https://plausible.io/docs/users-roles); [docs index](https://plausible.io/docs) (/docs/transfer-account-ownership)
- **Agencies and freelancers** guide exists — [docs index](https://plausible.io/docs)

### Inferences
- The guest model (Guest Viewer) lets an agency give clients access to one site without full team membership, but guests still count toward the member limit.

### Gaps
- SCIM provisioning is not mentioned in the SSO docs.
- Site-transfer steps between teams were not captured.

## 7. Privacy and compliance

### Takeaway
Plausible runs without cookies, using a daily-rotating salted hash, and markets "no consent banner needed" plus GDPR, CCPA and PECR compliance. It is EU-owned (Estonia) and EU-hosted (Hetzner in Germany, UpCloud in Finland, Bunny in Slovenia), with an automatic DPA. The ePrivacy Art. 5(3) question for cookieless analytics is not addressed by Plausible and remains contested.

### Cited Findings
- **Cookieless operation**: "We do not use cookies, browser cache or local storage to identify visitors." The visitor ID is hash(daily_salt + website_domain + ip_address + user_agent), and the "salt is rotated and deleted every 24 hours". No tracking across devices, sites or apps. Raw IPs and UA strings are not stored — [data-policy](https://plausible.io/data-policy)
- **Compliance claims**: GDPR, CCPA and PECR compliance; "you do not need cookie banners for analytics or to collect consent for tracking". Backed by a legal assessment by a data-protection expert, linked from the data policy — [data-policy](https://plausible.io/data-policy)
- **Compliance page**: "A DPA is in place automatically for all customers", as part of the ToS, with no signature needed and a signed copy on request. CAIQ Lite and VPAT 2.5 are available on request; there is a vulnerability disclosure program. No certifications (ISO 27001, SOC 2) are named. Plausible is "typically classified as a low-risk service" — [docs/compliance](https://plausible.io/docs/compliance)
- **DPA terms**: breach notification within 48 hours; daily salts deleted every 24 h; encryption, HTTPS, firewalls, bcrypt; renewable-energy servers in Germany; subprocessor changes announced with a right to object — [dpa](https://plausible.io/dpa)
- **EU hosting and subprocessors**: Hetzner (Germany; servers in Falkenstein), UpCloud (Finland; database hosting and exports) and Bunny (Slovenia; CDN), "the only three providers that touch visitor data", all EU-owned. "No US parent company, no US investors with board control, and no US infrastructure". Incorporated in Estonia; 22,000 paying subscribers; "Funded entirely by our subscribers" — [eu-hosted-web-analytics](https://plausible.io/eu-hosted-web-analytics)
- **Legal entity**: Plausible Insights OÜ, Tartu, Estonia (from a search-result summary of the privacy policy, not fetched directly) — [privacy](https://plausible.io/privacy)
- **Data retention**: "no limit while you're subscribed" (vs GA4's 2 or 14 months) — [vs-google-analytics](https://plausible.io/vs-google-analytics). Starter shows "No retention limit" — [plausible.io home](https://plausible.io/). **Conflict**: a competitor's Sept 2026 article lists 3 years (Starter, Growth) and 5 years (Business) — [arktis.so](https://arktis.so/learning-hub/plausible-pricing). After a trial or subscription lapses, data is deleted after notice — [dpa](https://plausible.io/dpa)
- **ePrivacy caveat**: Plausible's CMP doc does not address stricter interpretations — [docs/consent-management-platforms](https://plausible.io/docs/consent-management-platforms). EDPB Guidelines 2/2023 on the technical scope of ePrivacy Art. 5(3) (v2 adopted 7 Oct 2024) are technology-neutral, not cookie-only. Consultation responses (e.g. from Matomo's side) warned that the passage on HTTP headers and user agent could be read as disallowing "cookieless" analytics without consent — [Hunton summary](https://www.hunton.com/privacy-and-cybersecurity-law-blog/edpb-adopts-guidelines-on-scope-of-eprivacy-directive); [EDPB consultation reply](https://www.edpb.europa.eu/sites/default/files/webform/public_consultation_reply/cookieinformation-piwikpro_public_hearing_edpb_guidelines.pdf); [EDPB guidelines v2 PDF](https://edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf)
- **Bot filtering**: "about 32K data center IP ranges" ([self-hosted page](https://plausible.io/self-hosted-web-analytics)) versus "around 40,800 data center IP ranges" ([vs-google-analytics](https://plausible.io/vs-google-analytics)). The two official pages conflict.

### Inferences
- Plausible's "no banner" claim is vendor-asserted, and its docs defer to "your legal team". A competitor making the same cookieless claim faces the same Art. 5(3) ambiguity. Parity is likely; superiority is hard to claim.
- "EU-owned, no US investors" is a marketing pillar. A competing EU product needs equivalent subprocessor transparency (a named list with countries) to match it.

### Gaps
- No authoritative final reading of how EDPB 2/2023 treats cookieless analytics was found. National DPA positions (e.g. CNIL's audience-measurement exemption) were not researched.
- An official subprocessor list page and certifications were not found.

## 8. Hosting: Plausible Cloud vs Community Edition

### Takeaway
CE is AGPLv3 and self-hosted, released about twice a year, with community support only. It excludes funnels, user journeys, revenue goals, SSO, the Sites API and the Data Studio connector, and has only basic bot filtering.

### Cited Findings
- Cloud vs CE (from Plausible's own comparison):
  - **Infrastructure**: Plausible-managed vs self-run.
  - **Releases**: "multiple times per week" vs long-term releases "twice per year".
  - **Excluded from CE**: marketing funnels, user journeys, ecommerce revenue goals, SSO, Sites API, Data Studio Connector.
  - **Bot filtering**: advanced (~32K data-center ranges) vs basic UA and referrer-spam lists.
  - **Data location**: EU-owned infrastructure in Germany vs anywhere.
  - **Support**: human support vs community-only.
  - **Security fixes**: immediate vs whenever you upgrade.
  
  — [self-hosted-web-analytics](https://plausible.io/self-hosted-web-analytics)
- **License**: AGPLv3 — [self-hosted-web-analytics](https://plausible.io/self-hosted-web-analytics)
- **Recent CE releases**:
  - v3.0.0 (Apr 2025): teams, Editor and Billing roles, segments, scroll depth, time-on-page rework, channels; "site and team member limits unlimited for CE".
  - v3.1.0 (Nov 2025): configurable script, `interactive` events, enforced 2FA, new dark theme.
  - v3.2.0 (Jan 2026): shared links limited to segment, percentage breakdowns.
  - v3.2.1 (May 2026): security patch for CVE-2026-8467 (RCE via the `/storybook` endpoint).
  
  — [GitHub releases](https://github.com/plausible/analytics/releases)

### Inferences
- Custom properties, segments, Search Console and GA import appear to remain in CE; only the listed premium features are carved out. CE has no site or member limits.

### Gaps
- Whether consolidated views and annotations are in CE was not confirmed.

## 9. Pricing as of 2026

### Takeaway
There are four tiers (Starter, Growth, Business, Enterprise), priced by monthly pageviews plus custom events across all of a team's sites. At 10k: $9, $14 and $19 per month; Enterprise is custom. Yearly billing gives 2 months free. The trial is 30 days, no card, with Business features. Nonprofits get 15% off annual Business.

### Cited Findings
- **Tiers at 10k pageviews (official)**: Starter $9/mo (1 site), Growth $14/mo (3 sites, 3 members), Business $19/mo (10 sites, 10 members), Enterprise custom (10+). Slider runs from 10k to 10M+; "2 months free" yearly; 30-day trial, no credit card — [plausible.io home](https://plausible.io/)
- **Tier features (official)**:
  - **Starter**: dashboard, unlimited retention, email and Slack reports, GA import, goals and custom events, saved segments, annotations.
  - **Growth**: adds team management, shared links, embedded dashboards, shared segments, shared annotations.
  - **Business**: adds custom properties, Stats API (600 requests/h), Data Studio connector, ecommerce revenue attribution, funnels and user journeys, consolidated view.
  - **Enterprise**: adds 600+ requests/h, Sites API, SSO, managed proxy, scheduled raw event exports, priority support.
  
  — [plausible.io home](https://plausible.io/); [docs/subscription-plans](https://plausible.io/docs/subscription-plans)
- **Higher pageview levels (third-party, captured 24 Sept 2026, monthly USD, Starter / Growth / Business)**:
  - 100k: $19 / $29 / $39
  - 200k: $29 / $44 / $59
  - 500k: $49 / $74 / $99
  - 1M: $69 / $104 / $139
  - 2M: $89 / $134 / $179
  - 5M: $129 / $194 / $259
  - 10M: $169 / $254 / $339
  
  Yearly is 10× monthly — [arktis.so](https://arktis.so/learning-hub/plausible-pricing) (a competitor's article, not verified against Plausible). **Conflict**: [pricingpeel](https://pricingpeel.pages.dev/peels/01-plausible/) lists Growth $14 at 100k and Business $19 at 500k, which looks like a misreading of the slider. Treat the Arktis table as the better but unofficial figures.
- **Billing basis**: pageviews plus custom events across all sites in the team (pageview goals don't count). Each team is billed separately — [docs/subscription-plans](https://plausible.io/docs/subscription-plans)
- **Overage policy**:
  - One month over: nothing happens.
  - Two consecutive months over: you are asked to upgrade.
  - No upgrade within a week: dashboards are locked, but data keeps being collected.
  - No overage charges.
  
  — [docs/subscription-plans](https://plausible.io/docs/subscription-plans)
- **Nonprofit and education**: 15% off Business plans on annual billing for nonprofits, educational institutions and OSS projects — [docs/subscription-plans](https://plausible.io/docs/subscription-plans)
- **No free tier**: "subscription to cover costs", trial only — [vs-google-analytics](https://plausible.io/vs-google-analytics)

### Inferences
- A small business needing form-goal tracking alone can use Starter ($9). Needing custom properties, revenue or funnels pushes it to Business ($19+ at 10k; about $39 at 100k per the third-party table). An agency with more than 10 sites hits Enterprise.

### Gaps
- Official prices above the 10k level could not be fetched (the slider is rendered by JavaScript). Exact yearly figures and EUR pricing were not confirmed. When Starter was introduced and the prior price history were not confirmed.

## 10. Notable product changes 2024–2026

### Takeaway
Plausible has moved from a "simple dashboard" toward mid-market features: teams, SSO, segments, funnels, user journeys, a consolidated view, revenue in reports, and a new configurable script with automatic form tracking.

### Cited Findings (all from [changelog](https://plausible.io/changelog) unless noted)
- **2024**:
  - Jan: improved bot detection (UA blocking, data-center filtering).
  - Feb: multiple custom-prop filters; VPN grouping; country blocking; new logo.
  - Mar: conversion-rate trend views.
  - Apr: hostname filtering; GA4 and UA import.
  - May: CSV export and import; GA4 custom-event import; Search Console filters; integration testing tool.
  - Jun: "does not contain" operator; imported-data filtering and export.
  - Jul: traffic drop alerts; editable funnels.
  - Aug: editable goals; full browser and OS data.
  - Sep: checklist-based enhanced-measurement setup; report sorting; remote logout.
  - Oct: Shopify Pixels integration; **Stats API v2**; comparison arrows.
  - Nov: **Top Channels** report.
- **2025**:
  - Jan: "is not" goal filter; **Looker Studio connector**.
  - Feb: WP plugin 2.2.0 form-completion tracking.
  - Mar: **saved segments**; **scroll depth** and Scroll Depth goals.
  - Apr: **Teams** (multiple owners, new roles); reworked **Time on Page**.
  - Jul: **Managed Proxy** (Ent); **SAML SSO**.
  - Oct: **new script** with toggles, auto form tracking, official GTM template.
  - Nov: enforced 2FA, security overview, darker dark theme; **Consolidated Views**; revenue column in expanded reports.
- **2026**:
  - Jan 5: shared links limited to segment, percentage columns, Enterprise raw event exports. Listed under the 2025 heading in the fetched text; CE v3.2.0 shipped the same features 26 Jan 2026 ([GitHub releases](https://github.com/plausible/analytics/releases)).
  - Feb: goals filterable by up to 3 props; "Last 24 Hours" range.
  - Mar: Sites list sorting.
  - Apr: strict-order funnels.
  - May 27: **User Journeys**.
  - Jun: **AI Assistants channel**; full-URL page breakdown.
  - Jul 14: **Annotations**.
  - Sep: funnel period comparison and revenue in funnels; flexible funnels.
  - Nov 2: funnels from any page or event without goals.

### Inferences
- AI-assistant referral tracking (ChatGPT and others) is now a marketed feature on the home page, and a competitor should match it.

### Gaps
- None material. The changelog was fetched directly.

## 11. Known limitations and criticisms

### Takeaway
By design Plausible has no user-level data, no cross-day returning-visitor identity, no cross-site journeys, no session replay or heatmaps, no free tier, and limited attribution. Advanced features (props, funnels, revenue, API) are gated at Business+. The Search Console and GA import features are shallow.

### Cited Findings
- **24-hour visitor identity**: the salt rotates every 24 h, so the same person on different days counts as a new visitor. There is no cross-device or cross-site tracking — [data-policy](https://plausible.io/data-policy)
- **Self-declared poor fit**: "If you need session replay, user-level product analytics, retargeting or free hosted analytics" Plausible "is not the right fit" — [vs-google-analytics](https://plausible.io/vs-google-analytics)
- **Third-party reviews**: a poor fit for user-level behavior analytics, complex funnels and heavy attribution modeling across paid channels — [Haalytics review](https://haalytics.pages.dev/reviews/plausible-analytics-review/) (affiliate site). Limited advanced customization and integrations — [SpotSaaS](https://www.spotsaas.com/product/plausible-analytics). "Not as powerful as GA" — [Capterra reviews](https://www.capterra.com/p/187430/Plausible-Insights/reviews/). G2 rating 4.5/5 from only 4 reviews — per a search summary; [G2](https://g2.com/products/plausible-analytics/reviews/plausible-analytics-review-6833777)
- **Search Console limits**: clicks-only queries, Google sampling, a 50-site token cap, no stored history (fetched live) — [docs/google-search-console-integration](https://plausible.io/docs/google-search-console-integration)
- **GA import limits**: daily aggregates only; no goals, revenue, exit pages or scroll depth; limited advanced segmentation on imported data — [docs/google-analytics-import](https://plausible.io/docs/google-analytics-import)
- **Adblock loss** of 5–25% without a proxy, and proxy misconfiguration silently drops events — [docs/proxy/introduction](https://plausible.io/docs/proxy/introduction)
- **Embeds can't be password-protected** — [docs/embed-dashboard](https://plausible.io/docs/embed-dashboard)
- **Custom-property values can't be deleted individually** (only by resetting the site) — [docs/custom-props](https://plausible.io/docs/custom-props/introduction)
- **Server-side events** join a visit only within 30 minutes with an identical UA and IP — [docs/events-api](https://plausible.io/docs/events-api)

### Inferences
- Attribution is effectively visit-level: no multi-touch, and no attribution across days because identity resets daily.
- No lead-level form data, no heatmaps and no session recordings, consistent with the privacy model.
- Gating custom properties, revenue and funnels at Business ($19+/mo) is a pricing lever a competitor targeting small businesses can undercut.

### Gaps
- Few independent, non-affiliate reviews from 2025–2026 were found. Most criticism comes from competitor or affiliate sites.
