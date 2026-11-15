# Rate 1 dashboard (W4)

Front end for the PoC dashboard. Vite + React + TypeScript, React Router. Sign-in, organisations, the site list and the WordPress connect page are served by `../api`. There is no site data yet: every site view shows a setup screen (`src/views/NoData.tsx`) until `src/data/model.ts` is filled from the data API. The views themselves are ported 1:1 from the design prototype.

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
| `src/data/model.ts` | Shapes the views render (pages, weekly series, changes, requests) and the site's data, empty for now |
| `src/lib/analysis.ts` | Period totals, page diagnosis, potential, device split, change markers |
| `src/lib/format.ts`, `metrics.ts` | Number formatting and the six metric definitions |
| `src/components/` | Layout (top bar, rail), metric cards, trend chart, sortable table, small UI pieces |
| `src/views/` | Overview, page detail, the site-wide views (search terms, sources, devices, contact options, click paths, changes, requests), `NoData` (setup screen while there is no data), and `SiteSettings` / `SetupChecklist` (real app API: `/api/sites/:siteId/config`, `/checks`) |
| `src/styles.css` | Styles copied verbatim from the prototype; `src/auth/auth.css` adds the sign-in and settings styles |

## Routes

Signed out: `/login` · `/signup` · `/check-email` · `/forgot-password` · `/reset-password` · `/two-factor` · `/invite/:id`

Signed in: `/` (last opened site, else onboarding) · `/onboarding` (create organisation, add website) · `/connect/wordpress` (the plugin's one-click connect, contract §8) · `/settings/security` (MFA, password) · `/orgs/:orgId/members` (members, invitations)

Per site, under `/s/:siteId`: overview · `pages/:slug` page detail (`home` for `/`) · `search-terms` · `sources` · `devices` · `contact-options` · `click-paths` · `changes` · `requests` · `setup` (setup checklist, contract §12) · `settings`, `settings/tracking`, `settings/requests` (name and allowed addresses; sections, booking pages, page changes without reload; request rules). Members see settings read-only.

The UI only offers sites listed by `/api/me`; the API checks access again on every call.

## Next

Fill `src/data/model.ts` from `/api/sites/:siteId/…` (tables in `specs/Data-Contract-v1.md` §10, metric definitions in §11); the views render as soon as `SITE` has weeks.
