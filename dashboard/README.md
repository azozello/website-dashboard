# Rate 1 dashboard (W4)

Front end for the PoC dashboard. Vite + React + TypeScript, React Router. Sign-in, organisations, the site list and the WordPress connect page are served by `../api`. Report views load the site's tracked data from `GET /api/sites/:siteId/stats?weeks=4|13|26` (`src/data/stats.tsx`); a site with no visits in the last 52 weeks shows a setup screen (`src/views/NoData.tsx`) instead. The views' layout comes from the design prototype.

```bash
npm install
npm run dev        # http://localhost:5173, proxies /api to the app API on 127.0.0.1:8081 (start ../api first)
npm run build      # typecheck + production build into dist/
```

Emails sent in development (confirmation links, sign-in codes, invitations) appear in the API's log.

## Layout

| Path | What |
| --- | --- |
| `src/auth/` | Better Auth client, session gate (`RequireAuth`, `/api/me`), sign-in screens, onboarding, security and members settings, top-bar menus |
| `src/site.ts` | Site-scoped paths: every dashboard view lives under `/s/:siteId` |
| `src/data/model.ts`, `stats.tsx` | Stats API response types, the shapes the views render (pages, weekly series, breakdowns), and the provider that loads them per site and range |
| `src/lib/analysis.ts` | §11 metrics from raw counts: period totals, 95% Wilson ranges, device and contact rows, page diagnosis, potential |
| `src/lib/format.ts`, `metrics.ts` | Number formatting and the six metric definitions |
| `src/components/` | Layout (top bar, rail), metric cards, trend chart, sortable table, small UI pieces |
| `src/views/` | Overview, page detail, the site-wide views (search terms, sources, devices, contact options, click paths, changes, requests), `NoData` (setup screen while there is no data), and `SiteSettings` / `SetupChecklist` (real app API: `/api/sites/:siteId/config`, `/checks`) |
| `src/styles.css` | Styles copied verbatim from the prototype; `src/auth/auth.css` adds the sign-in and settings styles |

## Routes

Signed out: `/login` · `/signup` · `/check-email` · `/forgot-password` · `/reset-password` · `/two-factor` · `/invite/:id`

Signed in: `/` (last opened site, else onboarding) · `/onboarding` (create organisation, add website) · `/connect/wordpress` (the plugin's one-click connect, contract §8) · `/settings/security` (MFA, password) · `/orgs/:orgId/members` (members and their roles, invitations, the organisation's websites; owners delete a website after typing its name)

Per site, under `/s/:siteId`: overview · `pages/:slug` page detail (`home` for `/`) · `search-terms` · `sources` · `devices` · `contact-options` · `click-paths` · `changes` · `requests` · `setup` (setup checklist, contract §12) · `settings`, `settings/tracking`, `settings/requests`, `settings/search-console` (name and allowed addresses; sections, booking pages, page changes without reload; request rules; Search Console connection). Members see settings read-only.

The UI only offers sites listed by `/api/me`; the API checks access again on every call.

## Report data

Rate 1 uses the PoC default credit mode (landing page): a page's visitors, requests and Rate 1 count visits that started on it; time on page, scroll depth, sections and contact clicks count every view of the page. Rates show their 95% Wilson range on hover. Findings ("What to fix next", diagnoses, mobile gaps, best source) only fire with at least 30 visits and when the 95% ranges don't overlap, so small sites aren't told to fix noise.

Not available yet, shown as such: search terms (needs Google Search Console, `gsc_daily`), the change log (no table), element positions on the page (needs the page scanner).
