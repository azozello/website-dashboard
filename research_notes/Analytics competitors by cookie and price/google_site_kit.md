# Google Site Kit (WordPress plugin): metrics and features as of November 2026

Scope: what Site Kit shows inside WordPress admin and what it adds on top of GA4, Search Console, AdSense and Ads. GA4's own catalog is out of scope. Snapshot date: 2026-11-16 (Site Kit 1.192.0 shipped that day).

Source notes:
- The GitHub releases page lists dates without years. The 2026 year is confirmed by two things: wordpress.org shows 1.192.0 on Nov 16, 2026, and PPC Land dates 1.179.0 to May 18, 2026 and 1.187.0 to Sep 7, 2026.
- Some facts come from `site-kit-dev.appspot.com`, Google's development host for the Site Kit docs. It is newer than the production docs (it already describes the Oct–Nov 2026 "Recent activity" and "Latest content" tabs), but it is a dev mirror.

## 1. Modules: what each one shows or does, and which are on by default

### Takeaway
Site Kit has 8 modules. Search Console is mandatory and cannot be disconnected. PageSpeed Insights connects automatically after setup. Analytics is offered as part of setup, and the 2026 "Setup Flow Refresh" pushes it prominently. AdSense, Tag Manager, Ads, Reader Revenue Manager and Sign in with Google are opt-in. Only Search Console, Analytics, PageSpeed and AdSense show data in WordPress. Ads, Tag Manager, RRM and Sign in with Google only place code or provide features.

