/** Site-wide breakdowns: every page combined. */
import { useMemo, type ReactNode } from 'react';
import { DataTable } from '../components/DataTable';
import { Bar, Dx, Head, Muted, PageLink, Panel, VRows } from '../components/ui';
import { allStats, contactRows, deviceRows, MIN_VIS, rangeName, rangeText, wilson, worstStep, type Range } from '../lib/analysis';
import { fi, fp, fp0, mmss } from '../lib/format';
import { FLOW_NAME, SOURCE_NAME, type Funnel, type Page, type RouteRow, type SiteData } from '../data/model';
import { useSiteData } from '../data/stats';
import { useDashboard } from '../state';
import { SearchNote, TermTable, throughText } from './search';
import { pageName, PathLink, RequestTable } from './shared';

function SiteHead({ title, range, children }: { title: string; range: Range; children: ReactNode }) {
  return (
    <Head title={title}>
      {children} Last {rangeName(range)}, all pages combined.
    </Head>
  );
}

function useAllStats() {
  const { range } = useDashboard();
  const d = useSiteData();
  return { range, d, ...useMemo(() => allStats(d, range), [d, range]) };
}

const RateCell = ({ k, n, max }: { k: number; n: number; max: number }) => (
  <span title={rangeText(k, n)}>
    <Bar v={n ? k / n : 0} max={max} color="#2B4FB3">
      {fp(n ? k / n : 0)}
    </Bar>
  </span>
);

/* ---------- Search terms ---------- */

export function SearchTerms() {
  const { range, d } = useAllStats();
  const s = d.search;
  return (
    <>
      <SiteHead title="Search terms" range={range}>
        Every search term that brings visitors from Google, with the page they land on.
      </SiteHead>
      <Panel title="All search terms">
        {s.terms.length ? (
          <>
            <p className="note">
              Google search: {fi(s.clicks)} clicks from {fi(s.impressions)} times shown in results. Google leaves out rarely searched terms to protect
              privacy, so the terms below add up to less. {throughText(s)}
            </p>
            <TermTable terms={s.terms} withPage />
          </>
        ) : (
          <SearchNote s={s} empty="Google reports no search terms for this website in this period." />
        )}
      </Panel>
    </>
  );
}

/* ---------- Sources ---------- */

interface PageRate {
  p: Page;
  r1: number;
}

export function Sources() {
  const { range, d } = useAllStats();
  const tot = d.bd.sources.reduce((t, a) => t + a.vis, 0);
  const rows = d.bd.sources.map((a) => {
    // Strongest and weakest landing page for this source, among pages with enough visits from it.
    let best: PageRate | null = null;
    let worst: PageRate | null = null;
    for (const p of d.pages) {
      const x = p.bd.sources.find((y) => y.name === a.name);
      if (!x || x.vis < MIN_VIS) continue;
      const r1 = x.conv / x.vis;
      if (!best || r1 > best.r1) best = { p, r1 };
      if (!worst || r1 < worst.r1) worst = { p, r1 };
    }
    return { ...a, label: SOURCE_NAME[a.name] ?? a.name, share: tot ? a.vis / tot : 0, r1: a.vis ? a.conv / a.vis : 0, best, worst };
  });
  const mx = Math.max(0, ...rows.map((r) => r.r1));
  // Best source only when it is clearly ahead of the site as a whole.
  const site = { conv: rows.reduce((a, r) => a + r.conv, 0), vis: tot };
  const top = rows
    .filter((r) => r.vis >= MIN_VIS && r.share >= 0.05 && wilson(r.conv, r.vis)[0] > (site.vis ? site.conv / site.vis : 0))
    .sort((a, b) => b.r1 - a.r1)[0];
  return (
    <>
      <SiteHead title="Sources" range={range}>
        Where visitors come from and which source brings the most requests.
      </SiteHead>
      <Panel title="All sources">
        <DataTable
          rows={rows}
          defKey="vis"
          columns={[
            { key: 'label', label: 'Source', strong: true, cell: (r) => r.label },
            { key: 'vis', label: 'Visitors', num: true, cell: (r) => fi(r.vis) },
            { key: 'share', label: 'Share', num: true, cell: (r) => <Bar v={r.share} max={1} color="#55635F">{fp0(r.share)}</Bar> },
            { key: 'inq', label: 'Requests', num: true, cell: (r) => fi(r.inq) },
            { key: 'r1', label: 'Rate 1', num: true, cell: (r) => <RateCell k={r.conv} n={r.vis} max={mx} /> },
            {
              key: 'bestn',
              label: 'Strongest page',
              sort: false,
              cell: (r) =>
                r.best ? (
                  <>
                    <PageLink page={r.best.p} /> <Muted>{fp(r.best.r1)}</Muted>
                  </>
                ) : (
                  '–'
                ),
            },
            {
              key: 'worstn',
              label: 'Weakest page',
              sort: false,
              cell: (r) =>
                r.worst && r.best && r.worst.p !== r.best.p ? (
                  <>
                    <PageLink page={r.worst.p} /> <Muted>{fp(r.worst.r1)}</Muted>
                  </>
                ) : (
                  '–'
                ),
            },
          ]}
        />
        <p className="note">Strongest and weakest page: landing pages with at least {MIN_VIS} visits from that source.</p>
        {top && (
          <div className="callout">
            Visitors from <b>{top.label}</b> get in touch most often (Rate 1 {fp(top.r1)}). This source is the most worth growing.
          </div>
        )}
      </Panel>
    </>
  );
}

