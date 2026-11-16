import { useMemo, type ReactNode } from 'react';
import { useSiteNavigate } from '../site';
import { DataTable } from '../components/DataTable';
import { MetricCards } from '../components/MetricCards';
import { TrendChart } from '../components/TrendChart';
import { Bar, Muted, Panel, VRows, type VRow } from '../components/ui';
import { contactRows, deviceRows, pageStats, periods, rangeName, rangeText, type DeviceRow } from '../lib/analysis';
import { cssVars, fi, fp, fp0, mmss, TONE } from '../lib/format';
import { SOURCE_NAME, type Page } from '../data/model';
import { useSiteData } from '../data/stats';
import { useDashboard } from '../state';
import { FunnelPanel, RouteRows } from './SiteViews';
import { SearchNote, TermTable, throughText } from './search';
import { RequestTable } from './shared';

const SCROLL_POINTS: [keyof Page['bd']['scroll'], string][] = [
  ['s25', 'Up to 25% of the page'],
  ['s50', 'Up to 50%'],
  ['s75', 'Up to 75%'],
  ['s100', 'To the end'],
];
const TIME_BUCKETS = ['Under 10 seconds', '10–30 seconds', '30–60 seconds', '1–3 minutes', 'Over 3 minutes'];

export function PageDetail({ page: p }: { page: Page }) {
  const { range, pshow, togglePshow } = useDashboard();
  const navigate = useSiteNavigate();
  const d = useSiteData();
  const S = useMemo(() => periods(d.site, range), [d, range]);
  const s = useMemo(() => pageStats(p, S.T, range, d.funnels), [p, S, range, d]);
  const T = s.T;
  const bd = p.bd;

  // Scroll reach: quarter marks, then the configured sections by how often they were seen.
  const sc = bd.scroll;
  const scrollRows: VRow[] = [
    ...SCROLL_POINTS.map(([k, label]) => ({ label: label as ReactNode, v: sc.eng ? sc[k] / sc.eng : 0, c: '#9FB8B0' })),
    ...bd.sections.map((x) => ({
      label: (
        <>
          {'Section “' + x.name + '” '}
          <Muted faint>seen</Muted>
        </>
      ) as ReactNode,
      v: sc.eng ? x.n / sc.eng : 0,
      el: true,
      c: '#0F7A63',
    })),
  ].map((r) => ({ ...r, text: fp0(r.v) }));

  const timeTot = bd.time.reduce((a, n) => a + n, 0);
  const contacts = contactRows(bd);
  const devices = deviceRows(bd);
  const maxDevR1 = Math.max(0, ...devices.map((x) => x.r1));
  const srcTot = bd.sources.reduce((a, x) => a + x.vis, 0);
  const sources = bd.sources.map((x) => ({ name: SOURCE_NAME[x.name] ?? x.name, vis: x.vis, conv: x.conv, share: srcTot ? x.vis / srcTot : 0, inq: x.inq, r1: x.vis ? x.conv / x.vis : 0 }));
  const maxSrcR1 = Math.max(0, ...sources.map((z) => z.r1));
  const funnels = d.funnels.filter((f) => f.startPath === p.path);
  const routes = d.routes.filter((r) => r.path === p.path);
  const pageRequests = d.requests.filter((r) => r.path === p.path);

  const routePanel = (
    <Panel title="Route to a request">
      {routes.length ? (
        <>
          <RouteRows routes={routes} />
          <p className="note">What visitors looked at before sending a request from this page.</p>
        </>
      ) : (
        <p className="note">No requests sent from this page in this period.</p>
      )}
    </Panel>
  );

  return (
    <>
      <button className="crumb" onClick={() => navigate('/')}>
        ← All pages
      </button>
      <div className="head">
        <h1>{p.name}</h1>
        <p className="pathline">
          {p.path} · last {rangeName(range)}, compared with the period before
        </p>
      </div>

      <section className="panel" aria-label="Numbers for this page">
        <MetricCards T={T} P={s.P} show={pshow} onToggle={togglePshow} siteT={S.T} pageCount={d.pages.length} />
        <TrendChart cur={s.cur} show={pshow} flags={[]} />
        <p className="note">
          Visitors, requests and Rate 1 count visits that started on this page ({rangeText(T.conv, T.vis)}). Time, scroll depth and contact clicks
          count every view of the page.
        </p>
      </section>

      <Panel title="Diagnosis for this page">
        <ul className="diag">
          {s.diag.map((x) => (
            <li key={x.title} style={cssVars({ '--c': TONE[x.tone] })}>
              <b>{x.title}</b>
              <span>{x.text}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid-eq">
        <Panel title="How far visitors scroll">
          {sc.eng ? (
            <>
              <VRows rows={scrollRows} />
              <p className="note">Share of page views with engagement data ({fi(sc.eng)}) that reached each point. Green: sections set up in Settings → Tracking.</p>
            </>
          ) : (
            <p className="note">No engagement data in this period.</p>
          )}
        </Panel>
        <Panel title="How long visitors stay">
          {timeTot ? (
            <>
              <VRows rows={bd.time.map((n, i) => ({ label: TIME_BUCKETS[i], v: n / timeTot, text: fp0(n / timeTot), c: i === 0 ? '#A14B0A' : '#8A5410' }))} />
              <p className="note">
                Active time, only while the tab is actually open. Avg. {mmss(T.time)} minutes, measured on {fp0(T.coverage)} of page views.
              </p>
            </>
          ) : (
            <p className="note">No engagement data in this period.</p>
          )}
        </Panel>
      </div>

      <div className="grid-eq">
        <Panel title="How visitors get in touch">
          {contacts.length ? (
            <DataTable
              rows={contacts}
              defKey="inq"
              columns={[
                { key: 'name', label: 'Contact option', strong: true, cell: (r) => r.name },
                { key: 'clicks', label: 'Clicks', num: true, cell: (r) => (r.clicks === null ? '–' : fi(r.clicks)) },
                { key: 'inq', label: 'Requests', num: true, cell: (r) => (r.inq === null ? '–' : fi(r.inq)) },
              ]}
            />
          ) : (
            <p className="note">No contact clicks or requests on this page in this period.</p>
          )}
          <p className="note">Clicks count every button click on this page. Requests count forms and bookings sent from it; spam is filtered out.</p>
        </Panel>
        <Panel title="Devices">
          <DataTable<DeviceRow>
            rows={devices}
            defKey="vis"
            columns={[
              { key: 'name', label: 'Device', strong: true, cell: (r) => r.name },
              { key: 'vis', label: 'Visitors', num: true, cell: (r) => fi(r.vis) },
              { key: 'time', label: 'Time on page', num: true, cell: (r) => mmss(r.time) },
              { key: 'load', label: 'Load time', num: true, cell: (r) => (r.load === null ? '–' : r.load.toFixed(1) + ' s') },
              {
                key: 'r1',
                label: 'Rate 1',
                num: true,
                cell: (r) => (
                  <span title={rangeText(r.conv, r.vis)}>
                    <Bar v={r.r1} max={maxDevR1} color="#2B4FB3">
                      {fp(r.r1)}
                    </Bar>
                  </span>
                ),
              },
            ]}
          />
        </Panel>
      </div>

      <div className="grid-eq">
        <Panel title="Where visitors come from">
          {sources.length ? (
            <DataTable
              rows={sources}
              defKey="vis"
              columns={[
                { key: 'name', label: 'Source', strong: true, cell: (r) => r.name },
                { key: 'vis', label: 'Visitors', num: true, cell: (r) => fi(r.vis) },
                { key: 'inq', label: 'Requests', num: true, cell: (r) => fi(r.inq) },
                {
                  key: 'r1',
                  label: 'Rate 1',
                  num: true,
                  cell: (r) => (
                    <span title={rangeText(r.conv, r.vis)}>
                      <Bar v={r.r1} max={maxSrcR1} color="#2B4FB3">
                        {fp(r.r1)}
                      </Bar>
                    </span>
                  ),
                },
              ]}
            />
          ) : (
            <p className="note">No visits started on this page in this period.</p>
          )}
        </Panel>
        {funnels.length ? <FunnelPanel f={funnels[0]} /> : routePanel}
      </div>
      {funnels.slice(1).map((f) => (
        <FunnelPanel key={f.flowId} f={f} />
      ))}
      {funnels.length > 0 && routePanel}

      <Panel title="Search terms for this page">
        {p.search.terms.length ? (
          <>
            <p className="note">
              Google search: {fi(p.search.clicks)} clicks from {fi(p.search.impressions)} times shown in results
              {p.search.position !== null ? `, average position ${p.search.position.toFixed(1)}` : ''}. {throughText(d.search)}
            </p>
            <TermTable terms={p.search.terms} />
          </>
        ) : (
          <SearchNote s={d.search} empty="Google reports no search terms for this page in this period." />
        )}
      </Panel>

      <Panel title="Latest requests through this page">
        {pageRequests.length ? <RequestTable list={pageRequests} /> : <p className="note">No requests in this period yet.</p>}
      </Panel>
    </>
  );
}
