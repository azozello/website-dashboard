# r1.js (tracker)

Browser tracking script for Rate 1, per `specs/Data-Contract-v1.md` §3–§5. Plain TypeScript, no runtime dependencies, one minified IIFE. Served by ingest at `https://collect.bazed.live/v1/r1.js` (and `/v1/r1.<version>.js`).

```html
<script defer src="https://collect.bazed.live/v1/r1.js" data-site="pk_…"></script>
<!-- optional: only page views until window.r1.consent(true) -->
<script defer src="https://collect.bazed.live/v1/r1.js" data-site="pk_…" data-consent="required"></script>
```

```bash
npm install
npm run build        # dist/r1.js + dist/r1.<version>.js, prints size, fails over 5 KB gzipped
npm test             # vitest + jsdom unit tests
npm run test:e2e     # build + Playwright (Chromium) against contract/mock-collector
npm run typecheck
```

Current size: **≈3.9 KB gzipped** (7.8 KB minified).

## Source

| File | What |
| --- | --- |
| `src/path.ts` | §1 path normalisation (pure; shared vectors in `contract/v1/path-normalisation.json`) |
| `src/clicks.ts` | §4 click rules |
| `src/active.ts` | Active time: tab visible and an interaction in the last 30 s |
| `src/tracker.ts` | Page views, SPA routing, engage, sections, scroll, forms, config, transport, API, debug panel |
| `src/index.ts` | Entry: finds its `<script>` tag and starts; never throws |

## Behaviour

- **Identifier:** only `pv` (16 base62, `crypto.getRandomValues`), new per page load and per in-page route change. No cookies, Web Storage or IndexedDB; the e2e suite instruments all of them and the bundle is grepped for them.
- **Collector:** the origin of the script's own `src`, so the same file works on test and prod.
- **Batching:** events queue for 1 s (max 25 per envelope); hide, `pagehide` and route changes flush at once. The first page view waits for the `load` event (max 10 s) so `load_ms` (`loadEventEnd`) is known.
- **Transport:** `sendBeacon` (string body → `text/plain`); if it refuses or is missing, `fetch` with `keepalive`, `mode: "no-cors"`, `credentials: "omit"`. Responses are never read, except in debug mode.
- **Engage:** sent on `visibilitychange→hidden` (`final: false`), `pagehide` and in-page route change (`final: true`), only if something changed since the last one. After a final engage the view is closed (Chrome fires `pagehide` before `visibilitychange`), unless the page comes back from the back/forward cache, where the same `pv` continues.
- **Active time:** accrues while the tab is visible and within 30 s of the last pointer/key/scroll/touch/wheel event. The start of a page view counts as an interaction (see open questions).
- **Scroll:** highest % of the document reached (`(scrollY + innerHeight) / scrollHeight`). Read on scroll, resize, load, engage; never from the very first, unsettled layout.
- **Sections:** `[data-r1-section]` plus config `sections` whose `path` matches (or has none). Seen when 40 % of the element or 40 % of the viewport is visible while the tab is visible. Max 20 names, 60 chars each.
- **SPA:** patches `pushState`/`replaceState`, listens to `popstate`. A change of the *normalised* path closes the view (final engage) and starts a new `pv` with `nav: "spa"`, `ref: null`, `load_ms: null`; scroll, sections and active time reset. No synchronous measuring right after the route change (the old route's DOM is still on screen). The page view's `title` is re-read when it's sent, so routers that set the title late are fine. Config `spa: "off"` disables this.
- **Clicks:** capture phase. A link's own scheme wins (`tel:`, `mailto:`, `whatsapp:`, `wa.me`, `api.whatsapp.com`); otherwise `[data-r1-cta="booking"]` or a same-host (www-insensitive) link to a config `booking_paths` entry or below it → `booking_cta`. Label = text, else `aria-label`/`title`, max 60.
- **Hidden fields:** `r1_pv` + `r1_path` in every `<form>`, also forms added later (MutationObserver, 100 ms debounce), refreshed on route change and right before each submit (capture phase).
- **forms_browser:** after a submit (or a submit-button click) inside `selector`, polls every 250 ms for up to 15 s for a newly visible `success_selector` element → `form_ok`.
- **API:** `r1.step(flow, flowId, step, name?)` (flow `booking|calculator`, step integer 1–20), `r1.formOk(formId)`, `r1.consent(bool)`. Invalid calls are ignored.
- **Consent:** with `data-consent="required"`, only page views are sent until `r1.consent(true)`; `r1.consent(false)` stops other events again.
- **Debug** (`?r1_debug=1`): `test: true`, CORS `fetch`, a panel with `pv`, every event as sent and each HTTP status.
- **Safety:** every handler is wrapped; nothing throws into the page; nothing is logged outside debug mode. Chrome prerendering waits for activation.

## Tests

- `test/*.test.ts` (vitest + jsdom, fake timers): path vectors, click rules, active time, page view fields, batching, transport fallback, hidden fields (incl. late forms and SPA), SPA (push/replace/pop, resets, `spa: off`), engage rules incl. pagehide-before-hidden and bfcache, scroll, sections, consent, API validation, forms_browser, debug, no throw/no console, no storage. Every envelope is validated against `contract/v1/event-envelope.schema.json`.
- `e2e/r1.spec.ts` (Playwright, Chromium): local test site (`e2e/site/`, incl. a Wix-like single-page site) on `localhost:4021`, mock collector on `127.0.0.1:4020` (a different site) validating every payload against the schemas.
- `ingest/test/e2e/real-chain.e2e.ts` runs the same pages against the real ingest service and Postgres 16.
