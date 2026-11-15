# Rate 1 dashboard (W4)

Mocked front end for the PoC dashboard. Vite + React + TypeScript, React Router. No backend yet: every number comes from `src/mock/data.ts`, ported 1:1 from the design prototype so both render identically.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
```

## Layout

| Path | What |
| --- | --- |
| `src/mock/data.ts` | Demo pages, changes, requests and the 52-week series generator |
| `src/lib/analysis.ts` | Period totals, page diagnosis, potential, device split, change markers |
| `src/lib/format.ts`, `metrics.ts` | Number formatting and the six metric definitions |
| `src/components/` | Layout (top bar, rail), metric cards, trend chart, sortable table, small UI pieces |
| `src/views/` | Overview, page detail, and the site-wide views (search terms, sources, devices, contact options, click paths, changes, requests) |
| `src/styles.css` | Styles copied verbatim from the prototype |

## Routes

`/` overview · `/pages/:slug` page detail (`home` for `/`) · `/search-terms` · `/sources` · `/devices` · `/contact-options` · `/click-paths` · `/changes` · `/requests`

## Next

Swap `src/mock/data.ts` for API calls against the tables in `specs/Data-Contract-v1.md` §10, keeping the metric definitions in §11.