/* ---------- Devices ---------- */

export function Devices() {
  const { range, d } = useAllStats();
  const rows = deviceRows(d.bd);
  const mx = Math.max(0, ...rows.map((r) => r.r1));
  const gaps = d.pages.flatMap((p) => {
    const dev = deviceRows(p.bd);
    const mob = dev.find((x) => x.key === 'mobile');
    const desk = dev.find((x) => x.key === 'desktop');
    if (!mob || !desk || mob.vis < MIN_VIS || desk.vis < MIN_VIS || !desk.r1) return [];
    const clear = wilson(mob.conv, mob.vis)[1] < wilson(desk.conv, desk.vis)[0];
    return [{ p, page: p.name, mob: mob.r1, desk: desk.r1, ratio: mob.r1 / desk.r1, clear, load: mob.load, vis: mob.vis }];
  });
  return (
    <>
      <SiteHead title="Devices" range={range}>
        How well the website works on mobile, desktop and tablet.
      </SiteHead>
      <Panel title="All devices">
        <DataTable
          rows={rows}
          defKey="vis"
          columns={[
            { key: 'name', label: 'Device', strong: true, cell: (r) => r.name },
            { key: 'vis', label: 'Visitors', num: true, cell: (r) => fi(r.vis) },
            { key: 'share', label: 'Share', num: true, cell: (r) => <Bar v={r.share} max={1} color="#55635F">{fp0(r.share)}</Bar> },
            { key: 'time', label: 'Time on page', num: true, cell: (r) => mmss(r.time) },
            { key: 'scroll', label: 'Read 75%', num: true, cell: (r) => fp0(r.scroll) },
            { key: 'load', label: 'Avg. load time', num: true, cell: (r) => (r.load === null ? '–' : r.load.toFixed(1) + ' s') },
            { key: 'conv', label: 'Converting visits', num: true, cell: (r) => fi(r.conv) },
            { key: 'r1', label: 'Rate 1', num: true, cell: (r) => <RateCell k={r.conv} n={r.vis} max={mx} /> },
          ]}
        />
      </Panel>
      <Panel title="Where mobile loses the most">
        {gaps.length ? (
          <DataTable
            rows={gaps}
            defKey="ratio"
            defDir={1}
            columns={[
              { key: 'page', label: 'Page', cell: (r) => <PageLink page={r.p} /> },
              { key: 'vis', label: 'Mobile visitors', num: true, cell: (r) => fi(r.vis) },
              { key: 'mob', label: 'Rate 1 mobile', num: true, cell: (r) => fp(r.mob) },
              { key: 'desk', label: 'Rate 1 desktop', num: true, cell: (r) => fp(r.desk) },
              { key: 'load', label: 'Mobile load time', num: true, cell: (r) => (r.load === null ? '–' : r.load.toFixed(1) + ' s') },
              {
                key: 'ratio',
                label: 'Rating',
                cell: (r) =>
                  r.clear ? (
                    <Dx tone="warn">Clear gap. Check load time and buttons</Dx>
                  ) : r.ratio < 0.8 ? (
                    <Dx tone="info">Gap, not yet clear</Dx>
                  ) : (
                    <Dx tone="good">Good on mobile</Dx>
                  ),
              },
            ]}
          />
        ) : (
          <p className="note">No page has at least {MIN_VIS} mobile and {MIN_VIS} desktop visits in this period yet.</p>
        )}
        <p className="note">Sorted by the ratio of mobile to desktop. “Clear gap”: the 95% ranges of the two rates don’t overlap.</p>
      </Panel>
    </>
  );
}

