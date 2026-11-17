# GA4: everything Google Analytics 4 collects and reports (events, metrics, dimensions, storage) as of November 2026

Research date: 2026-11-16. Primary sources were pulled directly (raw HTML, parsed locally) from developers.google.com and support.google.com/analytics. The Data API schema page carried "Last updated 2026-11-10 UTC". Universal Analytics (UA) appears only where labeled **[historical/UA]**. Items marked **[360]** are GA4 360-only per Google's 360 limits page.

Source keys used below:
- [API schema] https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema
- [UI D&M] "Analytics dimensions and metrics": https://support.google.com/analytics/answer/9143382
- [Auto events] https://support.google.com/analytics/answer/9234069
- [EM] Enhanced measurement events: https://support.google.com/analytics/answer/9216061
- [Rec events] https://support.google.com/analytics/answer/9267735
- [Events ref] gtag recommended-event reference: https://developers.google.com/analytics/devguides/collection/ga4/reference/events?client_type=gtag
- [360 limits] https://support.google.com/analytics/answer/11202874

## 1. Which events does GA4 collect automatically, which come from Enhanced Measurement, and what parameters do they carry?

### Takeaway
On the web, GA4 always collects `first_visit`, `session_start`, `user_engagement` and `page_view`, plus a fixed set of parameters on every event. Enhanced Measurement adds scroll (90% only), outbound `click`, `view_search_results`, YouTube `video_*`, `file_download` and `form_start`/`form_submit`, and on by default it also fires page_view on browser-history (SPA) changes. Most other "automatic" events are app-only (Firebase).

