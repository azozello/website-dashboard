# Google Analytics 4 (GA4): features and capabilities as of November 2026, excluding the metrics/dimensions catalog

Conventions: **[360]** = Google Analytics 360 only. **[DEPRECATED]** = removed or renamed. **[BETA]/[ALPHA]** = Google's label. Dates are Google release-note dates. "R26" = [What's new 2026](https://support.google.com/analytics/answer/9164320?hl=en); "R25" = [What's new archive 2019–2025](https://support.google.com/analytics/answer/13420269?hl=en).

---

## 1. Standard reports, navigation and report customization

### Takeaway
GA4's left nav has Home, Reports, Explore and Advertising. Reports are built from a customizable **Library** of collections and topics. New properties get the **Business objectives** collection, which includes Generate leads. Older properties get **Life cycle**. Every property also gets the **User** collection. 2024–2026 additions: Realtime pages, benchmarking, annotations, generated insights, snapshot templates, Google Business Profile reports, and customizable **Dashboards** (Sep 2026).

### Cited Findings
- **Home**: landing page with cards and an Insights section. Since Feb 10, 2026, **Generated insights on Home** summarize the top 3 data changes since your last visit, including anomalies and seasonality — [R26](https://support.google.com/analytics/answer/9164320?hl=en); [Insights help](https://support.google.com/analytics/answer/9443595?hl=en)
- **Reports snapshot**: overview of cards. **Report snapshot templates** (User behavior, Sales and revenue, Marketing performance) and an updated card library were added Apr 24, 2025 — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- **Realtime pages report** (Oct 9, 2024): shows which pages are being viewed right now and how many users are on each — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- Realtime data freshness is "typically a few minutes" and covers only a few dimensions and metrics — [Data freshness](https://support.google.com/analytics/answer/11198161?hl=en)
- **Life cycle collection**: follows users from acquisition to retention (Acquisition, Engagement, Monetization, Retention). **User collection** (Demographics, Tech) is on every property by default. The **Business objectives collection** replaces Life cycle when business info is given at setup. Properties created before Mar 27, 2023, or migrated from UA, default to Life cycle — [Google help: collections](https://support.google.com/analytics/answer/12924488?hl=en)
- Business objectives topics: **Generate leads, Drive online sales, Raise brand awareness, Examine user behavior** — [Google help](https://support.google.com/analytics/answer/12924488?hl=en); [CMSWire](https://www.cmswire.com/analytics/use-google-analytics-business-objectives-collections-to-tailor-metrics-for-your-marketing-teams)
- **Lead generation reports** (Jul 21, 2025): **Lead acquisition** and **Lead disqualification and loss** reports, plus 8 lead-gen audience templates. They require the lead-gen event schema — [R25](https://support.google.com/analytics/answer/13420269?hl=en); [Loves Data](https://www.lovesdata.com/blog/google-analytics-lead-reports/)
- **Search Console collection**: unpublished by default and must be published from the Library. It contains 2 reports:
  - **Google Organic Search Queries**: queries plus Search Console metrics, drill-down by Search Console dimensions only.
  - **Google Organic Search Traffic**: landing pages with Search Console and GA metrics, drill-down by Country and Device.
  — [Search Console help](https://support.google.com/analytics/answer/10737381?hl=en)
- Search Console data limits in GA4:
  - Search Console metrics combine only with Landing page, Device and Country.
  - Max 16 months of data, appearing about 48h after Search Console collects it.
  - **No time-series charts.**
  - Linking is 1 web stream ↔ 1 Search Console property, and links can't be edited.
  — [Search Console help](https://support.google.com/analytics/answer/10737381?hl=en)
- **Google Business Profile integration** (Jun 8, 2026): link a Business Profile and get reports on 7 GBP metrics, with a rolling 6-month window — [R26](https://support.google.com/analytics/answer/9164320?hl=en)
- **Dashboards** (Sep 9, 2026): customizable dashboards that show KPIs on one report, with drag-and-drop and new visualizations — [R26](https://support.google.com/analytics/answer/9164320?hl=en)
- **Advertising workspace**: conversions created from key events appear in Advertising, not in standard Reports or Explore. The Advertising snapshot has an Insights card — [Key events help](https://support.google.com/analytics/answer/13965727?hl=en); [Insights help](https://support.google.com/analytics/answer/9443595?hl=en)
- **Conversion attribution analysis report** [BETA] (Jan 16, 2026): assisted-conversion (last click) and refined-funnel (data-driven attribution) views — [R26](https://support.google.com/analytics/answer/9164320?hl=en)
- **Cross-channel budgeting** [BETA] (Jan 16, 2026): projection plans to track paid-channel performance, plus scenario plans for budget allocation — [R26](https://support.google.com/analytics/answer/9164320?hl=en)
- **Benchmarking** (Oct 28, 2024): industry peer benchmarks (median, 25th and 75th percentiles), refreshed every 24h. Extended to 20 absolute (unnormalized) metrics on Oct 2, 2025 — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- **Annotations** (Mar 20, 2025): notes on line graphs in overview, detail and Advertising reports, also creatable via the Admin API. System-generated annotations exist. Analyst role and above can edit (Jul 1, 2025) — [R25](https://support.google.com/analytics/answer/13420269?hl=en); [PPC Land](https://ppc.land/google-analytics-introduces-annotations-feature-to-enhance-data-context/)
- **Percentage-of-total values in tables** (Mar 12, 2025). **"(not set)" and missing session_start notification icons** (Mar 12, 2025) — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- **"(data not available)"** source/medium value for missing traffic-source data (Mar 31, 2025) — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- **Copy custom reports and explorations between properties** (Jan 21, 2025) — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- **Export limits raised** for TSV, CSV and Google Sheets (Oct 3, 2024). **Scheduled email reports** date from 2023 and **instant report emails** from May 2024 — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- [360] admins can add Google Marketing Platform groups as recipients in "Schedule Email"/"Send Email" — [R25 via search snippet](https://support.google.com/analytics/answer/13420269)
- **Ecommerce dimensions and metrics** became usable in secondary dimensions, filters, comparisons and report customization (Aug 25, 2025) — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- **AI Assistant channel** (May 13, 2026): a new default-channel-group channel for chatbot referrals (ChatGPT, Gemini, Claude, etc.). **Source group / Source platform** (Jun 11, 2026) consolidates source variants (e.g., Facebook, Instagram, TikTok) and groups AI sources such as ChatGPT and Perplexity — [R26](https://support.google.com/analytics/answer/9164320?hl=en)
- **Task Assistant** (Apr 29, 2026): left-nav panel of configuration recommendations to complete or skip — [R26](https://support.google.com/analytics/answer/9164320?hl=en)

### Inferences
- From product knowledge, not re-fetched this session: report customization (Editor+) lets you edit collections and topics in the Library, create detail and overview reports, change report metrics, dimensions and cards, and set default filters. Standard reports support **comparisons** (up to 4) and add-on filters. Treat this as product knowledge.
- Competitor relevance: GA4's Search Console view is narrow. It is opt-in, has no trend chart, joins only with landing page, device and country, and has a ~48h lag. A dedicated Search Console dashboard with time series and query × page joins is a real differentiator.
- Competitor relevance: GA4's lead features (lead reports, lead audiences, auto-configured lead key events) depend on implementing Google's lead-gen event schema (generate_lead / qualify_lead / close_convert_lead, etc.), which is hard for small businesses. Out-of-the-box form-lead capture is a differentiator. This is an inference; the exact event names were not verified this session.

### Gaps
- No official numeric limits found for custom reports or collections per property, comparisons per report, or scheduled-email frequency options.
- The Dashboards (Sep 2026) launch note doesn't say whether it is GA4-standard or 360-only, or what its widget limits are.

---

## 2. Explore (Explorations), segments, comparisons, filters

### Takeaway
Explore has 7 techniques. Explorations are subject to sampling (10M events standard, 1B for 360), data thresholds, and the property's data-retention setting (default 2 months, max 14 for standard). That last one is a major small-business trap.

### Cited Findings
- Techniques — [Explore help](https://support.google.com/analytics/answer/7579450?hl=en):
  - **Free-form exploration**: crosstab with bar, pie, line, scatter or geo charts.
  - **Funnel exploration**: steps users take to complete tasks, and where they drop off.
  - **Path exploration**: routes users take through the site or app.
  - **Segment overlap**: how up to several user segments intersect.
  - **User explorer** ("User exploration"): lists users in segments and drills into one user's activity stream.
  - **Cohort exploration**: compares groups that share an attribute over time.
  - **User lifetime**: user behavior and value over the customer lifetime.
- Limits:
  - 10 segments per exploration and 10 filters per tab.
  - 200 explorations per user per property; 500 shared per property (1,000 for [360]).
  - Sharing requires the Analyst role; Viewers can duplicate.
  — [Explore help](https://support.google.com/analytics/answer/7579450?hl=en); [360 limits](https://support.google.com/analytics/answer/11202874?hl=en)
- Sampling:
  - Queries over 10M events may be sampled.
  - [360] sampling limit is 1B events, plus **unsampled explorations** (20K daily unsampled tokens, 5K max per query) requested by Analysts.
  - The status icon turns yellow when sampling or thresholds apply.
  — [Explore help](https://support.google.com/analytics/answer/7579450?hl=en); [360 limits](https://support.google.com/analytics/answer/11202874?hl=en); [Roles](https://support.google.com/analytics/answer/9305587?hl=en)
- Explore retention defaults to **2 months**. Admins can raise it to 14 months (standard) or 26/38/50 months ([360]). Large and XL properties are capped at 2 months — [Explore help](https://support.google.com/analytics/answer/7579450?hl=en); [360 limits](https://support.google.com/analytics/answer/11202874?hl=en)
- Export formats: Google Sheets, TSV, CSV, PDF, and PDF (all tabs) — [Explore help](https://support.google.com/analytics/answer/7579450?hl=en)
- **Saved segments**: Editors+ can save segments for the whole property (Oct 17, 2024). Limit is 50 standard / 200 [360]. Saved comparisons are 50 / 200 — [R25](https://support.google.com/analytics/answer/13420269?hl=en); [360 limits](https://support.google.com/analytics/answer/11202874?hl=en)
- More Explore match types for item-scoped dimensions and the Audience dimension (Apr 7, 2025) — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- Consent-mode modeled data appears in free-form, funnel, path and segment-overlap explorations. It does **not** appear in user explorer, cohort, user lifetime, sequence segments, audiences or predictive metrics — [Behavioral modeling](https://support.google.com/analytics/answer/11161109?hl=en)
- The User explorer is also the UI place to **delete an individual user's data** (trash icon). This doesn't delete BigQuery copies — [InfoTrust](https://infotrust.com/articles/google-analytics-4-dsar-and-deletion-requests/)

### Inferences
- From product knowledge: segments come in user, session and event scopes, support sequences and exclusions, and can be turned into audiences. Funnels support open or closed funnels, "directly followed by" steps, elapsed time, next action and breakdowns. Not re-verified this session.

### Gaps
- No 2026-dated source confirms new Explore techniques. One third-party claim of "retroactive, segmentable funnels" in reports was not verified.

---

## 3. Key events (formerly "conversions") and Google Ads conversions

### Takeaway
GA4 renamed conversions to **key events** (2024). "Conversions" now means Ads-shared conversion actions created from key events. Since Jan 2026, web conversion management lets each conversion carry its own attribution settings. Limits are 30 key events (standard) and 50 ([360]).

### Cited Findings
- Events that matter to the business are **key events**. A **conversion** is created from a key event to measure ad performance and optimize bidding. The flow is Event → Key event → Conversion. Any collected event can be marked as a key event (Admin > Key events) — [Key events help](https://support.google.com/analytics/answer/13965727?hl=en)
- Each key event can create 1 web and 1 app conversion per linked Ads account. Creating the Ads conversion also creates a shared conversion in GA, shown in Advertising, not Reports or Explore — [Key events help](https://support.google.com/analytics/answer/13965727?hl=en)
- Key events limit: **30 standard / 50 [360]** — [360 limits](https://support.google.com/analytics/answer/11202874?hl=en)
- **Key event recommendations** (Dec 5, 2024): one-click marking of existing events, or creating a key event from a page view — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- **Auto-configured lead-gen key events** (Jun 12, 2025): qualified and converted lead events are auto-set as key events when the lead-gen objective is chosen. Can be disabled — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- **Improved web conversion management** [BETA] (Jan 16, 2026): per-conversion attribution settings, cross-channel reporting, dimension filters. **App conversion management** for Google Ads customers followed on Sep 29, 2026 — [R26](https://support.google.com/analytics/answer/9164320?hl=en)
- The Marketer role can manage key events and import conversions into Google Ads — [Roles](https://support.google.com/analytics/answer/9305587?hl=en)
- **Conversion data completeness fix** (Aug 6, 2025) for properties with 2+ linked Ads accounts — [R25](https://support.google.com/analytics/answer/13420269?hl=en)

### Inferences
- From product knowledge: the counting method is "once per event" (default) or "once per session", and a default key event value can be set. The key-events help page only links to those articles, so this is not verified this session.

### Gaps
- The exact rename date (Mar 2024) and counting-method details were not confirmed from a fetched Google page.

---

## 4. Attribution, channels and conversion paths

### Takeaway
Only **data-driven** and **paid-and-organic last click** remain (plus the Google-paid-channels last-click variant). First click, linear, time decay and position-based were removed in Nov 2023. Lookback windows are 7/30 days (acquisition) and 30/60/90 days (other). Since Aug 2026, conversions can use custom windows of 1–90 days for clicks and 1–30 days for engaged views.

### Cited Findings
- Models: data-driven (paid and organic DDA since Nov 1, 2021) and last-click variants. **First click, linear, time decay, position-based were "no longer available as of November 2023"** [DEPRECATED]. Changing the model is retroactive and affects event-scoped (not user- or session-scoped) source/medium/campaign/channel — [Attribution settings](https://support.google.com/analytics/answer/10597962?hl=en)
- **Channels that can receive credit**:
  - "Paid and organic channels" is GA's default and applies to web only.
  - "Google paid channels" is the Google Ads default; app conversions always use it.
  — [Attribution settings](https://support.google.com/analytics/answer/10597962?hl=en)
- **Lookback windows**:
  - Acquisition key events (first_open, first_visit): 30 days default, or 7.
  - All other key events: 90 days default, or 30/60.
  - Changing them requires Marketer role or above.
  — [Attribution settings](https://support.google.com/analytics/answer/10597962?hl=en)
- **Updated conversion window configuration** (Aug 11, 2026): custom 1–90 days for click-through and 1–30 days for engaged-view conversions — [R26](https://support.google.com/analytics/answer/9164320?hl=en)
- Advertising reports: **Key event attribution models (model comparison)** and **Key event attribution paths (conversion paths)** — [Attribution settings nav](https://support.google.com/analytics/answer/10597962?hl=en)
- **Direct attribution improvements** reduce mis-attribution to Direct (Oct 28, 2024). **Aggregate identifiers** (GBRAID/gad_) are used for paid Google Ads attribution (Apr 24, 2025). An **Aggregate parameter diagnostic** alerts when these are missing from URLs (Jul 30, 2026) — [R25](https://support.google.com/analytics/answer/13420269?hl=en); [R26](https://support.google.com/analytics/answer/9164320?hl=en)
- **User-provided data (UPD)** is no longer a reporting identity for session/user attribution (Nov 5, 2025) and now focuses on activation and Ads conversions [DEPRECATED as reporting identity] — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- **Custom channel groups**: rule-based groupings applied retroactively. Manual ad content can be used as a condition since Nov 26, 2024 — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- Custom channel group limits are reported as 2 groups × 25 channels (standard) and 5 groups ([360]) — [KP Playbook](https://kpplaybook.com/resources/ga4-new-channel-groups/); [MeasureU](https://measureu.com/custom-channel-grouping-ga4); contradicted by [KRM Digital course](https://krmdigitalmarketing.teachable.com/courses/google-analytics-4-course/lectures/65404358) (50 channels per group)

### Inferences
- Paid-and-organic last-click plus DDA means a small site with little conversion volume gets DDA results that are hard to explain. A transparent last-touch or first-touch model is a simple contrast point.

### Gaps
- Custom channel group limits were not confirmed on a Google page; sources conflict (25 vs 50 channels).

---

## 5. Audiences

### Takeaway
The audience builder has user, session and event conditions, sequences, membership duration and exclusions. Supporting features: predictive audiences, audience triggers, suggested templates (incl. lifecycle and lead-gen), and export to Google Ads, DV360 and SA360. Customer Match supplements exports. Limits are 100 audiences (standard) and 400 ([360]).

### Cited Findings
- Audiences: **100 standard / 400 [360]** per property — [360 limits](https://support.google.com/analytics/answer/11202874?hl=en)
- **Audience triggers**: fire an event when a user joins an audience. Up to 20 per property, counted against the audience limit, and calculated during data processing — [Google help](https://support.google.com/analytics/answer/10447093)
- **Predictive metrics**:
  - Purchase probability (7-day).
  - Churn probability (not visiting within 7 days).
  - Predicted revenue (28 days).
  — [Predictive audiences](https://support.google.com/analytics/answer/9805833?hl=en)
- **Predictive audience templates**: Likely 7-day churning purchasers, Likely 7-day churning users, Likely 7-day purchasers, Likely first-time 7-day purchasers, Predicted 28-day top spenders. Only "Ready to use" once prerequisites are met. Requires Marketer role — [Predictive audiences](https://support.google.com/analytics/answer/9805833?hl=en)
- **Suggested lifecycle templates** (Dec 1, 2025): High-Value Purchasers (count or LTV percentile) and Disengaged Purchasers, exportable to Google Ads. **8 lead-gen audience templates** (Jul 2025) — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- **Customer Match** (Nov 20, 2024): hashed, consented first-party data supplements audiences exported to Google ad products — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- **Display dynamic remarketing** (Dec 1, 2025) for web. Requires recommended ecommerce events and personalized ads enabled — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- Audiences are shared with linked advertising products (Google Ads, DV360, SA360) — [Share audiences help](https://support.google.com/analytics/answer/12800258?hl=en)
- Consent-mode modeled data is not used in audiences or predictive metrics — [Behavioral modeling](https://support.google.com/analytics/answer/11161109?hl=en)
- Audience exports are also available via the Data API — [PlainSignal glossary (third-party)](https://plainsignal.pages.dev/glossary/ga4-data-api)

### Inferences
- Remarketing requires Google signals or ad_personalization consent. In the EU, Consent Mode v2 consent gates audience building for new users (see §10).

### Gaps
- Predictive-metric prerequisites were not confirmed from the fetched page. It points to the separate "[GA4] Predictive metrics" article; commonly cited is 1,000 positive and 1,000 negative users over 28 days.

---

## 6. AI and insights: Analytics Intelligence, Analytics Advisor (Gemini), generated insights

### Takeaway
GA4's AI layer:
- **Automated insights / anomaly detection** (Analytics Intelligence).
- **Custom insights** with email alerts (50 per property).
- **Generated insights**: AI text summaries in reports (Apr 2025) and on Home (Feb 2026).
- **Analytics Advisor** (Dec 12, 2025): an agentic, Gemini-powered conversational assistant, initially English-only. It effectively supersedes the older natural-language search.

### Cited Findings
- **Automated insights**: Analytics Intelligence uses ML to surface unusual changes and emerging trends. They show on the Home Insights section, the Advertising snapshot card, and the Insights dashboard ("View all insights"). Insights are kept for 1 year — [Insights help](https://support.google.com/analytics/answer/9443595?hl=en)
- **Custom insights**: a condition on segment + metric (% change, threshold, or "Has anomaly"), evaluated hourly (web only), daily, weekly or monthly. **Up to 50 per property**, optional email notifications, Editor+ to create — [Insights help](https://support.google.com/analytics/answer/9443595?hl=en)
- Related Analytics Intelligence features listed by Google: **Recommendations, Contribution Analysis, AI overviews** — [Insights help](https://support.google.com/analytics/answer/9443595?hl=en)
- **Generated insights** (Apr 2, 2025): AI plain-language summaries in detail reports explain fluctuations. Extended to Home on Feb 10, 2026 — [R25](https://support.google.com/analytics/answer/13420269?hl=en); [R26](https://support.google.com/analytics/answer/9164320?hl=en)
- **Analytics Advisor** (Dec 12, 2025): an "agentic" conversational assistant "powered by Gemini models", opened from a top-right icon or the GA search box. It gives insights, diagnostics and how-to help — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- Announced Nov 12, 2025 with Ads Advisor and rolled out to English-language accounts in early Dec. Available for standard and 360. It had been in beta since ~Oct 2025 — [Search Engine Journal](https://www.searchenginejournal.com/google-launches-ads-advisor-analytics-advisor-globally/560656/); [Search Engine Land](https://searchengineland.com/google-launches-ai-powered-advisors-464571); [onlinemarketing.de](https://onlinemarketing.de/seo/ga4-besser-verstehen-google-bringt-analytics-advisor)
- Practitioners report Advisor struggles with complex multi-step analysis and only sees GA4 data — [onlinemarketing.de](https://onlinemarketing.de/seo/ga4-besser-verstehen-google-bringt-analytics-advisor); [Journal du Net](https://www.journaldunet.com/seo/1547497-retours-experience-analytics-advisor-loue-pour-sa-facilite-d-utilisation/)
- **Benchmarking** (see §1) and **Task Assistant** (Apr 29, 2026) configuration recommendations — [R26](https://support.google.com/analytics/answer/9164320?hl=en)

### Inferences
- One third-party guide calls the assistant "Ask Advisor". Google's official name is **Analytics Advisor**, so use that.

### Gaps
- No Google page confirms when the older natural-language "search for insights" box was retired or merged into Advisor.
- Advisor language and region availability beyond English was not confirmed as of Nov 2026.

---

## 7. Setup and data collection

### Takeaway
Collection runs through data streams (web, iOS, Android) via the Google tag (gtag.js), GTM, the Firebase SDK, the Measurement Protocol, and the new Data Manager API (May 2026). Server-side GTM is optional. Admin-side controls cover:
- Enhanced measurement.
- Data filters: internal, developer, and hostname include/exclude (2026).
- Cookie overrides.
- Data import, including automatic non-Google cost import for Meta, TikTok, Pinterest, Snap and Reddit.
- Tag diagnostics and the consent hub.

### Cited Findings
- **Enhanced measurement** (individually toggleable unless noted) — [Enhanced measurement](https://support.google.com/analytics/answer/9216061?hl=en):
  - page_view: always on; optional browser-history-change trigger.
  - scroll: 90% depth.
  - click: outbound links; excludes cross-domain-configured domains.
  - view_search_results: query params q, s, search, query, keyword, plus custom.
  - video_start, video_progress, video_complete: embedded YouTube with JS API only.
  - file_download: listed extensions.
  - form_start, form_submit.
- **Outbound clicks** now cover only website links. Non-HTTP links (mailto/tel) need GTM or custom events (Nov 14, 2024). **Custom events require a config command or Google tag** (Nov 13, 2024) — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- **Data filters**:
  - Internal traffic (by IP or IP range), developer traffic (debug mode), and hostname filters.
  - Include filters apply first, then excludes. Filters are **not retroactive**.
  — [Data filters](https://support.google.com/analytics/answer/10108813?hl=en)
- **Hostname filter (Exclude)** (Jun 11, 2026) and **Hostname filter (Include / allowlist)** (Sep 21, 2026). The include filter blocks events with empty hostnames — [R26](https://support.google.com/analytics/answer/9164320?hl=en)
- **Cookies**:
  - `_ga` (distinguishes users) and `_ga_<container-id>` (session state), both first-party, 2-year default.
  - Expiry and update can be overridden in tag settings (0 to 25 months).
  - Ads links add further ad cookies.
  — [Cookie usage](https://support.google.com/analytics/answer/11397207?hl=en)
- **Measurement Protocol**:
  - HTTP server-to-server or offline events that **augment, not replace**, tagging.
  - Joined on client_id or app_instance_id, with session_id inside 24h.
  - UI create/modify-event rules don't apply.
  - Reserved names are blocked. A validation server is available.
  — [MP docs](https://developers.google.com/analytics/devguides/collection/protocol/ga4)
- **Data Manager API for server-to-server events** (May 7, 2026): an alternative to the Measurement Protocol for custom and recommended events. **Data Manager in GA** [BETA] (Nov 6, 2026): an admin hub for product links, streams, first-party data and diagnostics — [R26](https://support.google.com/analytics/answer/9164320?hl=en)
- **Server-side tagging (server GTM)**:
  - The container runs in your GCP project or another environment.
  - It includes a Google Analytics client and tag, plus a Measurement Protocol client.
  - gtag sends to it via `server_container_url`.
  - Serving from a first-party domain is recommended.
  — [Server-side tagging](https://developers.google.com/tag-platform/tag-manager/server-side/intro)
- **Data import** — [Data import](https://support.google.com/analytics/answer/10071301?hl=en):
  - Types and join timing:
    - **Campaign (cost) data**: query-time.
    - **Item data**: query-time.
    - **User data**: by User-ID/Client-ID, processing-time.
    - **Events / offline events**: processing-time.
    - **Custom event data**: query-time.
  - Methods are CSV upload, SFTP schedule, and connected sources (beta, campaign data only).
  - Limits: 1 GB per source, 120 uploads per day, 1 GB storage per type (standard; 10 GB to 1 TB per the 360 table).
- **Cost data import** was renamed **Campaign data import** (Nov 19, 2025). Automatic cost import arrived for **Reddit** (Jul 2025), **Snap** (Sep 2025), **Pinterest** (Sep 2025), and **Meta and TikTok** (Oct 7, 2025). Expanded sources [BETA] (Jun 2025): Google Sheets, BigQuery, Snowflake, MySQL, PostgreSQL — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- 2026 campaign-import changes: a required **currency field** (Jul 28, 2026) and a **validation report** (Aug 10, 2026) — [R26](https://support.google.com/analytics/answer/9164320?hl=en)
- **Reporting identity** options — [Reporting identity](https://support.google.com/analytics/answer/10976610?hl=en):
  - **Blended**: User-ID → device ID → modeling.
  - **Observed**: User-ID → device ID.
  - **Device-based**: device ID only.
- **Google signals was removed from reporting identity on Feb 12, 2024**. It is still collected for ads audiences and demographics. The change reduces, but doesn't eliminate, thresholding — [Louder](https://louder.com.au/2024/01/12/google-signals-removed-in-ga4/); [Logical Position](https://www.logicalposition.com/blog/coming-soon-google-signals-removed-from-reporting-identity)
- **User-ID implementation diagnostic** (Oct 2, 2025) — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- **Tag Diagnostics** (Oct 11, 2024): detects tags that stopped sending, tags placed too low on the page, and "No recent data". Integrated into the **Consent settings hub** (Jun 6, 2025) — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- Event and parameter limits:
  - 25 parameters per event (100 [360]); 25 user properties (100 [360]).
  - 50 event-scoped custom dimensions and 50 custom metrics (125 [360]); 10 item-scoped dimensions (25 [360]).
  - 5 calculated metrics (50 [360]).
  - 500 distinct event names per app user (2,000 [360]); web has no limit.
  - Parameter values up to 100 characters (page_location 1,000, page_referrer 420, page_title 300).
  — [360 limits](https://support.google.com/analytics/answer/11202874?hl=en)

### Inferences
- From product knowledge, not re-fetched: cross-domain measurement and unwanted referrals live in Admin > Data streams > Configure tag settings. Session timeout defaults to 30 min and engaged-session time to 10s. Firebase SDK powers app streams. GTM's Google tag template deploys GA4 on web.
- form_start and form_submit enhanced-measurement events are widely reported as unreliable for AJAX forms. This is an inference; Google's page states no caveat.

### Gaps
- A Feb 2026 Measurement Protocol change (support for client_id/session_id cookies) appears only in a third-party summary and is not in the 2026 release notes, so it is unverified.
- Exact Measurement Protocol limits (25 events per request, etc.) were not re-verified.

---

## 8. Integrations (product links)

### Takeaway
GA4 links to the Google ad stack (Ads, SA360, DV360, CM360, Merchant Center, AdSense, Ad Manager, AdMob), Search Console, Google Business Profile (2026), BigQuery and Firebase. Looker Studio connects via a native connector.

### Cited Findings
- **BigQuery export** — [BigQuery export](https://support.google.com/analytics/answer/9358801?hl=en):
  - **Daily** export (complete, unsampled, usually mid-afternoon; tables updated up to 2–3 days late) is capped at **1M events/day** (standard) or up to **20B/day** ([360]).
  - **Streaming (intraday)** export is best-effort, has no volume cap, and costs **$0.05/GB** (~600K events/GB). It excludes traffic-source data for new users.
  - **Fresh Daily** [360] lands by ~5am with hourly-ish updates.
  - Exceeding the BigQuery sandbox limits incurs charges.
- BigQuery export traffic-source fields (session-scoped, cross-channel) were added Oct 22, 2024. Google signals data and consent-mode modeled data are **not** exported to BigQuery — [R25](https://support.google.com/analytics/answer/13420269?hl=en); [Thresholds](https://support.google.com/analytics/answer/9383630?hl=en); [Behavioral modeling](https://support.google.com/analytics/answer/11161109?hl=en)
- **Search Console**: see §1. 1 stream ↔ 1 Search Console property; Editor role and verified ownership required — [Search Console help](https://support.google.com/analytics/answer/10737381?hl=en)
- **Google Ads**:
  - Linking imports conversions and shares audiences.
  - A Google Ads recommendation enables one-click linking of unlinked properties (Sep 24, 2025).
  - Third-party sources cite a 400-link cap.
  — [R25](https://support.google.com/analytics/answer/13420269?hl=en); [Arcalea (third-party)](https://arcalea.com/ga4mrc/links-and-integrations)
- **Search Ads 360**: linked from Admin > Product links. Up to 200 properties per SA360 sub-manager account and vice versa — [SA360 help](https://support.google.com/sa360/answer/12980043)
- **Display & Video 360** and **Campaign Manager 360**: reports for linked 360 campaigns and audience sharing — [Search Engine Land](https://searchengineland.com/google-analytics-4-rolls-out-new-reports-for-linked-360-campaigns-435586); [Share audiences help](https://support.google.com/analytics/answer/12800258?hl=en)
- **Merchant Center**: a link plus **Merchant Center recommendations** that alert on product disapprovals (Nov 22, 2024) — [R25](https://support.google.com/analytics/answer/13420269?hl=en); [Merchant Center help](https://support.google.com/merchants/topic/7294470?hl=en)
- **AdSense** linking (including subproperties and roll-ups), **Ad Manager** linking — [Search Engine Land](https://searchengineland.com/?p=382576); [GoFurther](https://gofurther.com/blog/ga4-guide-chapter-9-setting-up-ga4-to-share-data-with-other-products)
- **AdMob links** (Jul 13, 2026) — [R26](https://support.google.com/analytics/answer/9164320?hl=en)
- **Google Business Profile** link (Jun 8, 2026) — [R26](https://support.google.com/analytics/answer/9164320?hl=en)
- Non-Google ad cost sources (Meta, TikTok, Pinterest, Snap, Reddit) come in via automatic campaign data import (§7). A claim that they appear as direct "product links" (Aug 2026) is unverified — [R25](https://support.google.com/analytics/answer/13420269?hl=en); [Spilno (unverified)](https://spilnoagency.com.ua/en/news-en/ga4-product-links-meta-tiktok-pinterest-reddit-snap)

### Inferences
- From product knowledge: **Firebase** is the app SDK and links per project. **Looker Studio** has a native GA4 connector that consumes Data API quota (200K tokens/day for standard; see §12).

### Gaps
- No official Google page fetched for the CM360 linking specifics, Looker Studio connector quotas, or link caps (Google Ads 400 is third-party).

---

## 9. Admin: structure, roles, governance

### Takeaway
The hierarchy is Organization → Account → Property → Data streams. Roles are Administrator, Editor, Marketer, Analyst, Viewer and None, with optional cost/revenue data restrictions and user groups (now Admin-API-managed). [360] adds subproperties and roll-up properties.

### Cited Findings
- **Roles**:
  - **Administrator**: full control, including user management.
  - **Editor**: full property settings, can view but not manage users.
  - **Marketer**: audiences, events, key events, Ads conversion import, attribution settings.
  - **Analyst**: shares explorations; requests unsampled explorations in [360].
  - **Viewer**: sees data and settings, own explorations.
  - **None**.
  — [Roles](https://support.google.com/analytics/answer/9305587?hl=en)
- **Data restrictions**: **No Cost Metrics**, **No Revenue Metrics** (apply to reports, explorations, audiences, insights, alerts) — [Roles](https://support.google.com/analytics/answer/9305587?hl=en)
- Inheritance: account-level roles flow to all properties and can be raised but not lowered below. **User groups** require a linked Organization — [Access help](https://support.google.com/analytics/answer/9305788?hl=en)
- **User Groups Admin API** (Oct 5, 2026): create, edit and delete groups and manage Member/Owner membership — [R26](https://support.google.com/analytics/answer/9164320?hl=en)
- **Data access and API quota history** (Nov 7, 2024): access-log and quota-log reports show who accessed data and consumed API quota — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- **Subproperties** [360]: up to 400 per source property, counting toward 2,000 properties per account; not creatable from roll-ups or other subproperties — [Subproperties help](https://support.google.com/analytics/answer/11525732)
- **GA360 property syncing** (Jun 2, 2025): custom dimensions and metrics sync to subproperties — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- **Roll-up properties** [360]:
  - Up to **200** source properties, all of which must be 360.
  - A roll-up doesn't collect data itself and can't feed another roll-up.
  - Some blogs cite an older cap of 50.
  — [Roll-up help](https://support.google.com/analytics/answer/11526039?hl=en); [Adswerve](https://adswerve.com/blog/all-about-google-analytics-4-aggregating-data-with-ga4-360-roll-up-properties)
- **Annotations**, **scheduled/instant email reports**, and **copy reports between properties**: see §1 — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- **Data retention** (event/user-level data, affects Explore): 2 or 14 months standard; 2/14/26/38/50 months [360] — [360 limits](https://support.google.com/analytics/answer/11202874?hl=en)
- **Per-user deletion**:
  - Done in User explorer (UI) or via the **User Deletion API** (client ID, user ID or app-instance ID).
  - Removed from the user report within 72h and purged in the next ~2-month deletion cycle.
  - Doesn't touch BigQuery.
  — [InfoTrust](https://infotrust.com/articles/google-analytics-4-dsar-and-deletion-requests/)

### Inferences
- From product knowledge: **Change history** (account/property change log) and GA4 **data-deletion requests** exist in Admin. GA4 deletion requests cover all parameters, selected parameters, or registered/unregistered parameters, with a 7-day grace period. The fetched Google page described the UA version (7-day grace, Editor role, 250 pending requests), so GA4 specifics are unverified.

### Gaps
- No fetched source for GA4 change-history retention or GA4-specific data-deletion request types.

---

## 10. Privacy and compliance: Consent Mode v2, modeling, EU data handling, GDPR status, cookies

### Takeaway
GA4 sets first-party cookies (2 years). Under GDPR/ePrivacy, an EU site needs prior consent, so in practice a consent banner is required. **Consent Mode v2** (ad_user_data and ad_personalization added) is mandatory since early 2024 for EEA personalized ads and measurement features.
- **Basic** mode sends nothing without consent.
- **Advanced** mode sends cookieless pings, which enable **behavioral modeling** (≥1,000 denied events/day and ≥1,000 consenting users/day thresholds).

GA4 doesn't log EU IPs and collects EU traffic on EU servers, but processing and storage remain Google (US) infrastructure. The 2022 DPA rulings (Austria, France, Italy, plus Denmark/Norway/Sweden) found UA transfers unlawful. The 2023 EU-US Data Privacy Framework (upheld by the General Court in *Latombe*, Sep 3, 2025; appeal pending) restores a legal transfer basis but **does not remove the consent requirement**.

### Cited Findings
- **Consent types**: ad_storage, analytics_storage, **ad_user_data** (when denied, disables user_id and hashed data for Enhanced Conversions), **ad_personalization** (when denied, disables remarketing and personalized ads), plus functionality_storage, personalization_storage, security_storage — [Consent mode docs](https://developers.google.com/tag-platform/security/concepts/consent-mode)
- **Basic consent mode**: tags are blocked until the user interacts with the banner. If the user doesn't consent, *no* data (not even consent state) is sent, and only a "general" model is used for conversion modeling — [Consent mode docs](https://developers.google.com/tag-platform/security/concepts/consent-mode)
- **Advanced consent mode**:
  - Tags load immediately with default denied and send **cookieless pings** (consent-state, key-event and GA pings).
  - Pings carry timestamp, user agent, referrer, consent state, ad-click flag and a random per-page number.
  - This enables an advertiser-specific model.
  — [Consent mode docs](https://developers.google.com/tag-platform/security/concepts/consent-mode)
- **EEA requirement**:
  - Since ~March 2024, Google requires the 4 v2 signals for personalized ads and audience building for new EEA users.
  - Google expects a Google-certified CMP for EEA/UK personalized ads.
  - Exact dates are disputed: Jan 16, 2024 vs Mar 2024 for EEA/UK, and Jul 31, 2024 for Switzerland.
  — [iubenda](https://www.iubenda.com/en/blog/google-announces-consent-mode-v2-heres-what-it-means-for-your-business-and-advertising/); [Cookie Information](https://cookieinformation.com/resources/blog/google-announces-consent-mode-v2); [SecurePrivacy](https://secureprivacy.ai/blog/google-consent-mode-v2-certified-cmp-partner)
- **Behavioral modeling**:
  - Requires ≥1,000 events/day with analytics_storage denied for ≥7 days, and ≥1,000 daily users with granted on ≥7 of the previous 28 days.
  - Requires consent mode on all pages and tags loading in all cases (advanced), and is visible only with the **Blended** reporting identity.
  - Not in BigQuery.
  — [Behavioral modeling](https://support.google.com/analytics/answer/11161109?hl=en)
- **Consent settings hub** (Jan 13, 2025) shows consent signal usage and status. Tag Diagnostics integration followed (Jun 6, 2025) — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- **IP handling**:
  - GA4 "does not log or store individual IP addresses" from EU, CH and UK users.
  - IPs are used only for coarse geolocation and then discarded.
  - Lookup happens on EU/CH/UK servers before data is forwarded to Analytics servers.
  — [EU data & privacy](https://support.google.com/analytics/answer/12017362?hl=en)
- **Granular location and device data collection**:
  - Can be disabled per region; it stops city, lat/long, browser and OS minor versions, UA string, device brand/model/name and screen resolution.
  - Disabling it significantly reduces modeled-conversion volume.
  - **Google signals** can also be toggled per region.
  — [EU data & privacy](https://support.google.com/analytics/answer/12017362?hl=en)
- **Data retention**: 2/14 months standard, up to 50 months [360] — [360 limits](https://support.google.com/analytics/answer/11202874?hl=en)
- **Cookies**: `_ga` and `_ga_<id>`, first-party, 2-year default, configurable up to 25 months — [Cookie usage](https://support.google.com/analytics/answer/11397207?hl=en)
- **DPA rulings**:
  - Austrian DSB (Jan 2022), CNIL France (Feb 2022) and Italian Garante (Jun 2022, 90 days to comply) found Google Analytics use breached GDPR transfer rules.
  - Sweden's IMY fined companies in Jul 2023 (Tele2 SEK 12M and CDON SEK 300K reported; amounts vary by source).
  — [Matomo GDPR timeline](https://matomo.org/gdpr-timeline/); [Usercentrics](https://usercentrics.com/knowledge-hub/google-analytics-and-gdpr-compliance-rulings/); [PrivyCDP](https://privycdp.org/regulation/google-analytics-gdpr-2026)
- **EU-US Data Privacy Framework**:
  - Adequacy decision 2023/1795 of Jul 10, 2023.
  - The General Court dismissed *Latombe v Commission* (T-553/23) on **Sep 3, 2025**, upholding the DPF.
  - Latombe said he would appeal to the CJEU; one source gives the case number as C-703/25 P, with a ruling expected around 2027.
  — [IAPP](https://iapp.org/news/a/european-general-court-dismisses-latombe-challenge-upholds-eu-us-data-privacy-framework); [WSGR](https://www.wsgr.com/en/insights/eu-court-upholds-the-validity-of-the-eu-us-data-privacy-framework.html); [PrivyCDP](https://privycdp.org/regulation/google-analytics-gdpr-2026)
- Commentators agree the DPF addresses the **transfer** issue, not the **consent** (ePrivacy cookie) issue. "DPF alone doesn't make GA4 GDPR-compliant." Schrems called the ruling a massive departure from earlier case law — [PrivyCDP](https://privycdp.org/regulation/google-analytics-gdpr-2026); [IAPP](https://iapp.org/news/a/european-general-court-dismisses-latombe-challenge-upholds-eu-us-data-privacy-framework)
- CNIL's Sep 2025 penalties against Google and Shein concerned cookies and consent, not transfers — [PrivyCDP](https://privycdp.org/regulation/google-analytics-gdpr-2026)

### Inferences
- For the competitor comparison: GA4 cannot legally run without a consent banner in the EU, because it sets cookies and identifiers and its data goes to a US-headquartered processor. Data from users who decline is either lost (basic mode) or modeled only above traffic thresholds that most small sites never reach (advanced mode). A cookieless, EU-hosted, consent-exempt tool can count 100% of visits. This is the core contrast.
- A CJEU appeal could re-open the transfer question, the "Schrems III" risk, so GA4's EU legal footing remains contingent.

### Gaps
- Primary DPA decision texts were not fetched; fine amounts are from secondary sources and vary.
- No primary source confirmed Google's own DPF certification status or SCC fallback for GA.
- Google's own EU User Consent Policy text and dates were not fetched.

---

## 11. APIs

### Takeaway
GA4 exposes the following APIs, each with property-level token quotas:
- **Google Analytics Data API** (v1beta): reports, pivot, realtime, alpha funnel and conversions, audience exports.
- **Admin API** (v1beta/v1alpha): config, access bindings, access reports, annotations, user groups.
- **Measurement Protocol** for ingestion; **Data Manager API** (2026) as an alternative.
- **User Deletion API**.
- A **User Activity API** for DSARs is referenced by a consultancy but not verified for GA4.

### Cited Findings
- **Data API**: standard, pivot, real-time and funnel reports plus audience exports, with OAuth or service-account auth — [PlainSignal (third-party)](https://plainsignal.pages.dev/glossary/ga4-data-api); [Apps Script Analytics Data service](https://developer.google.com/apps-script/advanced/analyticsdata)
- **Conversion support in the Data API** [ALPHA] (May 4, 2026): cross-channel conversion reporting — [R26](https://support.google.com/analytics/answer/9164320?hl=en)
- **API quota**: 200,000 tokens/day per property (standard) vs 2M ([360]) — [360 limits](https://support.google.com/analytics/answer/11202874?hl=en)
- **Admin API**:
  - User access via `accessBindings` (v1beta), replacing v1alpha `userLinks` [DEPRECATED].
  - `runAccessReport` (data access log, incl. UI vs API).
  - Annotations creatable via the Admin API.
  - User Groups API (Oct 2026).
  — [Admin API access docs](https://developers.google.com/analytics/devguides/config/admin/v1/access-api); [GOV.UK data community](https://docs.data-community.publishing.service.gov.uk/data-sources/ga/ga4-logs); [R25](https://support.google.com/analytics/answer/13420269?hl=en); [R26](https://support.google.com/analytics/answer/9164320?hl=en)
- **Measurement Protocol** (see §7) and **Data Manager API** for server-to-server events (May 7, 2026) — [MP docs](https://developers.google.com/analytics/devguides/collection/protocol/ga4); [R26](https://support.google.com/analytics/answer/9164320?hl=en)
- **User Deletion API** (v3 path) deletes by client ID, user ID or app-instance ID. A **"User Activity API"** for retrieving one user's data is cited (doc path "core/v4") — [InfoTrust](https://infotrust.com/articles/google-analytics-4-dsar-and-deletion-requests/)

### Inferences
- The "User Activity API" InfoTrust cites points to a core/v4 path. That is the Universal Analytics Reporting API v4 `userActivity.search`, which does not serve GA4 properties. **Treat it as UA-era/unverified for GA4**: GA4's per-user lookup appears to be UI-only (User explorer) plus BigQuery.

### Gaps
- Could not confirm from developers.google.com whether a GA4-native User Activity API exists in 2026, or the exact Data API method list and versions.

---

## 12. Pricing, limits, quotas, sampling and data freshness

### Takeaway
GA4 standard is free. **Analytics 360** has no public price list; it is sold via Google or partners on a usage (event-volume) basis. Third parties estimate it from ~$50K/yr to $150K+/yr. 360 buys SLAs, higher limits (see the table), unsampled explorations, Fresh Daily BigQuery export, 50-month retention, subproperties and roll-ups.
- Standard daily data lands within ~12h nominally; Google says it can take 24–48h to settle.
- Standard intraday data lags 2–6h vs ~1h on 360.

### Cited Findings
- 360 pricing: no public price; buy via sales or a partner. Usage-based from ~$50K/yr (one source) vs "~$150K/yr" (older/UA-era figure) — [Fathom](https://usefathom.com/learn/google-analytics-pricing); [Tatvic](https://www.tatvic.com/blog/google-analytics-vs-google-analytics-360-limitations-and-pricing/)
- OptimizeSmart's view of 360:
  - "Likely to cost you $150k or more per year", billed monthly on billable event volume under a 360 contract.
  - Includes an SLA covering collection, reporting, freshness, attribution and BigQuery export; uptime credits start at 5% for 96–98% uptime and reach 25% below 90%.
  - Includes a dedicated account manager.
  — [OptimizeSmart](https://optimizesmart.com/blog/ga4-vs-ga4-360-pricing-limits-billing-and-more/)
- **Standard vs 360 limits** (selection) — [Google: Analytics 360](https://support.google.com/analytics/answer/11202874?hl=en):

| Limit | Standard | 360 |
|---|---|---|
| Key events | 30 | 50 |
| Audiences | 100 | 400 |
| Event-scoped custom dims / metrics | 50 / 50 | 125 / 125 |
| Item-scoped custom dims | 10 | 25 |
| Params per event / user properties | 25 / 25 | 100 / 100 |
| Calculated metrics | 5 | 50 |
| Saved segments / comparisons | 50 / 50 | 200 / 200 |
| Explore sampling threshold | 10M events | 1B events |
| Unsampled explorations | No | 20K tokens/day, 5K/query |
| Data API quota | 200K tokens/day | 2M tokens/day |
| Data retention | 2 or 14 months | up to 50 months |
| BigQuery daily export | 1M events/day | billions (20B/day) |
| BigQuery streaming | unlimited (paid per GB) | unlimited |
| Data import storage | 10 GB | 1 TB |
| Distinct app event names per user | 500 | 2,000 |

- **Data freshness** — [Data freshness](https://support.google.com/analytics/answer/11198161?hl=en):
  - Realtime: a few minutes.
  - **Intraday**: 2–6h standard vs ~1h [360].
  - **Daily**: 12h for standard and 360 Normal, 18h for 360 Large, 24h+ for 360 XL.
  - "Daily data can take 24–48 hours to settle." Typically ready by ~3:30pm property time, not guaranteed.
  - Property tiers: Normal (<25B events/31d), Large (≥25B), XL (≥250B).
- **Thresholding**:
  - System-defined and not adjustable.
  - Applies to demographics, search-query rows with too few users, and audiences built on demographics.
  - Widening the date range can help.
  — [Data thresholds](https://support.google.com/analytics/answer/9383630?hl=en)
- [360] **SLA** coverage. Large properties may take up to a week to fully process, per OptimizeSmart — [360 limits](https://support.google.com/analytics/answer/11202874?hl=en); [OptimizeSmart](https://optimizesmart.com/blog/ga4-vs-ga4-360-pricing-limits-billing-and-more/)

### Inferences
- Standard reports aren't sampled; sampling bites in Explore (10M events), which small sites rarely hit. Thresholding and retention are the practical limits for small business. This is product knowledge, partially supported by the Explore help.

### Gaps
- No official 360 list price or tier table exists publicly; all figures are third-party estimates.

---

## 13. Pain points small businesses report

### Takeaway
Recurring complaints:
- Complexity: events-only model, custom dimensions needed to see parameters, a confusing UI.
- Data delays: 24–48h to settle.
- Thresholding hiding rows on small sites.
- 2-month default Explore retention.
- Consent-banner dependence, with large unmodeled data loss because small sites miss the 1,000/day modeling thresholds.
- (not set) and "(data not available)" attribution gaps.
- Ad-blocker and Safari loss.

Many quantitative claims come from vendors selling alternatives, so treat the percentages cautiously.

### Cited Findings
- Thresholding can't be disabled. One example: a small WooCommerce store saw ~15% fewer conversions in GA4 than in its store data, with a "data threshold applied" message — [Funnel.io help](https://help.funnel.io/en/articles/16746941-troubleshoot-missing-data-caused-by-thresholding-in-ga4); [Analytify](https://analytify.io/ga4-data-thresholding/)
- Processing delay: the 24–48h figure is most often cited and matches Google's "24–48 hours to settle". Vendors claim up to 72h — [Data freshness](https://support.google.com/analytics/answer/11198161?hl=en); [GoodMetrics](https://goodmetrics.io/blog/ga4-limitations)
- Consent loss: until the user responds, GA4 can't collect (basic mode). Vendor-cited consent refusal rates of 30–60% are unverified — [Clickport (vendor, biased)](https://clickport.io/blog/stop-using-google-analytics); [Consent mode docs](https://developers.google.com/tag-platform/security/concepts/consent-mode)
- Modeling only kicks in above 1,000 denied events/day and 1,000 consenting users/day. Disabling granular location data "significantly reduces" modeled volume — [Behavioral modeling](https://support.google.com/analytics/answer/11161109?hl=en); [EU data & privacy](https://support.google.com/analytics/answer/12017362?hl=en)
- Browser and ad-blocker loss is estimated at 10–20% undercounting (vendor estimate) — [Clickport (vendor)](https://clickport.io/blog/stop-using-google-analytics)
- General UX and complexity complaints ("still awful", "5 things I hate"); attribution confusion — [MarketingProfs](https://www.marketingprofs.com/opinions/2024/50756/google-analytics-4-still-awful); [Browser Media](https://browsermedia.agency/blog/5-things-i-hate-about-ga4/); [Silverback Labs](https://silverbacklabs.net/google-analytics/ga4-difficulties-ga4-breaks-hearts-and-marketing-attribution-reports/)
- Google itself added warnings for high "(not set)" rates, missing session_start, and "(data not available)" source values (Mar 2025), acknowledging data-quality issues — [R25](https://support.google.com/analytics/answer/13420269?hl=en)
- Explore retention defaults to 2 months, so older user-level analysis is impossible unless changed in advance — [Explore help](https://support.google.com/analytics/answer/7579450?hl=en)

### Inferences
- Google's 2025–2026 roadmap leans toward advertisers: Ads conversion management, cross-channel budgeting, cost imports, Advisor tied to Ads, and Data Manager. Simplicity for non-advertising small sites (lead forms, Search Console trends) is not the focus. That leaves room for a focused, cookieless EU tool.

### Gaps
- No independent (non-vendor) survey quantifying small-business GA4 abandonment or consent-rate losses was found.