/* ---------- Contact options ---------- */

/** Booking or calculator steps as a drop-off funnel. */
export function FunnelPanel({ f }: { f: Funnel }) {
  const d = useSiteData();
  const first = f.steps[0]?.visits || 1;
  const { i: worstI, drop } = worstStep(f);
  return (
    <Panel title={FLOW_NAME[f.flow] + ': where visitors drop out'}>
      <VRows
        rows={f.steps.map((s, j) => ({
          label: (
            <>
              {(s.name ?? 'Step ' + s.step) + ' '}
              <Muted faint>{fi(s.visits)}</Muted>
            </>
          ),
          v: Math.min(1, s.visits / first),
          text: fp0(s.visits / first),
          c: j === worstI ? '#A14B0A' : '#2B4FB3',
        }))}
      />
      <p className="note">
        Visits that reached each step{f.startPath ? <>, starting on {pageName(d, f.startPath)}</> : null}.
        {worstI > 0 && <> Orange: the step with the biggest drop before it ({fp0(drop)}).</>}
      </p>
    </Panel>
  );
}

export function ContactOptions() {
  const { range, d } = useAllStats();
  const rows = contactRows(d.bd);
  const totInq = rows.reduce((t, a) => t + (a.inq ?? 0), 0);
  const table = rows.map((r) => ({ ...r, share: r.inq !== null && totInq ? r.inq / totInq : null, conv: r.inq !== null && r.clicks ? r.inq / r.clicks : null }));
  return (
    <>
      <SiteHead title="Contact options" range={range}>
        How visitors get in touch and which option works best.
      </SiteHead>
      <Panel title="All contact options">
        {table.length ? (
          <DataTable
            rows={table}
            defKey="inq"
            columns={[
              { key: 'name', label: 'Contact option', strong: true, cell: (r) => r.name },
              { key: 'clicks', label: 'Clicks', num: true, cell: (r) => (r.clicks === null ? '–' : fi(r.clicks)) },
              { key: 'inq', label: 'Requests', num: true, cell: (r) => (r.inq === null ? '–' : fi(r.inq)) },
              { key: 'conv', label: 'Click → request', num: true, cell: (r) => (r.conv === null ? '–' : fp(r.conv)) },
              {
                key: 'share',
                label: 'Share of all requests',
                num: true,
                cell: (r) => (r.share === null ? '–' : <Bar v={r.share} max={1} color="#6246C2">{fp0(r.share)}</Bar>),
              },
            ]}
          />
        ) : (
          <p className="note">No contact clicks or requests in this period.</p>
        )}
        <p className="note">
          Clicks count every button click, requests only real contacts (forms and bookings, spam filtered out). Calls, WhatsApp and email can only be
          counted as clicks.
          {d.unattributed > 0 && <> {fi(d.unattributed)} requests aren’t linked to a visit (e.g. Wix notifications) and count here, not in page rates.</>}
        </p>
      </Panel>
      {d.funnels.map((f) => (
        <FunnelPanel key={f.flowId} f={f} />
      ))}
    </>
  );
}

