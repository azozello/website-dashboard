import { useMemo, type ReactNode } from 'react';
import { useSiteNavigate } from '../site';
import { DataTable } from '../components/DataTable';
import { MetricCards } from '../components/MetricCards';
import { TrendChart } from '../components/TrendChart';
import { Bar, ChangesLine, Muted, Panel, VRows, type VRow } from '../components/ui';
import { flagsFor, pageStats, periods, rangeName, reachAt, totals, type DeviceRow } from '../lib/analysis';
import { cssVars, fi, fp, fp0, mmss, TONE } from '../lib/format';
import { CHANGES, INQUIRIES, SITE, type Page } from '../data/model';
import { useDashboard } from '../state';
import { ChangesTable, InquiryTable } from './shared';

const SCROLL_POINTS: [number, string][] = [
  [25, 'Up to 25% of the page'],
  [50, 'Up to 50%'],
  [75, 'Up to 75%'],
  [100, 'To the end'],
];
const TIME_BUCKETS = ['Under 10 seconds', '10–30 seconds', '30–60 seconds', '1–3 minutes', 'Over 3 minutes'];

export function PageDetail({ page: p }: { page: Page }) {
  const { range, pshow, togglePshow } = useDashboard();
  const navigate = useSiteNavigate();
  const S = useMemo(() => periods(SITE, range), [range]);
  const s = useMemo(() => pageStats(p, S.T, range), [p, S, range]);
  const T = s.T;
  const flags = flagsFor(range, p.id);

  // Scroll reach: page elements and quarter marks, ordered by position.
  const scrollRows: VRow[] = [
    ...p.elements.map((e) => ({
      pos: e[1],
      el: true,
      label: (e[1] ? (
        <>
          {e[0] + ' '}
          <Muted faint>{`at ${e[1]}%`}</Muted>
        </>
      ) : (
        e[0]
      )) as ReactNode,
    })),
    ...SCROLL_POINTS.map((q) => ({ pos: q[0], el: false, label: q[1] as ReactNode })),
  ]
    .sort((a, b) => a.pos - b.pos || (a.el ? -1 : 1))
    .map((r) => {
      const v = reachAt(T, r.pos);
      return { label: r.label, el: r.el, v, text: fp0(v), c: r.el ? '#0F7A63' : '#9FB8B0' };
    });

  const channels = p.channels.map((c) => ({ name: c[0], inq: T.inq * c[1], clicks: T.inq * c[1] * c[2], share: c[1] }));
  const devices = s.dev.map((d) => ({ ...d, vis: T.vis * d.share }));
  const maxDevR1 = Math.max(...s.dev.map((d) => d.r1));
  const sources = p.sources.map((x) => ({ name: x[0], vis: T.vis * x[1], r1: T.r1 * x[2], inq: T.vis * x[1] * T.r1 * x[2] }));
  const maxSrcR1 = Math.max(...sources.map((z) => z.r1));

  const rv = T.vis / totals(p.series.slice(48)).vis;
  const tclicks = p.terms.reduce((a, t) => a + t[3], 0);
  const terms = p.terms.map((t) => ({ q: t[0], pos: t[1], impr: t[2] * rv, clicks: t[3] * rv, ctr: t[3] / t[2], inq: (T.inq * 0.8 * t[3]) / tclicks }));

  let calcPanel: ReactNode = null;
  if (p.calc) {
    const c0 = p.calc[0][1];
    let worstI = -1;
    let worstD = 0;
    for (let i = 1; i < p.calc.length - 1; i++) {
      const dd = 1 - p.calc[i][1] / p.calc[i - 1][1];
      if (dd > worstD) {
        worstD = dd;
        worstI = i;
      }
    }
    calcPanel = (
      <Panel title="Online booking: where visitors drop out">
        <VRows rows={p.calc.map((c, i) => ({ label: c[0], v: c[1] / c0, text: fp0(c[1] / c0), c: i === worstI ? '#A14B0A' : '#2B4FB3' }))} />
        <p className="note">Share of visitors who started a booking and reach this step. Orange: the step with the biggest drop before it.</p>
      </Panel>
    );
  }
  const ptot = p.paths.reduce((a, x) => a + x[1], 0);
  const pathPanel = (
    <Panel title="Route to a request">
      <VRows rows={p.paths.map((x) => ({ label: x[0], v: x[1] / ptot, text: fp0(x[1] / ptot), c: '#2B4FB3' }))} />
      <p className="note">What visitors did before requesting an appointment through this page.</p>
    </Panel>
  );

  const pageChanges = CHANGES.filter((c) => c.pages.includes(p.id));
  const pageInquiries = INQUIRIES.filter((r) => r[3] === p.id);

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
        <MetricCards T={T} P={s.P} show={pshow} onToggle={togglePshow} siteT={S.T} />
        <TrendChart cur={s.cur} show={pshow} flags={flags} />
        <ChangesLine flags={flags} />
      </section>

      <Panel title="Diagnosis for this page">
        <ul className="diag">
          {s.diag.map((d) => (
            <li key={d.title} style={cssVars({ '--c': TONE[d.tone] })}>
              <b>{d.title}</b>
              <span>{d.text}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid-eq">
        <Panel title="How far visitors scroll">
          <VRows rows={scrollRows} />
          <p className="note">Green: the share of visitors who see each part of the page at all. Next to it is where that part sits on the page.</p>
        </Panel>
        <Panel title="How long visitors stay">
          <VRows rows={p.timeBuckets.map((v, i) => ({ label: TIME_BUCKETS[i], v: v / 0.5, text: fp0(v), c: i === 0 ? '#A14B0A' : '#8A5410' }))} />
          <p className="note">Active time, only while the tab is actually open. Avg. {mmss(T.time)} minutes.</p>
        </Panel>
      </div>

      <div className="grid-eq">
        <Panel title="How visitors get in touch">
          <DataTable
            rows={channels}
            defKey="inq"
            columns={[
              { key: 'name', label: 'Contact option', strong: true, cell: (r) => r.name },
              { key: 'clicks', label: 'Clicks', num: true, cell: (r) => fi(r.clicks) },
              { key: 'inq', label: 'Requests', num: true, cell: (r) => fi(r.inq) },
              { key: 'share', label: 'Share', num: true, cell: (r) => <Bar v={r.share} max={0.5} color="#6246C2">{fp0(r.share)}</Bar> },
            ]}
          />
          <p className="note">Clicks count every button click. Requests count only real contacts and completed bookings; spam is filtered out.</p>
        </Panel>
        <Panel title="Devices">
          <DataTable<DeviceRow & { vis: number }>
            rows={devices}
            defKey="vis"
            columns={[
              { key: 'name', label: 'Device', strong: true, cell: (r) => r.name },
              { key: 'vis', label: 'Visitors', num: true, cell: (r) => fi(r.vis) },
              { key: 'time', label: 'Time on page', num: true, cell: (r) => mmss(r.time) },
              { key: 'load', label: 'Load time', num: true, cell: (r) => r.load.toFixed(1) + ' s' },
              { key: 'r1', label: 'Rate 1', num: true, cell: (r) => <Bar v={r.r1} max={maxDevR1} color="#2B4FB3">{fp(r.r1)}</Bar> },
            ]}
          />
        </Panel>
      </div>

      <div className="grid-eq">
        <Panel title="Where visitors come from">
          <DataTable
            rows={sources}
            defKey="vis"
            columns={[
              { key: 'name', label: 'Source', strong: true, cell: (r) => r.name },
              { key: 'vis', label: 'Visitors', num: true, cell: (r) => fi(r.vis) },
              { key: 'inq', label: 'Requests', num: true, cell: (r) => fi(r.inq) },
              { key: 'r1', label: 'Rate 1', num: true, cell: (r) => <Bar v={r.r1} max={maxSrcR1} color="#2B4FB3">{fp(r.r1)}</Bar> },
            ]}
          />
        </Panel>
        {calcPanel ?? pathPanel}
      </div>

      <Panel title="Search terms for this page">
        <DataTable
          rows={terms}
          defKey="clicks"
          columns={[
            { key: 'q', label: 'Search term', strong: true, cell: (r) => r.q },
            { key: 'pos', label: 'Position', num: true, cell: (r) => r.pos.toFixed(1) },
            { key: 'impr', label: 'Impressions', num: true, cell: (r) => fi(r.impr) },
            { key: 'clicks', label: 'Clicks', num: true, cell: (r) => fi(r.clicks) },
            { key: 'ctr', label: 'Click rate', num: true, cell: (r) => fp(r.ctr) },
            { key: 'inq', label: 'Requests (est.)', num: true, cell: (r) => fi(r.inq) },
          ]}
        />
        <p className="note">From Google Search Console. Google doesn’t say which term each visitor used, so requests per term are estimated.</p>
      </Panel>
      {calcPanel && pathPanel}

      <Panel title="Changes to this page">
        {pageChanges.length ? (
          <ChangesTable list={pageChanges} noPage />
        ) : (
          <p className="note">No changes logged yet. Each change appears here and as a marker on the chart.</p>
        )}
      </Panel>
      <Panel title="Latest requests through this page">
        {pageInquiries.length ? <InquiryTable list={pageInquiries} /> : <p className="note">No requests in this period yet.</p>}
      </Panel>
    </>
  );
}