### Cited Findings
**Parameters sent with every event** ([Auto events](https://support.google.com/analytics/answer/9234069))
- Web stream: `language`, `page_location`, `page_referrer`, `page_title`, `screen_resolution`. App stream: `app_version`, `firebase_screen_id`, `firebase_screen_class`.
- Value-length limits: parameter values ≤100 chars. Exceptions: `page_title` ≤300, `page_referrer` ≤420, `page_location` ≤1,000.
- `ga_session_id` (the session start timestamp in seconds) and `ga_session_number` (ordinal of the user's session) are attached to every event in a session by gtag.js/Firebase, but not to Measurement Protocol or Data Import events ([Sessions](https://support.google.com/analytics/answer/9191807)).
- `is_engaged_session_event` "has been added to all events" to compute engagement/bounce rate ([Engagement rate](https://support.google.com/analytics/answer/12195621)).

**Web automatically collected events** ([Auto events](https://support.google.com/analytics/answer/9234069))
| Event | Trigger | Parameters |
|---|---|---|
| `first_visit` (app, web) | first time a user visits a website / launches an Android instant app | client_id, ga_session_id, ga_session_number, ignore_referrer, page_location, page_referrer, page_title, traffic_type |
| `session_start` (app, web) | user engages the app/website; session ID + number generated | client_id, ga_session_id, ga_session_number, ignore_referrer, page_location, page_referrer, page_title, traffic_type |
| `user_engagement` (app, web) | app in foreground or page in focus for ≥1 second | engagement_time_msec |
| `page_view` (web) | each page load or browser-history state change by the active site | page_location, page_referrer, engagement_time_msec |

**Enhanced Measurement events (web only, toggled per web data stream, no code change)** ([EM](https://support.google.com/analytics/answer/9216061))
| Option → event | Trigger | Parameters → dimensions |
|---|---|---|
| Page views → `page_view` | page load or history change. Can't be turned off. An advanced setting controls the history-based trigger (listens to pushState, popState, replaceState) | page_location, page_referrer → Page location, Page referrer. Populates Views metric |
| Scrolls → `scroll` | first time 90% vertical depth becomes visible (one threshold only) | engagement_time_msec → Percent scrolled dimension (value "90") |
| Outbound clicks → `click` | link leading away from current domain (cross-domain-configured domains excluded) | link_classes, link_domain, link_id, link_url, outbound (boolean) |
| Site search → `view_search_results` | URL contains query param `q`, `s`, `search`, `query` or `keyword` (additional params configurable) | search_term (→ Search term), optional `q_<key>` params. `unique_search_term`=1 only when unique to the session |
| Video engagement → `video_start`, `video_progress` (10/25/50/75%), `video_complete` | embedded YouTube with JS API enabled | video_current_time, video_duration, video_percent, video_provider, video_title, video_url, visible |
| File downloads → `file_download` | click on link with extension matching `pdf\|xlsx?\|docx?\|txt\|rtf\|csv\|exe\|key\|pp(s\|t\|tx)\|7z\|pkg\|rar\|gz\|zip\|avi\|mov\|mp4\|mpe?g\|wmv\|midi?\|mp3\|wav\|wma` | file_extension, file_name, link_classes, link_id, link_text, link_url |
| Form interactions → `form_start`, `form_submit` | first interaction with a form in a session, and form submission | form_id, form_name, form_destination (+ form_submit_text on submit). Parameters need custom dimensions to be reportable |

- Site-owner is "required to ensure that no personally identifiable information is collected" by EM ([EM](https://support.google.com/analytics/answer/9216061)).

**App-only automatically collected events** (Firebase SDK) ([Auto events](https://support.google.com/analytics/answer/9234069)): `ad_click`, `ad_exposure`, `ad_impression`, `ad_query`, `ad_reward`, `adunit_exposure`, `app_clear_data` (Android), `app_exception` (Crashlytics), `app_remove` (Android), `app_store_refund` (Android), `app_store_subscription_cancel` (Android), `app_store_subscription_convert`, `app_store_subscription_renew`, `app_update`, `dynamic_link_app_open` / `dynamic_link_app_update` / `dynamic_link_first_open` (being phased out with Firebase Dynamic Links), `error`, `firebase_campaign`, `firebase_in_app_message_action|dismiss|impression` (Android: `fiam_*`), `first_open`, `in_app_purchase`, `notification_dismiss`, `notification_foreground`, `notification_open`, `notification_receive`, `os_update`, `screen_view`. Several (ad_exposure, ad_query, adunit_exposure, error) don't appear in reports, and several aren't exported to BigQuery.

### Inferences
- For a small-business website, the default GA4 event set is essentially: first_visit, session_start, user_engagement, page_view, plus the 6 EM groups (9 events). Everything else (ecommerce, leads, login) requires manual tagging.
- GA4's scroll tracking is a single 90% threshold. Finer scroll-depth data needs custom events, so it's a low bar for a competitor to match or beat.

### Gaps
- Google's exact list of "file extensions" is the regex above. No other file types are documented.

## 2. Which recommended events exist, and what parameters do they take?

### Takeaway
Google groups recommended events into four sets: all properties, online sales (ecommerce), lead generation and games. None fire automatically; they all need manual tagging with prescribed parameters, which populate the predefined ecommerce, lead and gaming dimensions and metrics.

### Cited Findings
**For all properties** ([Rec events](https://support.google.com/analytics/answer/9267735); params from [Events ref](https://developers.google.com/analytics/devguides/collection/ga4/reference/events?client_type=gtag))
- `ad_impression` (apps only), `earn_virtual_currency` (virtual_currency_name, value), `generate_lead`, `join_group` (group_id), `login` (method), `purchase`, `refund`, `search` (search_term), `select_content` (content_type, content_id), `share` (method, content_type, item_id), `sign_up` (method), `spend_virtual_currency` (value, virtual_currency_name, item_name), `tutorial_begin`, `tutorial_complete`.

**Online sales / ecommerce** ([Rec events](https://support.google.com/analytics/answer/9267735); [Events ref](https://developers.google.com/analytics/devguides/collection/ga4/reference/events?client_type=gtag))
- `add_payment_info` (currency, value, coupon, payment_type, items), `add_shipping_info` (currency, value, coupon, shipping_tier, items), `add_to_cart` (currency, value, items), `add_to_wishlist` (currency, value, items), `begin_checkout` (currency, value, coupon, items), `purchase` (currency, value, **customer_type**, transaction_id, coupon, shipping, tax, items), `refund` (currency, transaction_id, value, coupon, shipping, tax, items), `remove_from_cart` (currency, value, items), `select_item` (item_list_id, item_list_name, items), `select_promotion` (creative_name, creative_slot, promotion_id, promotion_name, items), `view_cart` (currency, value, items), `view_item` (currency, value, items), `view_item_list` (item_list_id, item_list_name, items), `view_promotion` (creative_name, creative_slot, promotion_id, promotion_name, items).
- Item object parameters: item_id, item_name, affiliation, coupon, discount, index, item_brand, item_category … item_category5, item_list_id, item_list_name, item_variant, location_id, price, quantity. Up to 27 additional custom item-level params per ecommerce event ([Collection limits](https://support.google.com/analytics/answer/9267744)).

**Lead generation** (populates the Lead acquisition report) ([Rec events](https://support.google.com/analytics/answer/9267735); [Events ref](https://developers.google.com/analytics/devguides/collection/ga4/reference/events?client_type=gtag))
- `generate_lead` (currency, value, lead_source), `qualify_lead` (currency, value), `disqualify_lead` (currency, value, disqualified_lead_reason), `working_lead` (currency, value, lead_status), `close_convert_lead` (currency, value), `close_unconvert_lead` (currency, value, unconvert_lead_reason).
- UI-only metrics fed by these: New leads (unique users with generate_lead), Qualified leads (qualify_lead), Converted leads (close_convert_lead) ([UI D&M](https://support.google.com/analytics/answer/9143382)).

**Games** ([Rec events](https://support.google.com/analytics/answer/9267735))
- `earn_virtual_currency`, `join_group`, `level_end` (level_name, success), `level_start` (level_name), `level_up` (level, character), `post_score` (score, level, character), `select_content`, `spend_virtual_currency`, `tutorial_begin`, `tutorial_complete`, `unlock_achievement` (achievement_id).

**Key events (formerly "conversions")**
- Any event can be marked a key event. Limits are 30 (standard) and 50 [360] ([360 limits](https://support.google.com/analytics/answer/11202874)). first_visit, first_open and session_start are excluded from engaged-session calculation even if marked as key events ([Engagement rate](https://support.google.com/analytics/answer/12195621)).
- Collection caps: 10,000 conversions per user per day, 100,000 events per user per day, 2,000 distinct sessions per user per day, event name ≤40 chars ([Collection limits](https://support.google.com/analytics/answer/9267744)).

### Inferences
- The lead-gen funnel events are the relevant comparison point for small-business sites (contact forms). GA4 still needs manual `generate_lead` tagging, while EM's `form_submit` fires generically without lead semantics.

### Gaps
- I didn't find an official changelog date for when `customer_type` (new/returning) was added to `purchase`.
- I didn't find an official date for the "conversions → key events" rename in the pages I read. The API now uses `keyEvents`, `isKeyEvent` and `sessionKeyEventRate`.

## 3. What is the full catalog of standard metrics (API + UI), grouped by category?

### Takeaway
The GA4 Data API v1 exposes **86 standard metrics**, plus templated custom metrics and per-key-event rates. The GA4 UI and Explorations add about 80 more UI-only metrics, including Returning users, Average engagement time, Entrances/Exits, Lifetime/LTV, predictive metrics, repeat-purchaser metrics, lead metrics, "online" and "keyed server-to-server" variants, and Google vs non-Google cost.

### Cited Findings
**A. Complete Data API metric list**, verbatim API names and UI names, with first sentence of the official description ([API schema](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)):

Data API v1 schema: **86 standard metrics** (page last updated 2026-11-10).

**Users** (9)
- `active1DayUsers` — 1-day active users: The number of distinct active users on your site or app within a 1 day period
- `active28DayUsers` — 28-day active users: The number of distinct active users on your site or app within a 28 day period
- `active7DayUsers` — 7-day active users: The number of distinct active users on your site or app within a 7 day period
- `activeUsers` — Active users: The number of distinct users who visited your site or app
- `dauPerMau` — DAU / MAU: The rolling percent of 30-day active users who are also 1-day active users
- `dauPerWau` — DAU / WAU: The rolling percent of 7-day active users who are also 1-day active users
- `newUsers` — New users: The number of users who interacted with your site or launched your app for the first time (event triggered: first_open or…
- `totalUsers` — Total users: The number of distinct users who have logged at least one event, regardless of whether the site or app was in use when that…
- `wauPerMau` — WAU / MAU: The rolling percent of 30-day active users who are also 7-day active users

**Sessions, engagement & page/screen views** (11)
- `averageSessionDuration` — Average session duration: The average duration (in seconds) of users` sessions
- `bounceRate` — Bounce rate: The percentage of sessions that were not engaged ((Sessions Minus Engaged sessions) divided by Sessions)
- `engagedSessions` — Engaged sessions: The number of sessions that lasted longer than 10 seconds, or had a key event, or had 2 or more screen views
- `engagementRate` — Engagement rate: The percentage of engaged sessions (Engaged sessions divided by Sessions)
- `screenPageViews` — Views: The number of app screens or web pages your users viewed
- `screenPageViewsPerSession` — Views per session: The number of app screens or web pages your users viewed per session
- `screenPageViewsPerUser` — Views per user: The number of app screens or web pages your users viewed per active user
- `scrolledUsers` — Scrolled users: The number of unique users who scrolled down at least 90% of the page
- `sessions` — Sessions: The number of sessions that began on your site or app (event triggered: session_start)
- `sessionsPerUser` — Sessions per user: The average number of sessions per user (Sessions divided by Active Users)
- `userEngagementDuration` — User engagement: The total amount of time (in seconds) your website or app was in the foreground of users` devices

**Events & key events (conversions)** (7)
- `eventCount` — Event count: The count of events
- `eventCountPerUser` — Event count per user: The average number of events per user (Event count divided by Active users)
- `eventValue` — Event value: The sum of the event parameter named value
- `eventsPerSession` — Events per session: The average number of events per session (Event count divided by Sessions)
- `keyEvents` — Key events: The count of key events
- `sessionKeyEventRate` — Session key event rate: The percentage of sessions in which any key event was triggered
- `userKeyEventRate` — User key event rate: The percentage of users who triggered any key event

**Ecommerce — funnel & item metrics** (23)
- `addToCarts` — Add to carts: The number of times users added items to their shopping carts
- `cartToViewRate` — Cart-to-view rate: The number of users who added a product(s) to their cart divided by the number of users who viewed the same product(s)
- `checkouts` — Checkouts: The number of times users started the checkout process
- `ecommercePurchases` — Ecommerce purchases: The number of times users completed a purchase
- `itemDiscountAmount` — Item discount amount: The monetary value of item discounts in eCommerce events
- `itemListClickEvents` — Item-list click events: The number of times users clicked an item when it appeared in a list
- `itemListClickThroughRate` — Item list click through rate: The number of users who selected a list(s) divided by the number of users who viewed the same list(s)
- `itemListViewEvents` — Item-list view events: The number of times the item list was viewed
- `itemPromotionClickThroughRate` — Item promotion click through rate: The number of users who selected a promotion(s) divided by the number of users who viewed the same promotion(s)
- `itemRefundAmount` — Item refund amount: Item refund amount is the total refunded transaction revenue from items only
- `itemRevenue` — Item revenue: The total revenue from purchases minus refunded transaction revenue from items only
- `itemViewEvents` — Item view events: The number of times the item details were viewed
- `itemsAddedToCart` — Items added to cart: The number of units added to cart for a single item
- `itemsCheckedOut` — Items checked out: The number of units checked out for a single item
- `itemsClickedInList` — Items clicked in list: The number of units clicked in list for a single item
- `itemsClickedInPromotion` — Items clicked in promotion: The number of units clicked in promotion for a single item
- `itemsPurchased` — Items purchased: The number of units for a single item included in purchase events
- `itemsViewed` — Items viewed: The number of units viewed for a single item
- `itemsViewedInList` — Items viewed in list: The number of units viewed in list for a single item
- `itemsViewedInPromotion` — Items viewed in promotion: The number of units viewed in promotion for a single item
- `promotionClicks` — Promotion clicks: The number of times an item promotion was clicked
- `promotionViews` — Promotion views: The number of times an item promotion was viewed
- `purchaseToViewRate` — Purchase-to-view rate: The number of users who purchased a product(s) divided by the number of users who viewed the same product(s)

**Revenue, purchasers & transactions** (18)
- `averagePurchaseRevenue` — Average purchase revenue: The average purchase revenue in the transaction group of events
- `averagePurchaseRevenuePerPayingUser` — ARPPU: Average revenue per paying user (ARPPU) is the total purchase revenue per active user that logged a purchase event
- `averagePurchaseRevenuePerUser` — Average purchase revenue per user: The average purchase revenue per active user is the total purchase revenue per active user that logged any event
- `averageRevenuePerUser` — ARPU: Average revenue per active user (ARPU)
- `firstTimePurchaserRate` — First-time purchaser rate: The percentage of active users who made their first purchase
- `firstTimePurchasers` — First time purchasers: The number of users that completed their first purchase event
- `firstTimePurchasersPerNewUser` — First-time purchasers per new user: The average number of first time purchasers per new user
- `grossItemRevenue` — Gross item revenue: The total revenue from items only
- `grossPurchaseRevenue` — Gross purchase revenue: The sum of revenue from purchases made in your app or site
- `purchaseRevenue` — Purchase revenue: The sum of revenue from purchases minus refunded transaction revenue made in your app or site
- `purchaserRate` — Purchaser rate: The percentage of active users who made 1 or more purchase transactions
- `refundAmount` — Refund amount: The total refunded transaction revenues
- `shippingAmount` — Shipping amount: Shipping amount associated with a transaction
- `taxAmount` — Tax amount: Tax amount associated with a transaction
- `totalPurchasers` — Total purchasers: The number of users that logged purchase events for the time period selected
- `totalRevenue` — Total revenue: The sum of revenue from purchases, subscriptions, and advertising (Purchase revenue plus Subscription revenue plus Ad…
- `transactions` — Transactions: The count of transaction events with purchase revenue
- `transactionsPerPurchaser` — Transactions per purchaser: The average number of transactions per purchaser

**Advertising / cost (Google Ads + imported non-Google cost)** (6)
- `advertiserAdClicks` — Ads clicks: Total number of times users have clicked on an ad to reach the property
- `advertiserAdCost` — Ads cost: The total amount you paid for your ads
- `advertiserAdCostPerClick` — Ads cost per click: Ads cost per click is ad cost divided by ad clicks and is often abbreviated CPC
- `advertiserAdCostPerKeyEvent` — Cost per key event: Cost per key event is ad cost divided by key events
- `advertiserAdImpressions` — Ads impressions: The total number of impressions
- `returnOnAdSpend` — Return on ad spend: Return On Ad Spend (ROAS) is total revenue divided by advertiser ad cost

**Publisher ads (monetization)** (4)
- `adUnitExposure` — Ad unit exposure: The time that an ad unit was exposed to a user, in milliseconds
- `publisherAdClicks` — Publisher ad clicks: The number of ad_click events
- `publisherAdImpressions` — Publisher ad impressions: The number of ad_impression events
- `totalAdRevenue` — Total ad revenue: The total advertising revenue from both Admob and third-party sources

**Cohort / retention** (2)
- `cohortActiveUsers` — Cohort active users: The number of users in the cohort who are active in the time window corresponding to the cohort nth day/week/month
- `cohortTotalUsers` — Cohort total users: The total number of users in the cohort

**App stability (Firebase/Crashlytics)** (2)
- `crashAffectedUsers` — Crash-affected users: The number of users that logged a crash in this row of the report
- `crashFreeUsersRate` — Crash-free users rate: The number of users without crash events (in this row of the report) divided by the total number of users

**Search Console (requires Search Console link)** (4)
- `organicGoogleSearchAveragePosition` — Organic Google Search average position: The average ranking of your website URLs for the query reported from Search Console
- `organicGoogleSearchClickThroughRate` — Organic Google Search click through rate: The organic Google Search click through rate reported from Search Console
- `organicGoogleSearchClicks` — Organic Google Search clicks: The number of organic Google Search clicks reported from Search Console
- `organicGoogleSearchImpressions` — Organic Google Search impressions: The number of organic Google Search impressions reported from Search Console

**Templated / custom metrics in the API** ([API schema](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema))
- `customEvent:parameter_name` (sum of an event-scoped custom metric), `averageCustomEvent:parameter_name`, `countCustomEvent:parameter_name`, legacy `customEvent:parameter_name[event_name]` (registered before October 2020).
- `sessionKeyEventRate:event_name` and `userKeyEventRate:event_name` give the rate for one specific key event.

**B. UI/Explorations-only metrics (not in the Data API list)** ([UI D&M](https://support.google.com/analytics/answer/9143382) unless noted)
- *User:* Returning users (users with ≥1 previous session); Average engagement time; Average engagement time per session; Average online session engagement; Active online users; Active keyed server-to-server users; 7-/30-/90-day paid active users; 1-day, 2–7-day, 8–30-day and 31–90-day repeat purchasers; Average/Max/Min daily purchasers; PMAU/DAU; PWAU/DAU; FTP conversion; New leads; Qualified leads; Converted leads.
- *Session:* Engaged sessions per active user; Engaged online sessions per active user; Low engagement sessions (= sessions minus engaged); Online sessions; Online engaged sessions; Online session duration; Keyed server-to-server sessions / engaged sessions.
- *Page/screen:* Entrances; Exits; Views per active user; Online active user views; Online session views; Elapsed time from last page request.
- *Event:* First visits; First opens; Online event count; Keyed server-to-server events (S2S events carrying a transaction_id); Online session events.
- *Ecommerce/revenue:* Purchases; Refunds; Product revenue; Ecommerce purchase quantity; Item quantity; Average daily revenue; Max/Min daily revenue; Combined revenue per cohort total first visits / first opens / both.
- *Advertising:* Google Ads clicks, cost, cost per click, impressions, video views; Non-Google clicks, cost, cost per click, cost per conversion, impressions; Return on non-Google ad spend; Days to key event; Touchpoints to key event.
- *Publisher:* Ad exposure (app only).
- *User lifetime (Explorations "User lifetime" technique):* LTV; LTV percentile; Lifetime ad revenue; Lifetime engaged sessions; Lifetime engagement duration; Lifetime session duration; Lifetime sessions; Lifetime transactions; Average 120d value (sum of purchase, subscription and ads revenue in a user's first 120 days).
- *Predictive:* Purchase probability (users active in last 28 days who will log the purchase key event in the next 7 days); Churn probability (users active in last 7 days who won't be active in the next 7 days); Predicted revenue (expected revenue from purchase key events in the next 28 days); In-app purchase probability. Only usable in the audience builder and the Explorations User-lifetime technique (purchase and churn probability). Eligibility needs ≥1,000 returning users who triggered the condition and ≥1,000 who didn't, within a 7-day period in the last 28 days ([Predictive](https://support.google.com/analytics/answer/9846734)).
- *Search Console (reports only after linking):* the 4 metrics above, compatible only with Search Console dimensions and Landing page, Device and Country. Data is capped at 16 months and lags 48 hours ([Search Console](https://support.google.com/analytics/answer/10737381)).
- *Google Business Profile (new June 2026):* 7 metrics once linked: GBP interactions, calls, bookings, directions, website clicks, messages, menus. Only a rolling 6-month window is available ([What's new](https://support.google.com/analytics/answer/9164320)).

**C. Key metric definitions**
- Engaged session = lasts longer than 10 s, or has a key event, or has ≥2 page/screen views. Engagement rate = engaged sessions / sessions. Bounce rate = 1 − engagement rate ([Engagement rate](https://support.google.com/analytics/answer/12195621)). The 10 s timer is adjustable per web stream ("Adjust timer for engaged sessions"), and session timeout defaults to 30 min, also adjustable ([Sessions](https://support.google.com/analytics/answer/9191807)).
- Total users = unique users who triggered any event. New users = users who logged first_visit/first_open. Active users = users with an engaged session, or first_visit, or engagement_time_msec. Returning users = users with ≥1 previous session. Reports show only active users ([User metrics](https://support.google.com/analytics/answer/12253918)).
- Sessions and users are estimated with HyperLogLog++ (sketch precision 14) in reports. BigQuery gives exact counts. Discrepancy is usually <1% ([Sampling](https://support.google.com/analytics/answer/13331292); [Sessions](https://support.google.com/analytics/answer/9191807)).

### Inferences
- Of the 86 API metrics, 53 are ecommerce, revenue, advertising, publisher-ads or app-crash metrics. The core "web traffic" metric set a small business uses is about 20: totalUsers, activeUsers, newUsers, sessions, engagedSessions, engagementRate, bounceRate, averageSessionDuration, userEngagementDuration, sessionsPerUser, screenPageViews, screenPageViewsPerSession, screenPageViewsPerUser, eventCount, eventsPerSession, keyEvents, sessionKeyEventRate, userKeyEventRate, scrolledUsers, active1/7/28DayUsers, plus Returning users, Avg engagement time, Entrances and Exits from the UI.
- **[historical/UA]** UA bounce rate meant single-hit sessions. GA4 bounce rate means not-engaged sessions, so the numbers aren't comparable.

### Gaps
- The Data API metric list has no Returning users, Average engagement time, Entrances/Exits, LTV or predictive metrics. These appear only in the UI article. I didn't verify whether the Data API's newer alpha "conversion" surface (announced May 2026) adds metrics.

## 4. What is the full catalog of standard dimensions, grouped by category?

### Takeaway
The Data API v1 exposes **374 standard dimensions**. Roughly 225 are attribution and advertising fields, each repeated across three scopes: key-event-scoped, session-scoped (`session…`) and user/first-acquisition-scoped (`firstUser…`). The rest cover page/screen, events, geography, device, time, cohort, ecommerce, gaming, demographics and admin. The UI adds a few more, such as Region ID, Subcontinent, App store and user-lifetime dates.

### Cited Findings
**A. Complete Data API dimension list** ([API schema](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)):

Data API v1 schema: **374 standard dimensions** (page last updated 2026-11-10).

**Attribution / traffic source — generic (source, medium, campaign, channel)** (24)
- `campaignId` — Campaign ID: The identifier of the marketing campaign
- `campaignName` — Campaign: The name of the marketing campaign
- `defaultChannelGroup` — Default channel group: The key event's default channel group is based primarily on source and medium
- `firstUserCampaignId` — First user campaign ID: Identifier of the marketing campaign that first acquired the user
- `firstUserCampaignName` — First user campaign: Name of the marketing campaign that first acquired the user
- `firstUserDefaultChannelGroup` — First user default channel group: The default channel group that first acquired the user
- `firstUserMedium` — First user medium: The medium that first acquired the user to your website or app
- `firstUserPrimaryChannelGroup` — First user primary channel group: The primary channel group that originally acquired a user
- `firstUserSource` — First user source: The source that first acquired the user to your website or app
- `firstUserSourceMedium` — First user source / medium: The combined values of the dimensions firstUserSource and firstUserMedium
- `firstUserSourcePlatform` — First user source platform: The source platform that first acquired the user
- `medium` — Medium: The medium attributed to the key event
- `primaryChannelGroup` — Primary channel group: The primary channel group attributed to the key event
- `sessionCampaignId` — Session campaign ID: The marketing campaign ID for a session
- `sessionCampaignName` — Session campaign: The marketing campaign name for a session
- `sessionDefaultChannelGroup` — Session default channel group: The session's default channel group is based primarily on source and medium
- `sessionMedium` — Session medium: The medium that initiated a session on your website or app
- `sessionPrimaryChannelGroup` — Session primary channel group: The primary channel group that led to the session
- `sessionSource` — Session source: The source that initiated a session on your website or app
- `sessionSourceMedium` — Session source / medium: The combined values of the dimensions sessionSource and sessionMedium
- `sessionSourcePlatform` — Session source platform: The source platform of the session's campaign
- `source` — Source: The source attributed to the key event
- `sourceMedium` — Source / medium: The combined values of the dimensions source and medium
- `sourcePlatform` — Source platform: The source platform of the key event's campaign

**Page / screen / content** (16)
- `contentGroup` — Content group: A category that applies to items of published content
- `contentId` — Content ID: The identifier of the selected content
- `contentType` — Content type: The category of the selected content
- `fullPageUrl` — Full page URL: The hostname, page path, and query string for web pages visited; for example, the fullPageUrl portion of…
- `hostName` — Hostname: Includes the subdomain and domain names of a URL; for example, the Host Name of www.example.com/contact.html is…
- `landingPage` — Landing page: The page path associated with the first pageview in a session
- `landingPagePlusQueryString` — Landing page + query string: The page path + query string associated with the first pageview in a session
- `pageLocation` — Page location: The protocol, hostname, page path, and query string for web pages visited; for example, the pageLocation portion of…
- `pagePath` — Page path: The portion of the URL between the hostname and query string for web pages visited; for example, the pagePath portion of…
- `pagePathPlusQueryString` — Page path + query string: The portion of the URL following the hostname for web pages visited; for example, the pagePathPlusQueryString portion of…
- `pageReferrer` — Page referrer: The full referring URL including the hostname and path
- `pageTitle` — Page title: The web page titles used on your site
- `unifiedPagePathScreen` — Page path and screen class: The page path (web) or screen class (app) on which the event was logged
- `unifiedPageScreen` — Page path + query string and screen class: The page path and query string (web) or screen class (app) on which the event was logged
- `unifiedScreenClass` — Page title and screen class: The page title (web) or screen class (app) on which the event was logged
- `unifiedScreenName` — Page title and screen name: The page title (web) or screen name (app) on which the event was logged

**Events, links & Enhanced Measurement parameters** (17)
- `eventName` — Event name: The name of the event
- `fileExtension` — File extension: The extension of the downloaded file (for example, pdf or txt)
- `fileName` — File name: The page path of the downloaded file (for example, /menus/dinner-menu.pdf)
- `isKeyEvent` — Is key event: The string true if the event is a key event
- `linkClasses` — Link classes: The HTML class attribute for an outbound link
- `linkDomain` — Link domain: The destination domain of the outbound link
- `linkId` — Link ID: The HTML ID attribute for an outbound link or file download
- `linkText` — Link text: The link text of the file download
- `linkUrl` — Link URL: The full URL for an outbound link or file download
- `method` — Method: The method by which an event was triggered
- `outbound` — Outbound: Returns true if the link led to a site that is not a part of the property's domain
- `percentScrolled` — Percent scrolled: The percentage down the page that the user has scrolled (for example, 90)
- `searchTerm` — Search term: The term searched by the user
- `videoProvider` — Video provider: The source of the video (for example, youtube)
- `videoTitle` — Video title: The title of the video
- `videoUrl` — Video URL: The URL of the video
- `visible` — Visible: Returns true if the content is visible

**Geography (derived from IP)** (7)
- `city` — City: The city from which the user activity originated
- `cityId` — City ID: The geographic ID of the city from which the user activity originated, derived from their IP address
- `continent` — Continent: The continent from which the user activity originated
- `continentId` — Continent ID: The geographic ID of the continent from which the user activity originated, derived from their IP address
- `country` — Country: The country from which the user activity originated
- `countryId` — Country ID: The geographic ID of the country from which the user activity originated, derived from their IP address
- `region` — Region: The geographic region from which the user activity originated, derived from their IP address

**Platform / device / technology** (18)
- `appVersion` — App version: The app's versionName (Android) or short bundle version (iOS)
- `browser` — Browser: The browsers used to view your website
- `browserVersion` — Browser version: The version of the browser from which the user activity originated
- `deviceCategory` — Device category: The type of device: Desktop, Tablet, or Mobile
- `deviceModel` — Device model: The mobile device model (example: iPhone 10,6)
- `language` — Language: The language setting of the user's browser or device
- `languageCode` — Language code: The language setting (ISO 639) of the user's browser or device
- `mobileDeviceBranding` — Device brand: Manufacturer or branded name (examples: Samsung, HTC, Verizon, T-Mobile)
- `mobileDeviceMarketingName` — Device: The branded device name (examples: Galaxy S10 or P30 Pro)
- `mobileDeviceModel` — Mobile model: The mobile device model name (examples: iPhone X or SM-G950F)
- `operatingSystem` — Operating system: The operating systems used by visitors to your app or website
- `operatingSystemVersion` — OS version: The operating system versions used by visitors to your website or app
- `operatingSystemWithVersion` — Operating system with version: The operating system and version
- `platform` — Platform: The platform on which your app or website ran; for example, web, iOS, or Android
- `platformDeviceCategory` — Platform / device category: The platform and type of device on which your website or mobile app ran
- `screenResolution` — Screen resolution: The screen resolution of the user's monitor
- `streamId` — Stream ID: The numeric data stream identifier for your app or website
- `streamName` — Stream name: The data stream name for your app or website

**User / audience / demographics (Google signals)** (9)
- `audienceId` — Audience ID: The numeric identifier of an Audience
- `audienceName` — Audience name: The given name of an Audience
- `audienceResourceName` — Audience resource name: The resource name of this audience
- `brandingInterest` — Interests: Interests demonstrated by users who are higher in the shopping funnel
- `firstSessionDate` — First session date: The date the user's first session occurred, formatted as YYYYMMDD
- `newVsReturning` — New / returning: New users have 0 previous sessions, and returning users have 1 or more previous sessions
- `signedInWithUserId` — Signed in with user ID: The string yes if the user signed in with the User-ID feature
- `userAgeBracket` — Age: User age brackets
- `userGender` — Gender: User gender

**Time** (22)
- `date` — Date: The date of the event, formatted as YYYYMMDD
- `dateHour` — Date + hour (YYYYMMDDHH): The combined values of date and hour formatted as YYYYMMDDHH
- `dateHourMinute` — Date hour and minute: The combined values of date, hour, and minute formatted as YYYYMMDDHHMM
- `day` — Day: The day of the month, a two-digit number from 01 to 31
- `dayOfWeek` — Day of week: The integer day of the week
- `dayOfWeekName` — Day of week name: The day of the week in English
- `hour` — Hour: The two-digit hour of the day that the event was logged
- `isoWeek` — ISO week of the year: ISO week number, where each week starts on Monday
- `isoYear` — ISO year: The ISO year of the event
- `isoYearIsoWeek` — ISO week of ISO year: The combined values of isoWeek and isoYear
- `minute` — Minute: The two-digit minute of the hour that the event was logged
- `month` — Month: The month of the event, a two digit integer from 01 to 12
- `nthDay` — Nth day: The number of days since the start of the date range
- `nthHour` — Nth hour: The number of hours since the start of the date range
- `nthMinute` — Nth minute: The number of minutes since the start of the date range
- `nthMonth` — Nth month: The number of months since the start of a date range
- `nthWeek` — Nth week: A number representing the number of weeks since the start of a date range
- `nthYear` — Nth year: The number of years since the start of the date range
- `week` — Week: The week of the event, a two-digit number from 01 to 53
- `year` — Year: The four-digit year of the event
- `yearMonth` — Year month: The combined values of year and month
- `yearWeek` — Year week: The combined values of year and week

**Cohort** (4)
- `cohort` — Cohort: The cohort's name in the request
- `cohortNthDay` — Daily cohort: Day offset relative to the firstSessionDate for the users in the cohort
- `cohortNthMonth` — Monthly cohort: Month offset relative to the firstSessionDate for the users in the cohort
- `cohortNthWeek` — Weekly cohort: Week offset relative to the firstSessionDate for the users in the cohort

**Ecommerce — event-scoped & item-scoped** (22)
- `currencyCode` — Currency: The local currency code (based on ISO 4217 standard) of the eCommerce event
- `itemAffiliation` — Item affiliation: The name or code of the affiliate (partner/vendor; if any) associated with an individual item
- `itemBrand` — Item brand: Brand name of the item
- `itemCategory` — Item category: The hierarchical category in which the item is classified
- `itemCategory2` — Item category 2: The hierarchical category in which the item is classified
- `itemCategory3` — Item category 3: The hierarchical category in which the item is classified
- `itemCategory4` — Item category 4: The hierarchical category in which the item is classified
- `itemCategory5` — Item category 5: The hierarchical category in which the item is classified
- `itemId` — Item ID: The ID of the item
- `itemListId` — Item list ID: The ID of the item list
- `itemListName` — Item list name: The name of the item list
- `itemListPosition` — Item list position: The position of an item in a list
- `itemLocationID` — Item location ID: The physical location associated with the item
- `itemName` — Item name: The name of the item
- `itemPromotionCreativeName` — Item promotion creative name: The name of the item-promotion creative
- `itemPromotionCreativeSlot` — Item promotion creative slot: The name of the promotional creative slot associated with the item
- `itemPromotionId` — Item promotion ID: The ID of the item promotion
- `itemPromotionName` — Item promotion name: The name of the promotion for the item
- `itemVariant` — Item variant: The specific variation of a product
- `orderCoupon` — Order coupon: Code for the order-level coupon
- `shippingTier` — Shipping tier: The shipping tier selected for delivery of the purchased item
- `transactionId` — Transaction ID: The ID of the ecommerce transaction

**Gaming** (5)
- `achievementId` — Achievement ID: The achievement ID in a game for an event
- `character` — Character: The player character in a game for an event
- `groupId` — Group ID: The player group ID in a game for an event
- `level` — Level: The player's level in a game
- `virtualCurrencyName` — Virtual currency name: The name of a virtual currency with which the user is interacting

**Publisher ads (AdMob / Ad Manager)** (3)
- `adFormat` — Ad format: Describes the way ads looked and where they were located
- `adSourceName` — Ad source: The source network that served the ad
- `adUnitName` — Ad unit: The name you chose to describe this Ad unit

**Admin / data filters** (2)
- `testDataFilterId` — Test data filter ID: The numeric identifier of a data filter in testing state
- `testDataFilterName` — Test data filter name: The name of data filters in testing state

**Advertising-platform families** (each field exists in up to 3 scopes; same field list per scope unless noted)

**CM360 (Campaign Manager 360) — requires linking that Google Marketing Platform product** (63 API dimensions)
- key-event-scoped (attributed to the key event) (21): `cm360AccountId`, `cm360AccountName`, `cm360AdvertiserId`, `cm360AdvertiserName`, `cm360CampaignId`, `cm360CampaignName`, `cm360CreativeFormat`, `cm360CreativeId`, `cm360CreativeName`, `cm360CreativeType`, `cm360CreativeTypeId`, `cm360CreativeVersion`, `cm360Medium`, `cm360PlacementCostStructure`, `cm360PlacementId`, `cm360PlacementName`, `cm360RenderingId`, `cm360SiteId`, `cm360SiteName`, `cm360Source`, `cm360SourceMedium`
- session-scoped (21): `sessionCm360AccountId`, `sessionCm360AccountName`, `sessionCm360AdvertiserId`, `sessionCm360AdvertiserName`, `sessionCm360CampaignId`, `sessionCm360CampaignName`, `sessionCm360CreativeFormat`, `sessionCm360CreativeId`, `sessionCm360CreativeName`, `sessionCm360CreativeType`, `sessionCm360CreativeTypeId`, `sessionCm360CreativeVersion`, `sessionCm360Medium`, `sessionCm360PlacementCostStructure`, `sessionCm360PlacementId`, `sessionCm360PlacementName`, `sessionCm360RenderingId`, `sessionCm360SiteId`, `sessionCm360SiteName`, `sessionCm360Source`, `sessionCm360SourceMedium`
- user-scoped (first acquisition) (21): `firstUserCm360AccountId`, `firstUserCm360AccountName`, `firstUserCm360AdvertiserId`, `firstUserCm360AdvertiserName`, `firstUserCm360CampaignId`, `firstUserCm360CampaignName`, `firstUserCm360CreativeFormat`, `firstUserCm360CreativeId`, `firstUserCm360CreativeName`, `firstUserCm360CreativeType`, `firstUserCm360CreativeTypeId`, `firstUserCm360CreativeVersion`, `firstUserCm360Medium`, `firstUserCm360PlacementCostStructure`, `firstUserCm360PlacementId`, `firstUserCm360PlacementName`, `firstUserCm360RenderingId`, `firstUserCm360SiteId`, `firstUserCm360SiteName`, `firstUserCm360Source`, `firstUserCm360SourceMedium`

**DV360 (Display & Video 360) — requires linking that Google Marketing Platform product** (54 API dimensions)
- key-event-scoped (attributed to the key event) (18): `dv360AdvertiserId`, `dv360AdvertiserName`, `dv360CampaignId`, `dv360CampaignName`, `dv360CreativeFormat`, `dv360CreativeId`, `dv360CreativeName`, `dv360ExchangeId`, `dv360ExchangeName`, `dv360InsertionOrderId`, `dv360InsertionOrderName`, `dv360LineItemId`, `dv360LineItemName`, `dv360Medium`, `dv360PartnerId`, `dv360PartnerName`, `dv360Source`, `dv360SourceMedium`
- session-scoped (18): `sessionDv360AdvertiserId`, `sessionDv360AdvertiserName`, `sessionDv360CampaignId`, `sessionDv360CampaignName`, `sessionDv360CreativeFormat`, `sessionDv360CreativeId`, `sessionDv360CreativeName`, `sessionDv360ExchangeId`, `sessionDv360ExchangeName`, `sessionDv360InsertionOrderId`, `sessionDv360InsertionOrderName`, `sessionDv360LineItemId`, `sessionDv360LineItemName`, `sessionDv360Medium`, `sessionDv360PartnerId`, `sessionDv360PartnerName`, `sessionDv360Source`, `sessionDv360SourceMedium`
- user-scoped (first acquisition) (18): `firstUserDv360AdvertiserId`, `firstUserDv360AdvertiserName`, `firstUserDv360CampaignId`, `firstUserDv360CampaignName`, `firstUserDv360CreativeFormat`, `firstUserDv360CreativeId`, `firstUserDv360CreativeName`, `firstUserDv360ExchangeId`, `firstUserDv360ExchangeName`, `firstUserDv360InsertionOrderId`, `firstUserDv360InsertionOrderName`, `firstUserDv360LineItemId`, `firstUserDv360LineItemName`, `firstUserDv360Medium`, `firstUserDv360PartnerId`, `firstUserDv360PartnerName`, `firstUserDv360Source`, `firstUserDv360SourceMedium`

**SA360 (Search Ads 360) — requires linking that Google Marketing Platform product** (45 API dimensions)
- key-event-scoped (attributed to the key event) (15): `sa360AdGroupId`, `sa360AdGroupName`, `sa360CampaignId`, `sa360CampaignName`, `sa360CreativeFormat`, `sa360EngineAccountId`, `sa360EngineAccountName`, `sa360EngineAccountType`, `sa360KeywordText`, `sa360ManagerAccountId`, `sa360ManagerAccountName`, `sa360Medium`, `sa360Query`, `sa360Source`, `sa360SourceMedium`
- session-scoped (15): `sessionSa360AdGroupId`, `sessionSa360AdGroupName`, `sessionSa360CampaignId`, `sessionSa360CampaignName`, `sessionSa360CreativeFormat`, `sessionSa360EngineAccountId`, `sessionSa360EngineAccountName`, `sessionSa360EngineAccountType`, `sessionSa360Keyword`, `sessionSa360ManagerAccountId`, `sessionSa360ManagerAccountName`, `sessionSa360Medium`, `sessionSa360Query`, `sessionSa360Source`, `sessionSa360SourceMedium`
- user-scoped (first acquisition) (15): `firstUserSa360AdGroupId`, `firstUserSa360AdGroupName`, `firstUserSa360CampaignId`, `firstUserSa360CampaignName`, `firstUserSa360CreativeFormat`, `firstUserSa360EngineAccountId`, `firstUserSa360EngineAccountName`, `firstUserSa360EngineAccountType`, `firstUserSa360KeywordText`, `firstUserSa360ManagerAccountId`, `firstUserSa360ManagerAccountName`, `firstUserSa360Medium`, `firstUserSa360Query`, `firstUserSa360Source`, `firstUserSa360SourceMedium`

**Google Ads (requires Google Ads link)** (33 API dimensions)
- key-event-scoped (attributed to the key event) (11): `googleAdsAccountName`, `googleAdsAdGroupId`, `googleAdsAdGroupName`, `googleAdsAdNetworkType`, `googleAdsCampaignId`, `googleAdsCampaignName`, `googleAdsCampaignType`, `googleAdsCreativeId`, `googleAdsCustomerId`, `googleAdsKeyword`, `googleAdsQuery`
- session-scoped (11): `sessionGoogleAdsAccountName`, `sessionGoogleAdsAdGroupId`, `sessionGoogleAdsAdGroupName`, `sessionGoogleAdsAdNetworkType`, `sessionGoogleAdsCampaignId`, `sessionGoogleAdsCampaignName`, `sessionGoogleAdsCampaignType`, `sessionGoogleAdsCreativeId`, `sessionGoogleAdsCustomerId`, `sessionGoogleAdsKeyword`, `sessionGoogleAdsQuery`
- user-scoped (first acquisition) (11): `firstUserGoogleAdsAccountName`, `firstUserGoogleAdsAdGroupId`, `firstUserGoogleAdsAdGroupName`, `firstUserGoogleAdsAdNetworkType`, `firstUserGoogleAdsCampaignId`, `firstUserGoogleAdsCampaignName`, `firstUserGoogleAdsCampaignType`, `firstUserGoogleAdsCreativeId`, `firstUserGoogleAdsCustomerId`, `firstUserGoogleAdsKeyword`, `firstUserGoogleAdsQuery`

**Manual / UTM campaign fields** (30 API dimensions)
- key-event-scoped (attributed to the key event) (10): `manualAdContent`, `manualCampaignId`, `manualCampaignName`, `manualCreativeFormat`, `manualMarketingTactic`, `manualMedium`, `manualSource`, `manualSourceMedium`, `manualSourcePlatform`, `manualTerm`
- session-scoped (10): `sessionManualAdContent`, `sessionManualCampaignId`, `sessionManualCampaignName`, `sessionManualCreativeFormat`, `sessionManualMarketingTactic`, `sessionManualMedium`, `sessionManualSource`, `sessionManualSourceMedium`, `sessionManualSourcePlatform`, `sessionManualTerm`
- user-scoped (first acquisition) (10): `firstUserManualAdContent`, `firstUserManualCampaignId`, `firstUserManualCampaignName`, `firstUserManualCreativeFormat`, `firstUserManualMarketingTactic`, `firstUserManualMedium`, `firstUserManualSource`, `firstUserManualSourceMedium`, `firstUserManualSourcePlatform`, `firstUserManualTerm`

**Templated / custom dimensions in the API** ([API schema](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema))
- `customEvent:parameter_name`, `customEvent:parameter_name[event_name]` (legacy, before October 2020), `customUser:parameter_name`, `customItem:parameter_name`.
- Custom channel groups: `sessionCustomChannelGroup:custom_channel_id`, `firstUserCustomChannelGroup:custom_channel_id`, `customChannelGroup:custom_channel_id`.

**B. UI-only dimensions (not in the Data API list)** ([UI D&M](https://support.google.com/analytics/answer/9143382))
- Geography: Region ID, Subcontinent, Subcontinent ID.
- Platform/device: App store.
- User: New / established (first visit within the last 7 days).
- User lifetime (Explorations): First visit date, First purchase date, Last active date, Last audience name, Last platform, Last purchase date.
- Ecommerce: Item coupon, Local item price.
- Search Console reports: query-level dimensions in the "Google Organic Search Queries" report, which can't be crossed with Analytics dimensions. The "Google Organic Search Traffic" report is by landing page and can be broken down by Country and Device ([Search Console](https://support.google.com/analytics/answer/10737381)).

**C. Demographics and interests**
- Age brackets: 18-24, 25-34, 35-44, 45-54, 55-64, 65+. Gender. Interests (affinity-style, multi-category) ([UI D&M](https://support.google.com/analytics/answer/9143382)). On iOS, IDFA is required to derive Age/Gender/Interests ([Predefined user dims](https://support.google.com/analytics/answer/9268042)).
- Enriched by Google signals: data from users signed in to Google with Ads Personalization on. Can be enabled or disabled per region ([Google signals](https://support.google.com/analytics/answer/9445345)).
- Age, gender and interest data always has a 2-month retention, whatever the property setting ([Retention](https://support.google.com/analytics/answer/7667196)).

**D. 2026 changes to dimension values** ([What's new](https://support.google.com/analytics/answer/9164320))
- May 13, 2026: new "AI Assistant" default channel. Medium `ai-assistant` and campaign `(ai-assistant)` are assigned when the referrer is a recognized AI assistant (ChatGPT, Gemini, Claude, etc.).
- June 11, 2026: new "Source Group" field consolidating platform sources (Facebook, Instagram, TikTok, ChatGPT/OpenAI, Perplexity, etc.), populated retroactively. Source Platform classifications updated.
- June 11 and September 21, 2026: hostname Exclude, then Include (allowlist), data filters. Include filters block events with empty hostnames but aren't applied to Measurement Protocol.

### Inferences
- "Source group" doesn't yet appear in the Data API schema (updated 2026-11-10), which suggests it's UI-only for now.
- Fields under granular location and device controls (City, Browser minor version, Device brand/model, OS minor version, Screen resolution) can be switched off per region, so EU properties may have them blank (see Q7).
- 195 of 374 API dimensions (52%) are CM360/DV360/SA360/Google Ads fields across 3 scopes, ad-platform plumbing a small-business site rarely needs. The manual/UTM set (30 dimensions) is relevant: 10 fields per scope covering source, medium, source/medium, campaign name, campaign ID (utm_id), term, content, source platform, creative format and marketing tactic.

### Gaps
- I didn't confirm whether CM360/DV360/SA360 linking requires GA4 360. The pages I read didn't state it, so those families are labeled "requires linking" rather than [360].
- I couldn't get the official Search Console query dimension names (e.g., "Organic Google Search query"). The article describes the report but doesn't list dimension names.

## 5. What custom dimensions/metrics and user properties are available, and what are their limits?

### Takeaway
GA4 allows user-, event- and item-scoped custom dimensions, custom metrics and calculated metrics, with hard per-property quotas that GA4 360 raises 2–10×. Collection-side limits (25 params per event, 25 user properties, 100-char values) constrain what can be captured at all.

### Cited Findings
| Item | Standard | GA4 360 |
|---|---|---|
| User-scoped custom dimensions | 25 | 100 |
| Event-scoped custom dimensions | 50 | 125 |
| Item-scoped custom dimensions | 10 | 25 |
| Custom metrics | 50 | 125 |
| Calculated metrics | 5 | 50 |
| Event parameters per event | 25 | 100 |
| User properties per property | 25 | 100 |
| Event param value length | 100 chars (page_title 300, page_referrer 420, page_location 1,000) | 500 chars (page_location 1,000) |
| Key events | 30 | 50 |
| Audiences | 100 | 400 |
| Saved comparisons / segments | 50 / 50 | 200 / 200 |
| Explorations | 200 per user, 500 shared | 200 per user, 1,000 shared |
| Distinct event names | unlimited (web); 500 per app user | unlimited (web); 2,000 per app user |
| Data API quota | 200,000 tokens/day | 2M tokens/day |
| BigQuery daily export | 1M events/day (streaming unlimited) | billions |
| Data import storage | 10 GB | 1 TB |

Sources: [Custom D&M](https://support.google.com/analytics/answer/10075209); [360 limits](https://support.google.com/analytics/answer/11202874); [Collection limits](https://support.google.com/analytics/answer/9267744).
- Further collection limits: event name ≤40 chars, param name ≤40 chars, user property name ≤24 chars and value ≤36 chars, User-ID ≤256 chars, up to 27 custom item params per ecommerce event ([Collection limits](https://support.google.com/analytics/answer/9267744)).
- Custom dimensions take 24–48 h to appear in reports. After deleting one at the limit, you must wait 48 h before adding a new one. Values that look numeric are coerced to numbers ([Custom D&M](https://support.google.com/analytics/answer/10075209)).
- Google advises against high-cardinality custom dimensions (unique user/session IDs, timestamps), which push data into the (other) row ([Custom D&M](https://support.google.com/analytics/answer/10075209)).
- User properties are attributes describing user segments, reported via user-scoped custom dimensions. Predefined user dimensions (Age, App store, App version, Browser, City, Continent, Country, Device brand/category/model, …) need no code ([User properties](https://support.google.com/analytics/answer/9355671); [Predefined user dims](https://support.google.com/analytics/answer/9268042)).

### Inferences
- For small sites, 50 event-scoped custom dimensions is rarely binding. The practical constraint is that every custom parameter needs explicit registration before it's reportable, and it isn't retroactive.

### Gaps
- None material.

## 6. What thresholding, sampling, "(other)" row and modeled data apply?

### Takeaway
GA4 reports can be altered four ways: thresholding (rows withheld when demographics, signals or search queries plus low user counts could identify people), sampling (in Explorations above 10M events/query standard or 1B [360]), the "(other)" row (cardinality row-limits), and modeled data (consent-mode behavioral modeling plus key-event modeling).

### Cited Findings
- **Thresholds:** system-defined and not adjustable. Applied when a report, exploration or API call includes demographic data or audiences built on it, and to search-query rows with too few users ([Thresholds](https://support.google.com/analytics/answer/9383630)). Using the Blended or Observed reporting identity with User-ID also makes reports "subject to data thresholds" ([Reporting identity](https://support.google.com/analytics/answer/10976610)).
- **Sampling:** happens when an event-level query exceeds the quota. The limit is 10M events/query (standard) and up to 1B [360], with a 360 default of 100M plus an opt-in "more detailed results" ([Sampling](https://support.google.com/analytics/answer/13331292)). Unsampled explorations are [360] only, with 20K daily unsampled tokens and a 5K/query max ([360 limits](https://support.google.com/analytics/answer/11202874)). Standard reports use aggregate tables. Filtering large datasets by country can still trigger sampling ([Sampling](https://support.google.com/analytics/answer/13331292)).
- **(other) row:** when a table exceeds its row limit, the least common values are grouped as "(other)". Limits are higher in 360 and vary by report and query complexity. Google's guidance treats >500 values per dimension as "high-cardinality" ([Other row](https://support.google.com/analytics/answer/13331684)).
- **Behavioral modeling (consent mode):** ML estimates users and sessions for visitors who decline analytics cookies (`analytics_storage='denied'`). It requires advanced consent mode (tags load before consent), ≥1,000 events/day with denied consent for ≥7 days, and ≥1,000 daily users with granted consent for ≥7 of the previous 28 days. It's shown only with the "Blended" reporting identity ([Behavioral modeling](https://support.google.com/analytics/answer/11161109)).
- Modeling covers users, sessions and new-user counts in reports, but not event counts. Unconsented events become reportable, but each page load produces fresh first_visit/session_start events. It isn't supported in audiences, user explorer, cohort, user-lifetime explorations, sequence segments, retention reports, predictive metrics or BigQuery export ([Behavioral modeling](https://support.google.com/analytics/answer/11161109)).
- **Modeled key events:** Google models unobservable key events (cookie limits, consent, ATT, cross-device) from coarse data (historical rates, device type, time, geo). Attributed conversions can update for up to 12 days. When confidence is low, modeled conversions go to "Direct" ([Modeled key events](https://support.google.com/analytics/answer/10710245)).
- Reporting identities: Blended (User-ID → device ID → modeling), Observed (User-ID → device ID), Device-based. Switching doesn't alter collected data ([Reporting identity](https://support.google.com/analytics/answer/10976610)).

### Inferences
- For an EU small business with a consent banner, most properties won't reach 1,000 daily consented users, so GA4 shows only observed (consented) traffic. That's a structural undercount a cookieless tool avoids.

### Gaps
- The pages I read give no exact (other) row limits per report. Google says only that they vary by property type, report and query complexity.

## 7. What does GA4 store and how (cookies, IDs, IP, retention, location/device controls)?

### Takeaway
GA4 identifies browsers with first-party cookies `_ga` (client ID) and `_ga_<container-id>` (session state), each with a default 2-year expiry, optionally joined to a site-supplied `user_id`. It doesn't log or store IP addresses for EU/CH/UK traffic and uses IP only for coarse geolocation. Event-level retention is 2 or 14 months (standard) or up to 50 months [360].

### Cited Findings
- **Cookies:** `_ga` (2 years, "distinguish users") and `_ga_<container-id>` (2 years, "persist session state"). Expiry can be overridden (immediately to 25 months) and set relative to most recent or first visit. Browsers cap lifespans for non-returning users (Chrome 400 days, Safari 7 days). Google Ads linking adds advertising cookies ([Cookie usage](https://support.google.com/analytics/answer/11397207)).
- The client ID lives in `_ga`. It isn't stored when analytics storage is denied via Consent Mode. On apps, the Firebase app-instance ID is used, plus IDFA (with ATT) / IDFV on iOS and Advertising ID on Android ([Data collection](https://support.google.com/analytics/answer/11593727)).
- **User-ID:** site-assigned persistent ID for signed-in users, ≤256 chars, set to `null` on logout. PII is prohibited ([User-ID](https://support.google.com/analytics/answer/9213390)). On web, device ID = client ID ([Reporting identity](https://support.google.com/analytics/answer/10976610)).
- **IP:** "Google Analytics does not log or store IP addresses from EU, Switzerland, or UK users". IP is used only to derive City (and its lat/long), Continent, Country, Region and Subcontinent, then discarded. EU/CH/UK traffic is collected via EU/CH/UK-based domains and servers ([EU privacy](https://support.google.com/analytics/answer/12017362)).
- **Granular location & device data controls** (per region, on by default). When disabled, GA4 stops collecting City, city latitude/longitude, browser minor version, browser User-Agent string, device brand, model and name, OS minor version, platform minor version and screen resolution. Disabling it reduces modeled-conversion volume ([EU privacy](https://support.google.com/analytics/answer/12017362)).
- **Google signals** collection can be enabled or disabled per region ([EU privacy](https://support.google.com/analytics/answer/12017362); [Google signals](https://support.google.com/analytics/answer/9445345)).
- **Data redaction:** client-side redaction of email addresses (on by default for new properties) and user-listed URL query parameters in page_location, page_referrer, etc. Web streams only, best effort. Doesn't cover Measurement Protocol or Data Import ([Data redaction](https://support.google.com/analytics/answer/13544947)).
- **Retention** ([Retention](https://support.google.com/analytics/answer/7667196)):
  - User-level data and key events: 2 or 14 months.
  - Other event data: 2 or 14 months, plus 26, 38 and 50 months [360].
  - Age/gender/interest data is always 2 months. Google-signals data is capped at 26 months.
  - Large (standard) and XL (360) properties are forced to 2 months.
  - Retention affects only Explorations and funnel reports, not standard aggregated reports.
  - "Reset on new activity" can extend a user identifier's retention.
  - Google Ads data is limited to a rolling 36 months.
- Search Console data: 16 months ([Search Console](https://support.google.com/analytics/answer/10737381)). GBP data: rolling 6 months ([What's new](https://support.google.com/analytics/answer/9164320)).
- **Other 2026 platform changes** ([What's new](https://support.google.com/analytics/answer/9164320)): Data Manager API for server-to-server events (May 7), Dashboards (Sept 9), configurable click-through (1–90 days) and engaged-view (1–30 days) conversion windows (Aug 11), Data Manager hub (Nov 6, beta), Generated insights on Home (Feb 10), Task Assistant (Apr 29), cross-channel budgeting and conversion attribution analysis (beta, Jan/Feb 2026).

### Inferences
- GA4's EU posture (no IP storage, regional controls) narrows the privacy gap, but it still sets 2-year persistent identifier cookies. That generally requires consent under ePrivacy, and without consent GA4 data degrades to cookieless pings and modeling. This is the core differentiator for a cookieless competitor.
- Even on standard retention, GA4's aggregated standard reports persist beyond 14 months. Only Explorations are truncated, so "GA4 deletes data after 14 months" is an oversimplification.

### Gaps
- I didn't fetch the exact `_ga` cookie value format or the Measurement Protocol `client_id` format from an official page.
- Region-level details of data-processing locations outside EU/CH/UK weren't researched.