/* ---------- Click paths ---------- */

const routeLabel = (d: SiteData, r: RouteRow) => (r.route.length === 1 ? 'Requested directly on the first page' : r.route.map((x) => (x === '…' ? '…' : pageName(d, x))).join(' → '));

/** Routes of one page as labelled bars. */
export function RouteRows({ routes }: { routes: RouteRow[] }) {
  const d = useSiteData();
  const tot = routes.reduce((a, r) => a + r.n, 0);
  return <VRows rows={routes.slice(0, 10).map((r) => ({ label: routeLabel(d, r), v: r.n / tot, text: fp0(r.n / tot), c: '#2B4FB3' }))} />;
}

export function ClickPaths() {
  const { range, d } = useAllStats();
  const total = d.routes.reduce((a, r) => a + r.n, 0);
  const rows = d.routes.map((r) => ({ route: routeLabel(d, r), path: r.path, page: r.path ? pageName(d, r.path) : '', inq: r.n, share: total ? r.n / total : 0 }));
  // Pages seen on the way to a request sent from another page.
  const helped = new Map<string, number>();
  for (const r of d.routes)
    for (const x of new Set(r.route.slice(0, -1)))
      if (x !== '…' && x !== r.path) helped.set(x, (helped.get(x) ?? 0) + r.n);
  const helpers = [...helped].map(([path, n]) => ({ path, page: pageName(d, path), n, share: total ? n / total : 0 }));
  const direct = d.routes.filter((r) => r.route.length === 1).reduce((a, r) => a + r.n, 0);

  return (
    <>
      <SiteHead title="Click paths" range={range}>
        Which routes visitors take through the website before they get in touch.
      </SiteHead>
      <Panel title="Most common routes to a request">
        {rows.length ? (
          <>
            <DataTable
              rows={rows}
              defKey="inq"
              columns={[
                { key: 'route', label: 'Route', cell: (r) => r.route },
                { key: 'page', label: 'Requested via', cell: (r) => <PathLink path={r.path} d={d} /> },
                { key: 'inq', label: 'Requests', num: true, cell: (r) => fi(r.inq) },
                { key: 'share', label: 'Share', num: true, cell: (r) => <Bar v={r.share} max={1} color="#2B4FB3">{fp0(r.share)}</Bar> },
              ]}
            />
            <div className="callout">
              {fp0(total ? direct / total : 0)} of requests come straight from the first page visitors see. That’s why every landing page has to
              convince on its own.
            </div>
          </>
        ) : (
          <p className="note">No requests linked to a visit in this period.</p>
        )}
      </Panel>
      {helpers.length > 0 && (
        <Panel title="Pages that help requests happen">
          <DataTable
            rows={helpers}
            defKey="n"
            columns={[
              { key: 'page', label: 'Page', cell: (r) => <PathLink path={r.path} d={d} /> },
              { key: 'n', label: 'Requests where it appears on the way', num: true, cell: (r) => fi(r.n) },
              { key: 'share', label: 'Share', num: true, cell: (r) => <Bar v={r.share} max={1} color="#0F7A63">{fp0(r.share)}</Bar> },
            ]}
          />
          <p className="note">
            Pages visitors look at along the way before requesting through another page. These should be well linked from every service page.
          </p>
        </Panel>
      )}
    </>
  );
}

/* ---------- Changes & Requests ---------- */

export function Changes() {
  return (
    <>
      <Head title="Changes">Every change to the website with its result. It appears as a numbered marker on each page’s chart.</Head>
      <Panel title="All changes">
        <p className="note">The change log isn’t available yet. Once changes are logged, each one is compared on equal periods before and after.</p>
      </Panel>
    </>
  );
}

export function Requests() {
  const { range, d } = useAllStats();
  return (
    <>
      <SiteHead title="Requests" range={range}>
        Every request with the page it came from.
      </SiteHead>
      <Panel title="Latest requests">
        {d.requests.length ? <RequestTable list={d.requests} withPage /> : <p className="note">No requests in this period yet.</p>}
      </Panel>
    </>
  );
}