### Cited Findings
- **Module list (official):** Search Console, Analytics, AdSense, PageSpeed Insights, Tag Manager, Sign in with Google, Reader Revenue Manager, Ads. — [wordpress.org plugin page](https://wordpress.org/plugins/google-site-kit/)
- **Search Console:** Shows search performance in the dashboard. The site is "added to Search Console automatically during setup". It is a required module and cannot be disconnected, though the property can be changed. Site Kit verifies ownership by uploading a virtual HTML file, falling back to an HTML meta tag. It creates a URL-prefix property if none exists. An existing Domain property is used only if the site is at the root and no URL-prefix property exists. — [SK docs: Search Console](https://sitekit.withgoogle.com/documentation/supported-services/search-console/)
- **Search Console permissions:** Setup grants the admin who sets it up Owner permission in Search Console. — [SK docs: Permissions](https://sitekit.withgoogle.com/documentation/advanced/permissions/)
- **Analytics (GA4):** You select an existing account, property and web data stream, or Site Kit creates new ones. Site Kit creates a Google tag if none exists. If it detects an existing snippet, you can connect without letting Site Kit insert one. Settings:
  - "Place Google Analytics code" (on by default when no snippet is detected)
  - "Exclude logged-in users" (on by default)
  - Enhanced measurement toggle
  - Plugin conversion tracking
  - Google tag gateway for advertisers

  — [SK docs: Analytics](https://sitekit.withgoogle.com/documentation/supported-services/analytics/)
- **Analytics permissions:** Other admins need at least Viewer role on the property. Changing the property requires Editor or Administrator. — [SK docs: Permissions](https://sitekit.withgoogle.com/documentation/advanced/permissions/)
- **PageSpeed Insights:** "Automatically connected once plugin setup is complete" and needs no permissions. It shows field data (CrUX, real users, past 28 days, "In the Field" tab) and lab data ("In the Lab" tab), with scores for mobile and desktop and a "How to improve" tab that includes WordPress-specific suggestions. Data is fetched only when someone opens the plugin dashboard. — [SK docs: PageSpeed Insights](https://sitekit.withgoogle.com/documentation/supported-services/pagespeed-insights/)
- **PageSpeed in the dashboard:** The Speed tab covers the homepage, or the selected page via URL Search, and links to "View details at PageSpeed Insights". — [SK docs: Dashboard how-to](https://sitekit.withgoogle.com/documentation/how-tos/how-to-use-the-site-kit-dashboard/)
- **AdSense:**
  - Connects an existing account or creates one.
  - Can insert the Auto ads snippet, and always places AdSense `<meta>` verification tags.
  - "Exclude from Ads" hides ads from logged-in users (on by default) or from users who can write posts.
  - Ad blocking recovery has 2 steps: a standard recovery message with an optional error-protection code, then a custom message the publisher creates in AdSense Privacy & messaging.
  - Ad units cannot be created in Site Kit.

  — [SK docs: AdSense](https://sitekit.withgoogle.com/documentation/supported-services/adsense/)
- **AdSense dashboard ("Monetization" tab):** Earnings, RPM, Impressions, Page CTR, plus a "Top earning pages" widget that requires Analytics and AdSense to be linked. — [SK docs: Dashboard how-to](https://sitekit.withgoogle.com/documentation/how-tos/how-to-use-the-site-kit-dashboard/)
- **Tag Manager:** Selects an existing container or creates one, and places the GTM snippet (can be turned off). It warns if a container is already on the site and shows no metrics. Google recommends Site Kit's Analytics module over GA tags inside GTM, because otherwise Site Kit's custom dimensions can go missing. — [SK docs: Tag Manager](https://sitekit.withgoogle.com/documentation/supported-services/tag-manager/)
- **Ads (Google Ads):** Places the Ads Conversion ID. Offers optional 1-click "Plugin conversion tracking" and "Google tag gateway for advertisers". Has "in-plugin campaign creation": a guided flow for business name, conversion goal, ad copy, images, search terms, location and budget, with billing finished in Google Ads. If WooCommerce is active, it suggests the Google for WooCommerce plugin instead. — [SK docs: Ads](https://sitekit.withgoogle.com/documentation/supported-services/ads/)
- **Ads and RRM show no data:** "Site Kit doesn't display their data". — [SK docs: Permissions](https://sitekit.withgoogle.com/documentation/advanced/permissions/)
- **Ads Conversion tracking card:** Added in 1.190.0 (Oct 19, 2026, new). — [GitHub releases](https://github.com/google/site-kit-wp/releases)
- **Reader Revenue Manager (RRM):** Connects a Google Publisher Center publication and places its code. Publishers can add newsletter signups, surveys, registration prompts, and one-time or monthly contributions/subscriptions.
  - CTA placement: specific content types, specified pages (the default), or site-wide.
  - Blocks: "Contribute with Google" and "Subscribe with Google".
  - Per-post panel: keep default / exclude from RRM / "open access".
  - Google review takes up to 2 weeks. Google takes a 5% transaction fee. No metrics are shown.

  — [SK docs: RRM](https://sitekit.withgoogle.com/documentation/supported-services/reader-revenue-manager/)
- **RRM changes in 2026:** An "express setup" flow (create publication, Terms of Service, policies, newsletter sign-up) arrived in 1.185.0–1.188.0 (Aug–Sep 2026, new). — [GitHub releases](https://github.com/google/site-kit-wp/releases)
- **Sign in with Google:** Visitors sign in or register with a Google account. The button can appear on the WP login page (including WooCommerce login), next to comments, via a block, or via the shortcode `[site_kit_sign_in_with_google]`. One Tap is optional and off by default. Settings cover button text, theme and shape. It requires a Google Cloud OAuth client ID. New users get the default WP role. — [SK docs: Sign in with Google](https://sitekit.withgoogle.com/documentation/supported-services/sign-in-with-google/)
- **Sign in with Google changes:** 2026 updates added:
  - linking existing WP users to a Google account (1.182.0, Jun 29, 2026)
  - two-factor auth handling (1.185.0)
  - support for WooCommerce open registration (1.186.0)

  — [GitHub releases p.2](https://github.com/google/site-kit-wp/releases?page=2); [GitHub releases](https://github.com/google/site-kit-wp/releases)
- **Sign in with Google existed by 1.141.0:** That release already enhanced it (WooCommerce login page, popup login, One Tap info). — [newreleases.io 1.141.0](https://newreleases.io/project/github/google/site-kit-wp/release/1.141.0)

### Inferences
- Default state after a fresh install: Search Console and PageSpeed Insights are on. Analytics is very likely on for most users, since setup now leads with it. The other 5 modules are opt-in.
- For a Rate 1 comparison, only 4 modules produce dashboard data. Ads, Tag Manager, RRM and Sign in with Google are tag-placement or monetization utilities with no analytics surface.

### Gaps
- Exact launch dates of the Ads, RRM and Sign in with Google modules were not confirmed from a primary source (only "existed by 1.141.0" for Sign in with Google).
- The PageSpeed docs do not name the individual Core Web Vitals shown. From prior knowledge (unverified here), they are LCP, INP and CLS for field data, plus TBT for lab data.

## 2. Search Console in Site Kit

### Takeaway
Site Kit shows only Total Impressions and Total Clicks from Search Console, plus a top-queries list and the "Top performing keywords" Key Metric. These appear on a funnel with GA4's "Unique Visitors from Search" and "Conversions" (key events). Neither the official nor the dev docs list CTR or average position on the current dashboard. Date ranges are 7, 14, 28 (default) or 90 days, compared with the previous period. A 90-day cap applies throughout.

### Cited Findings
- **"Search traffic" widget (search funnel):**
  - Total Impressions (Search Console)
  - Total Clicks (Search Console)
  - Unique Visitors from Search (Analytics)
  - Conversions, also called "Key Events" (Analytics)

  Clicking a metric shows a chart compared with the previous period of equal length. — [SK docs: Dashboard how-to](https://sitekit.withgoogle.com/documentation/how-tos/how-to-use-the-site-kit-dashboard/); [SK dev docs: Using the dashboard](https://site-kit-dev.appspot.com/documentation/using-site-kit/using-the-site-kit-dashboard/)
- **No CTR or average position:** The dev docs state that "CTR, average position, and engagement rate don't appear in this search funnel". — [SK dev docs](https://site-kit-dev.appspot.com/documentation/using-site-kit/using-the-site-kit-dashboard/)
- **Top search queries:** The Content tab's "How your content is doing" shows top search queries from Search Console. — [SK docs: Dashboard how-to](https://sitekit.withgoogle.com/documentation/how-tos/how-to-use-the-site-kit-dashboard/)
- **Key Metric tile "Top performing keywords":** "What people searched for before they came to your site". — [GitHub: key-metrics-widgets.js](https://github.com/google/site-kit-wp/blob/develop/assets/js/components/KeyMetrics/key-metrics-widgets.js)
- **Date ranges:** Default is the last 28 days. Options are 7, 14, 28 and 90 days. — [SK docs: Dashboard how-to](https://sitekit.withgoogle.com/documentation/how-tos/how-to-use-the-site-kit-dashboard/)
- **Per-page Search Console stats:**
  - URL Search filters the whole dashboard to one page.
  - The admin bar shows Total Impressions and Total Clicks for the current URL over the last 28 days.

  — [SK docs: Page-specific metrics](https://sitekit.withgoogle.com/documentation/features/page-specific-metrics/)
- **WP admin dashboard widget:** Shows Search Console total impressions and total clicks. — [SK docs: Dashboard sharing](https://sitekit.withgoogle.com/documentation/features/dashboard-sharing/)
- **Data delay:** A "gathering data" message can last "up to approximately 48 hours" after connecting. — [SK docs: Search Console](https://sitekit.withgoogle.com/documentation/supported-services/search-console/)
- **"Recent activity" tab (new, 1.190.0, Oct 19, 2026):** Shows "traffic and search performance" since yesterday, with data lag up to 6 hours. — [GitHub releases](https://github.com/google/site-kit-wp/releases); [SK dev docs](https://site-kit-dev.appspot.com/documentation/using-site-kit/using-the-site-kit-dashboard/)
- **Yoast integration (Jan 2026):** Yoast SEO's dashboard can show Search Console and GA data via Site Kit. Seen in search results only; the page was not fetched. — [Yoast, Jan 7, 2026](https://yoast.com/yoast-seo-january-7-2026/)

### Inferences
- History available in the UI is 90 days maximum, the largest selectable range; Key Metrics also references a "90-day maximum reporting period". Search Console itself keeps 16 months, so Site Kit uses only a fraction of it.
- Rate 1's Search Console dashboard can beat Site Kit on CTR, average position, longer history and query-per-page drill-down, none of which Site Kit documents on its dashboard.

### Gaps
- The columns of the top-queries table are not documented. Prior knowledge suggests clicks and impressions only; not verified.
- No per-post Search Console column in the WP posts list or the editor is documented.

## 3. Analytics in Site Kit: dashboard metrics, Key Metrics, Visitor groups

### Takeaway
The dashboard has these tabs: Key metrics, Traffic, Site goals, Content, Speed, Monetization, plus Recent activity and Latest content added in Oct–Nov 2026. Analytics metrics are mostly unique visitors, channels, countries, devices, and top content with pageviews, sessions, engagement rate and session duration. "Key Metrics" is a user-chosen grid of 2 to 8 tiles from a catalog of 44 widgets. "Visitor groups" turns GA4 audiences into per-audience cards. Site Kit can create "New visitors" and "Returning visitors" audiences in GA4 for you.

### Cited Findings: main dashboard
- **Header:**
  - URL Search (per-page filter)
  - Reporting period (7/14/28/90 days, default 28)
  - Icons for Email reports, PDF download and Dashboard sharing

  — [SK docs: Dashboard how-to](https://sitekit.withgoogle.com/documentation/how-tos/how-to-use-the-site-kit-dashboard/)
- **Traffic tab:**
  - "Traffic overview" graph of unique visitors.
  - Traffic breakdown by channel: Referral, Organic Search, Organic Social, Direct, Unassigned, **AI assistant**, Others.
  - By location: top 5 countries plus "Others".
  - By device: desktop, mobile, tablet.
  - "Search traffic" funnel.
  - "Visitor groups" (hidden by default).

  — [SK docs: Dashboard how-to](https://sitekit.withgoogle.com/documentation/how-tos/how-to-use-the-site-kit-dashboard/)
- **Traffic Overview widget (new, 1.189.0, Oct 5, 2026):** Replaced the "All Traffic" widget and adds a daily chart. — [GitHub releases](https://github.com/google/site-kit-wp/releases)
- **Content tab:**
  - "Top content": pageviews, sessions, engagement rate, session duration.
  - "Latest content" (new, 1.191.0, Nov 2, 2026): the 10 newest posts or products with the same 4 metrics.

  — [SK docs: Dashboard how-to](https://sitekit.withgoogle.com/documentation/how-tos/how-to-use-the-site-kit-dashboard/); [SK dev docs](https://site-kit-dev.appspot.com/documentation/using-site-kit/using-the-site-kit-dashboard/); [GitHub releases](https://github.com/google/site-kit-wp/releases)
- **Recent activity (new, Oct 2026):**
  - Site traffic since yesterday
  - Top posts by visitors
  - Top channels
  - Top referrals
  - Latest post or product performance (visitor breakdown, traffic sources, engagement and outcomes)

  Data lags up to 6 hours. A setting includes WooCommerce products. — [SK dev docs](https://site-kit-dev.appspot.com/documentation/using-site-kit/using-the-site-kit-dashboard/); [GitHub releases](https://github.com/google/site-kit-wp/releases)
- **New Analytics dimensions:** `landingPage` and `sessionCampaignName` added in 1.191.0 (Nov 2, 2026). — [GitHub releases](https://github.com/google/site-kit-wp/releases)
- **WordPress admin "Site Kit Summary" widget:**
  - Total Unique Visitors
  - Avg. Time on Page
  - Unique visitors over 28 days vs the prior 28 days
  - Top Content

  It can be turned off with a new setting and filter (1.192.0). — [SK docs: Analytics](https://sitekit.withgoogle.com/documentation/supported-services/analytics/); [GitHub releases](https://github.com/google/site-kit-wp/releases)
- **No real-time GA4 data:** Not available in the dashboard. Counts use `totalUsers`, so they can differ from the GA UI. — [SK docs: Analytics](https://sitekit.withgoogle.com/documentation/supported-services/analytics/)

### Cited Findings: Key Metrics
- **How it works:**
  - Pick 2 to 8 tiles, either manually ("Select/Change Metrics") or from a 3-question questionnaire: the site's main purpose (site-wide), publishing frequency (per user), and 1 to 3 top goals (per user).
  - Groups: Visitors, Driving traffic, Content performance, Suggested.
  - A banner offers new tiles when new GA4 conversion events are detected.
  - An "Unavailable metrics data" notice appears if a selected event has no data in 90 days.
  - Admins can hide the whole section.

  — [SK docs: Key metrics](https://sitekit.withgoogle.com/documentation/features/key-metrics/)
- **Full tile catalog (44 widgets):** The table below is from Site Kit's source code on the `develop` branch. "Lead events" means submit_lead_form, contact or generate_lead. "CD" means Site Kit creates GA4 custom dimensions. — [GitHub: key-metrics-widgets.js](https://github.com/google/site-kit-wp/blob/develop/assets/js/components/KeyMetrics/key-metrics-widgets.js)

| Official tile name | Description (official string) | Requires |
|---|---|---|
| Top earning pages | Pages that generated the most AdSense revenue | AdSense linked |
| Top recent trending pages | Pages with the most pageviews published in the last 3 days | CD googlesitekit_post_date |
| Most popular authors by pageviews | Authors whose posts got the most visits | CD googlesitekit_post_author |
| Top categories by pageviews | Categories that your site visitors viewed the most | CD googlesitekit_post_categories |
| Most popular content by pageviews | Pages that brought in the most visitors | GA4 |
| Most popular products by pageviews | Products that brought in the most visitors | CD googlesitekit_post_type |
| Pages per visit | Number of pages visitors viewed per session on average | GA4 |
| Visit length | Average duration of engaged visits | GA4 |
| Visits per visitor | Average number of sessions per site visitor | GA4 |
| Most engaging pages | Pages with the highest engagement rate | GA4 |
| Least engaging pages | Pages with highest % of visitors that left without engagement | GA4 |
| Top pages by returning visitors | Pages that attracted the most returning visitors | GA4 |
| New visitors | How many new visitors you got and how the overall audience changed | GA4 (activeUsers) |
| Returning visitors | Portion of people who visited your site more than once | GA4 (activeUsers) |
| Top traffic source | Channel which brought in the most visitors | GA4 |
| Most engaged traffic source | Visitors via this channel spent the most time on your site | GA4 |
| Top converting traffic source | Channel with the most visits that resulted in key events | GA4 key events |
| Top cities driving traffic | Which cities you get the most visitors from | GA4 |
| Top countries driving traffic | Which countries you get the most visitors from | GA4 |
| Top performing keywords | What people searched for before they came to your site | Search Console |
| Top traffic source driving add to cart | Channel with the most add_to_cart events | add_to_cart |
| Top cities driving add to cart | Cities where visitors most often add to cart | add_to_cart |
| Top traffic channels by total sales | Where do most of your buyers come from? | purchase |
| Sales by cities | Which cities bring in the most buyers? | purchase |
| Sales by device type | Are people buying more on mobile or desktop? | purchase |
| Total sales | Total visitors who completed a purchase | purchase |
| Sales rate | % of total visitors who completed a purchase | purchase |
| Sales engagement rate | % of (purchase-context) visitors who engaged | purchase |
| Top traffic channels by sales rate | Which channels have the highest % of buyers? | purchase |
| Sales by visitor type | Which types of visitors are most likely to buy? | purchase |
| Sales by countries | Which countries bring in the most buyers? | purchase |
| Top authors driving sales | Whose content is best at converting buyers? | purchase + CD author |
| Top pages driving sales | Which pages bring in the most sales? | purchase |
| Top traffic channels by form completion | Where do most of your leads come from? | lead events |
| Leads by cities | Which cities are people reaching out from? | lead events |
| Top pages driving leads | Which pages get people to take action? | lead events |
| Total form completions | Total visitors who completed a form | lead events |
| Form completion rate | % of total visitors who completed a form | lead events |
| Form completion engagement rate | % of (lead-context) visitors who engaged | lead events |
| Top traffic channels by form completion rate | Which channels are most efficient at capturing leads? | lead events |
| Leads by visitor type | Which types of visitors are most likely to reach out? | lead events |
| Leads by countries | Which countries are people reaching out from? | lead events |
| Leads by device type | What devices do people use when they take action? | lead events |
| Top authors driving leads | Whose content is best at converting readers? | lead events + CD author |

- **Newest tiles:** Site Goals lead-generation tiles arrived in 1.190.0 (Oct 2026) and "Selling products" tiles in 1.188.0 (Sep 2026). — [GitHub releases](https://github.com/google/site-kit-wp/releases)

### Cited Findings: Visitor groups (audience segmentation)
- **What it is:** Site Kit's name for GA4 audiences shown as dashboard cards on the Traffic tab. It is opt-in: Settings > Admin Settings > Visitor groups, followed by an OAuth prompt. — [SK docs: Visitor groups](https://sitekit.withgoogle.com/documentation/features/visitor-groups/)
- **Audiences available:**
  - "New visitors" and "Returning visitors": Site Kit creates these in GA4 if there are no eligible custom audiences. It also creates a custom dimension.
  - "All visitors": the predefined All Users audience.
  - "Purchasers": once it has had data.
  - Any custom GA4 audience with data.

  Selections are per user. — [SK docs: Visitor groups](https://sitekit.withgoogle.com/documentation/features/visitor-groups/)
- **Per-group card metrics:**
  - Visitors (total users)
  - Visits per visitor
  - Pages per visit
  - Total pageviews
  - Top 3 cities
  - Top 3 content by pageviews

  — [SK docs: Visitor groups](https://sitekit.withgoogle.com/documentation/features/visitor-groups/)
- **Limitations:** Data starts at the audience's creation date (no backfill). Users take 24–48 hours to enter an audience. View-only users can select groups but cannot create them. Changing the GA4 property resets the groups. — [SK docs: Visitor groups](https://sitekit.withgoogle.com/documentation/features/visitor-groups/)
- **Not new in 2026:** Visitor groups already had UI fixes in 1.141.0. — [newreleases.io 1.141.0](https://newreleases.io/project/github/google/site-kit-wp/release/1.141.0)

### Inferences
- Key Metrics is the main way Site Kit goes beyond GA4. It runs pre-built GA4 Data API queries and adds WordPress context (author, category, post date, post type) via custom dimensions it creates. Rate 1 can match it natively, without GA4 custom-dimension quota or setup friction.
- The "AI assistant" channel row is notable as a 2025–2026 addition and a selling point to match.

### Gaps
- No primary source gives the launch version or date for Visitor groups or Key Metrics. Both predate 2025 (inferred from the 1.141.0 notes for Visitor groups).

## 4. Conversion and lead tracking: plugin detection, Site Goals, enhanced conversions

### Takeaway
"Plugin conversion tracking", formerly called "enhanced conversion tracking", auto-detects 8 plugins and injects front-end JS that sends standard GA4 events to GA4 and/or Google Ads:
- Commerce: add_to_cart and purchase
- Leads: submit_lead_form, contact and generate_lead

"Site Goals" became generally available on Sep 7, 2026 (1.187.0). It turns those events into an "Online store performance" or "Lead generation performance" dashboard section. In Aug–Oct 2026 Site Kit added its own "content events": outbound link clicks, contact links, and reading a post to the end. This is the closest analog to Rate 1's form-lead tracking.

### Cited Findings
- **Supported plugins (8):** Contact Form 7, MailChimp, OptinMonster, Popup Maker, WPForms, WooCommerce, Ninja Forms, Easy Digital Downloads.
  - Enabled at Settings > Connected Services > Ads or Analytics > Edit > Plugin conversion tracking.
  - It is one toggle shared by Ads and Analytics.
  - Site Kit detects active supported plugins and "adds JavaScript to the front end".
  - Events go to Google Analytics and/or Google Ads.
  - The feature was "previously known as enhanced conversion tracking".

  — [SK docs: Plugin conversion tracking](https://sitekit.withgoogle.com/documentation/features/plugin-conversion-tracking/)
- **Plugin roles in Site Goals:**
  - Online store: WooCommerce, Easy Digital Downloads.
  - Lead generation: Contact Form 7, "MailChimp for WooCommerce", Ninja Forms, OptinMonster, Popup Maker, WPForms.
  - Plugin conversion tracking "is typically enabled by default".

  — [SK docs: Site goals](https://sitekit.withgoogle.com/documentation/features/site-goals/)
- **Site Goals widgets:**
  - **Online store performance** (purchase and add_to_cart): Sales Rate and Total Sales, falling back to Add to Cart Rate and products added to cart; Engagement Rate; a "Products added to cart" tile; "What's helping you reach your goals" tiles; "Other sources" for unsupported plugins firing the same events.
  - **Lead generation performance** (submit_lead_form, contact, generate_lead): form completion rate, total form completions, Engagement Rate, goal-driver tiles, and "Other form completions".
  - Up to 6 tiles per widget. Tile options include top traffic channels, sales or leads by visitor type, top pages, top authors, locations and device type.

  — [SK docs: Site goals](https://sitekit.withgoogle.com/documentation/features/site-goals/)
- **Advanced data breakdown:** Tabs by plugin or by form. It creates the GA4 custom dimensions `googlesitekit_event_provider` and `googlesitekit_form_id`, is not backfilled, and needs Editor or Admin role in GA4. — [SK docs: Site goals](https://sitekit.withgoogle.com/documentation/features/site-goals/); [PPC Land, Oct 3, 2026](https://ppc.land/google-site-kit-auto-tracks-checkouts-and-form-leads-from-8-wordpress-plugins/)
- **Site Goals timeline:** Shipped behind a flag in 1.179.0 (May 18, 2026) and went GA in 1.187.0 (Sep 7, 2026). Google Search Central promoted it on Sep 15, 2026. — [PPC Land](https://ppc.land/google-site-kit-auto-tracks-checkouts-and-form-leads-from-8-wordpress-plugins/); [GitHub releases](https://github.com/google/site-kit-wp/releases)
- **Google quote:** Site Kit "actively fills in data gaps by detecting these key visitor actions and sending the events to Analytics for you". — [PPC Land](https://ppc.land/google-site-kit-auto-tracks-checkouts-and-form-leads-from-8-wordpress-plugins/)
- **Not Google Ads enhanced conversions:** PPC Land says plugin conversion tracking is a different mechanism from Google Ads Enhanced Conversions, which sends hashed emails and similar data. — [PPC Land](https://ppc.land/google-site-kit-auto-tracks-checkouts-and-form-leads-from-8-wordpress-plugins/)
- **"Enhanced conversions" in 2026 release notes:** The term still appears:
  - "Clearer Ads and Analytics notification copy, improved Easy Digital Downloads tracking, removal of the Ads Conversion ID from Analytics" (1.178.0, May 4, 2026)
  - "New dimensions for events from Event Providers in Extended Conversion Tracking" (1.181.0)
  - Survey triggers for enhanced-conversions notifications (1.183.0)

  — [GitHub releases p.2](https://github.com/google/site-kit-wp/releases?page=2); [GitHub releases](https://github.com/google/site-kit-wp/releases)
- **New Site Kit content events:**
  - "content events" conversion event provider for all sites (1.186.0, Aug 24, 2026)
  - outbound link click and contact link tracking (1.188.0, Sep 21, 2026)
  - event tracking when a reader finishes a post (1.189.0, Oct 5, 2026)
  - a "notice to re-enable Plugin Conversion Tracking" and a Site Goals insight data builder (1.192.0, Nov 16, 2026)

  — [GitHub releases](https://github.com/google/site-kit-wp/releases)
- **Custom events:** "cannot be set up exclusively within Site Kit". They need GTM or GA4 configuration, and reporting happens in GA. — [SK docs: Event tracking](https://sitekit.withgoogle.com/documentation/advanced/event-tracking/)
- **Enhanced measurement:** Site Kit can switch on GA4 Enhanced measurement (downloads, form interactions, video) from its settings. — [SK docs: Analytics](https://sitekit.withgoogle.com/documentation/supported-services/analytics/)

### Inferences
- Gravity Forms, Fluent Forms, Formidable, Elementor Forms, Jetpack Forms and HubSpot are not supported. That leaves a clear gap Rate 1 can target for small-business lead capture. Any plugin firing the standard GA4 event names does show up under "Other form completions".
- Because detection is client-side gtag JS with Consent Mode, conversions from EEA/UK/CH visitors without consent are excluded or modeled. Rate 1's cookieless counting is a direct differentiator.

### Gaps
- Docs do not publish a per-plugin event map (which plugin fires which event) or Ads-side enhanced-conversions data handling (hashed user data).

## 5. Features beyond modules

### Takeaway
Features on top of the Google services:
- Setup and verification wizard
- Unified dashboard with URL Search
- Admin-bar page stats
- WP dashboard widget
- Role-based dashboard sharing
- Email reports (GA Jul 2026)
- PDF reports (2026)
- Key Metrics
- Visitor groups
- Site Goals (GA Sep 2026)
- Plugin conversion tracking
- Consent Mode via WP Consent API
- Google tag gateway (formerly "first-party mode")
- Enhanced measurement toggle
- AdSense ad blocking recovery
- "Feature Discovery Hub" / "Add features" (Aug–Nov 2026)

AI features are only scaffolding as of 1.192.0.

### Cited Findings
- **Setup flow:** Google sign-in by a WP Administrator. Site Kit verifies the site in Search Console and creates or links the GA4 account, property, stream and Google tag. "Setup Flow Refresh" launched in 1.183.0 (Jul 13, 2026) and Phase 4 in 1.185.0 (Aug 10, 2026); it puts Analytics on the splash screen and offers an auto-updates opt-in. — [SK docs: Analytics](https://sitekit.withgoogle.com/documentation/supported-services/analytics/); [GitHub releases](https://github.com/google/site-kit-wp/releases); [GitHub releases p.2](https://github.com/google/site-kit-wp/releases?page=2)
- **Page-specific metrics:**
  - URL Search filters the dashboard to one page.
  - The admin-bar ("toolbar") Site Kit tab on the front end shows Total Impressions, Total Clicks, Total Users and Total Sessions for the current URL over the last 28 days, with "More details" linking to the dashboard.
  - It is controlled by the setting "Display relevant page stats in the Admin bar".

  — [SK docs: Page-specific metrics](https://sitekit.withgoogle.com/documentation/features/page-specific-metrics/)
- **Dashboard sharing:**
  - Admins share a view-only dashboard, WP widget and toolbar stats with any role that has `edit_posts`.
  - Sharing is set per service: Analytics, Search Console, AdSense, PageSpeed.
  - Data flows through the owning admin's Google account, so viewers need no Google account.
  - View-only users can make PDFs and receive email reports.

  — [SK docs: Dashboard sharing](https://sitekit.withgoogle.com/documentation/features/dashboard-sharing/)
- **Email reports:**
  - Opt-in per user, weekly, monthly or quarterly.
  - Sent by WordPress itself via WP Cron and wp_mail, not by Google.
  - Content depends on the recipient's access. Admins can invite users and manage subscribers but cannot customize the layout.
  - The feature can be disabled site-wide.

  — [SK docs: Email reports](https://sitekit.withgoogle.com/documentation/features/email-reports/)
- **Email reports timeline:** Built through Feb–Jul 2026, with conversion metrics, user analytics and dark-mode templates in 1.175.0. The feature flag was removed in 1.183.0 (Jul 13, 2026, new). Site Goals sections were added to the top of the email in 1.188.0. — [GitHub releases p.2](https://github.com/google/site-kit-wp/releases?page=2); [GitHub releases](https://github.com/google/site-kit-wp/releases)
- **PDF reports:**
  - "Export PDF" in the dashboard header, choosing topics and widgets.
  - Generated entirely in the browser.
  - Excludes the current day.
  - Respects sharing limits.

  — [SK docs: PDF reports](https://sitekit.withgoogle.com/documentation/features/pdf-reports/)
- **PDF reports timeline:** A `pdfGeneration` flag was added in 1.178.0 (May 2026), the MVP came in 1.181.0 (Jun 15, 2026), and PDF widgets for Key Metrics, Visitor Groups, Monetization and Speed followed through 1.185.0 (Aug 2026). The flag-removal version was not seen; the feature is documented as live. — [GitHub releases p.2](https://github.com/google/site-kit-wp/releases?page=2); [GitHub releases](https://github.com/google/site-kit-wp/releases)
- **Consent mode:**
  - Enabled at Settings > Admin Settings.
  - Applies to the EEA, UK and Switzerland, whose visitors are "excluded from Analytics and Ads tracking unless they consent".
  - By default it updates the WP Consent API "statistics" and "marketing" categories.
  - Site Kit can install and activate the WP Consent API plugin.
  - Native consent-plugin compatibility: Complianz, Cookiebot (Usercentrics), CookieYes.
  - Site Kit provides no banner.
  - "For Google Analytics 4, Google fills data gaps with conversion and behavioral modeling."

  — [SK docs: Consent mode](https://sitekit.withgoogle.com/documentation/features/consent-mode/)
- **Google tag gateway for advertisers:**
  - Serves measurement through `/wp-content/plugins/google-site-kit/gtg/measurement.php` on the site's own domain. It needs cURL or `file_get_contents`.
  - One toggle shared by Analytics, Ads and Tag Manager.
  - No AMP support.
  - The docs give no default state; it must be toggled on.

  — [SK docs: Google tag gateway](https://sitekit.withgoogle.com/documentation/features/google-tag-gateway-for-advertisers/)
- **Gateway history:** It started as the "First-party mode proxy script" in 1.141.0, with a readiness/health-check endpoint. measurement.php was updated in 1.162.0. — [newreleases.io 1.141.0](https://newreleases.io/project/github/google/site-kit-wp/release/1.141.0); [search result summary of newreleases.io 1.162.0](https://newreleases.io/project/github/google/site-kit-wp/release/1.162.0)
- **Feature Discovery Hub / "Add features" (new, Aug–Nov 2026):**
  - Admin menu item and header button with a "new" badge.
  - "What's new?" and "All services and features" tabs.
  - In-hub setup for Analytics, Ads, AdSense, Sign in with Google, RRM, dashboard sharing, email reports, PDF downloads, enhanced measurement, Key Metrics and Visitor Groups.

  Built from 1.186.0 to 1.192.0. — [GitHub releases](https://github.com/google/site-kit-wp/releases)
- **AI features:** 1.192.0 (Nov 16, 2026) "added AI-generated content components (an AI icon, a disclosure line, and bold text support)" alongside a "Site Goals insight data builder". No user-facing AI insights are documented yet, so this is in development. — [GitHub releases](https://github.com/google/site-kit-wp/releases)
- **Staging environments:** Site Kit has a documented staging how-to. Configuration via wp-config keys is supported. — [SK docs index](https://sitekit.withgoogle.com/documentation/)

### Inferences
- The 2026 roadmap (Site Goals, email and PDF reports, Recent activity, Latest content, AI insight scaffolding) moves Site Kit from a "GA viewer" toward an outcome-focused small-business dashboard. That is the same positioning as Rate 1. Expect AI-written insights in Site Kit around late 2026 or early 2027.
- The first-party mode rename to "Google tag gateway for advertisers" matches Google's 2025 product rename. This is from prior knowledge; no Site Kit source confirms the date.

### Gaps
- Launch versions of dashboard sharing, consent mode and the Ads module were not confirmed. Prior knowledge (unverified) places consent mode around early 2024.
- The exact email report contents (which metrics) are not documented.

## 6. Privacy

### Takeaway
Site Kit puts the standard Google tag (gtag.js) for GA4 and Ads on the site, so the usual GA cookies apply. Consent Mode is opt-in and region-scoped to the EEA, UK and Switzerland. It relies on a third-party CMP through the WP Consent API, and Google models the missing data. Site owners carry all GDPR responsibility. The docs say little about what the plugin itself stores or sends.

### Cited Findings
- **Owner responsibility:** "Site owners are responsible" for notice and consent. Third-party plugins can block Analytics, Tag Manager or AdSense until consent is given. The FAQ says "IP anonymization is on by default for Analytics and can be turned off". — [wordpress.org plugin page](https://wordpress.org/plugins/google-site-kit/)
- **Consent-plugin integrations:** CookieYes, Complianz, GDPR Cookie Compliance (Site Kit options need a premium add-on), and Cookiebot. The example cookie notice says Google serves cookies to analyze traffic. — [SK docs: GDPR & privacy](https://sitekit.withgoogle.com/documentation/advanced/gdpr-compliance-and-privacy/)
- **Consent mode behavior:** Without a CMP, EEA, UK and Swiss visitors are excluded from Analytics and Ads reporting. Visitors who decline are excluded. GA4 gaps are filled by Google's modeling. Other plugins' consent-mode features should not be used alongside it. — [SK docs: Consent mode](https://sitekit.withgoogle.com/documentation/features/consent-mode/)
- **Google tag:** Supports only GA4 and Google Ads. The GA4 measurement ID sits behind a GT- tag ID. — [SK docs: Analytics](https://sitekit.withgoogle.com/documentation/supported-services/analytics/)
- **Plugin conversion tracking:** Injects front-end JS that sends visitor actions to GA4 and/or Google Ads. — [SK docs: Plugin conversion tracking](https://sitekit.withgoogle.com/documentation/features/plugin-conversion-tracking/)
- **Email and PDF reports:** Emails go from the site via WP Cron and data comes from Google APIs. PDFs are generated in the browser. — [SK docs: Email reports](https://sitekit.withgoogle.com/documentation/features/email-reports/); [SK docs: PDF reports](https://sitekit.withgoogle.com/documentation/features/pdf-reports/)
- **Google tag gateway:** Proxies measurement through the site's domain. Google frames this as improving "signal accuracy and resilience", which means less loss to ad blockers. — [SK docs: Google tag gateway](https://sitekit.withgoogle.com/documentation/features/google-tag-gateway-for-advertisers/)

### Inferences
- The FAQ's "IP anonymization" statement is a Universal Analytics leftover: GA4 does not log or store IP addresses, so the toggle is effectively moot.
- Consent Mode appears to be the **advanced** variant. The docs mention GA4 modeling for gaps, which requires tags to load and send cookieless pings while consent is denied. Default-denied applies only in EEA, UK and CH, so the rest of the world is tracked with cookies by default. Basic vs advanced is not named in the docs.
- The cookies set are the standard GA4 `_ga` and `_ga_<container-id>`, plus Ads cookies such as `_gcl_*` when Ads is connected. This is GA4 knowledge, not documented by Site Kit.
- The Google tag gateway increases data collection resilience. It does not reduce data sent to Google.

### Gaps
- No primary source fetched on what the plugin stores in WordPress (OAuth tokens, settings) or sends to Google. That includes the site-registration and OAuth proxy service at sitekit.withgoogle.com and the opt-in anonymous usage tracking offered during setup, both known from prior knowledge but unverified here.
- No documentation of Consent Mode v2 signal names (`ad_user_data`, `ad_personalization`) or the basic/advanced choice.

## 7. Adoption, pricing, versions, cadence

### Takeaway
Site Kit is free, open-source and Google-built. It has 5+ million active installs, a 4.2/5 rating from 1,015 reviews (146 one-star), and ships every 2 weeks. The latest version is 1.192.0 (Nov 16, 2026).

### Cited Findings
- **Free:** Individual Google products have their own terms or fees. — [wordpress.org plugin page](https://wordpress.org/plugins/google-site-kit/)
- **Installs and rating:** 5+ million active installs. Rated 4.2/5 from 1,015 reviews: 739 five-star, 51 four-star, 37 three-star, 42 two-star, 146 one-star. — [wordpress.org plugin page](https://wordpress.org/plugins/google-site-kit/)
- **Version and requirements:** Version 1.192.0, updated Nov 16, 2026. Requires WP 5.2+ (page states "tested up to 7.1.4") and PHP 7.4+. The site must be publicly accessible with the REST API available. No Internet Explorer. — [wordpress.org plugin page](https://wordpress.org/plugins/google-site-kit/)
- **Release cadence:** Releases are exactly 14 days apart (1.183.0 to 1.192.0, Jul to Nov 2026). — [GitHub releases](https://github.com/google/site-kit-wp/releases)
- **RRM fee:** Google takes a 5% fee on RRM payments. — [SK docs: RRM](https://sitekit.withgoogle.com/documentation/supported-services/reader-revenue-manager/)

### Inferences
- About 26 releases a year shows Google is actively investing in the product, especially conversion and lead features in 2026.

### Gaps
- No official count of sites with each module connected.

## 8. Limitations and complaints

### Takeaway
The 1-star themes are setup and authentication failures, site slowdowns and breakage, and "useless" low value. Documented limitations:
- No real-time data; a 90-day cap and 24–48 hour gathering delays
- No backfill for new audiences or dimensions
- Discrepancies with the GA UI
- Dependence on a public site and the REST API
- No multisite or headless support
- Custom events must be built in GA4 or GTM
- Only 8 supported conversion plugins

### Cited Findings
- **1-star review themes (titles):**
  - Setup: "This whole setup wizzard is completely messed up" (about Oct 2026), "Set-Up is Impossible" (about Mar 2026), "Issues right from the start" (Nov 2026), "Just endlessly loops me back to 'Set up Site Kit!'"
  - Performance: "Makes the site too slow.", "Considerably slows down the site", "Slows down site waiting for Google Ads and I don't even use Google Ads"
  - Breakage: "Broke my site instantly", "HTTP 500 Error"

  — [wordpress.org 1-star reviews](https://wordpress.org/support/plugin/google-site-kit/reviews/?filter=1)
- **Known limitations:**
  - Site must be public, with no password-protected homepage; maintenance and coming-soon plugins break setup.
  - REST API must be reachable.
  - Ad blockers break AdSense requests.
  - Caching plugins (WP Super Cache, Breeze, Autoptimize) and relative-URL plugins interfere with setup.
  - WPML or TranslatePress can cause "no data"; WPML multi-domain is unsupported.
  - No multisite network support (activate per site) and no headless support.
  - Some regions block Google services.

  — [SK docs: Known limitations](https://sitekit.withgoogle.com/documentation/troubleshooting/known-limitations/)
- **Data lag:**
  - "Gathering data" for up to 48 hours.
  - Recent activity lags up to 6 hours.
  - PDFs exclude the current day.
  - Visitor groups take 24–48 hours with no backfill.
  - Site Goals breakdown is not backfilled.

  — [SK docs: Dashboard how-to](https://sitekit.withgoogle.com/documentation/how-tos/how-to-use-the-site-kit-dashboard/); [SK dev docs](https://site-kit-dev.appspot.com/documentation/using-site-kit/using-the-site-kit-dashboard/); [SK docs: PDF reports](https://sitekit.withgoogle.com/documentation/features/pdf-reports/); [SK docs: Visitor groups](https://sitekit.withgoogle.com/documentation/features/visitor-groups/); [SK docs: Site goals](https://sitekit.withgoogle.com/documentation/features/site-goals/)
- **GA dependence:**
  - No real-time data.
  - `totalUsers` vs `activeUsers` discrepancies with the GA UI.
  - Only the connected property is shown.
  - Non-admins need dashboard sharing.

  — [SK docs: Analytics](https://sitekit.withgoogle.com/documentation/supported-services/analytics/); [SK docs: Key metrics](https://sitekit.withgoogle.com/documentation/features/key-metrics/)
- **Limited customization:**
  - Custom events cannot be configured in Site Kit.
  - Email report layout is not customizable.
  - Key Metrics capped at 8 tiles, Site Goals at 6 per widget.
  - Ad units cannot be managed in Site Kit.

  — [SK docs: Event tracking](https://sitekit.withgoogle.com/documentation/advanced/event-tracking/); [SK docs: Email reports](https://sitekit.withgoogle.com/documentation/features/email-reports/); [SK docs: Key metrics](https://sitekit.withgoogle.com/documentation/features/key-metrics/); [SK docs: AdSense](https://sitekit.withgoogle.com/documentation/supported-services/adsense/)
- **Permissions friction:**
  - "Insufficient permissions" notices appear when Google access changes.
  - Admins need their own Google access to each service.
  - Visitor groups and Site Goals breakdowns need extra OAuth grants and GA4 Editor role.

  — [SK docs: Search Console](https://sitekit.withgoogle.com/documentation/supported-services/search-console/); [SK docs: Known limitations](https://sitekit.withgoogle.com/documentation/troubleshooting/known-limitations/); [SK docs: Visitor groups](https://sitekit.withgoogle.com/documentation/features/visitor-groups/); [PPC Land](https://ppc.land/google-site-kit-auto-tracks-checkouts-and-form-leads-from-8-wordpress-plugins/)
- **Custom-dimension consumption:** Site Kit creates GA4 custom dimensions in the user's property:
  - `googlesitekit_post_date`, `googlesitekit_post_author`, `googlesitekit_post_categories`, `googlesitekit_post_type`
  - `googlesitekit_event_provider`, `googlesitekit_form_id`

  — [GitHub: key-metrics-widgets.js](https://github.com/google/site-kit-wp/blob/develop/assets/js/components/KeyMetrics/key-metrics-widgets.js); [PPC Land](https://ppc.land/google-site-kit-auto-tracks-checkouts-and-form-leads-from-8-wordpress-plugins/)

### Inferences
- In the EEA, UK and CH, Site Kit's numbers undercount or depend on modeling, because consent mode excludes non-consenting visitors. Combined with the GA lag and the 90-day cap, this is Rate 1's sharpest wedge for EU small businesses: complete counts, no banner dependency, same-day data, and longer history.
- The 6 custom dimensions count against GA4's per-property custom-dimension quota. That quota figure comes from GA4 knowledge and was not checked here.

### Gaps
- The "Front-end performance" doc page was not fetched, so there is no measured overhead figure (script weight, admin load time).
- 1-star reviews were sampled by title only. Exact frequency of each complaint is unknown.
