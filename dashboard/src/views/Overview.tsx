import { useMemo } from 'react';
import { useSiteNavigate } from '../site';
import { DataTable } from '../components/DataTable';
import { MetricCards } from '../components/MetricCards';
import { TrendChart } from '../components/TrendChart';
import { Bar, Change, Dx, Head, Panel, pagePath } from '../components/ui';
import { allStats, rangeName, rangeText, type Diagnosis } from '../lib/analysis';
import { fi, fp, fp0, mmss } from '../lib/format';
import type { Page } from '../data/model';
import { useSiteData } from '../data/stats';
import { useDashboard } from '../state';

interface Row {
  p: Page;
  name: string;
  vis: number;
  conv: number;
  inq: number;
  r1: number;
  dr1: number;
  time: number;
  scroll: number;
  pot: number;
  d: Diagnosis;
}

export function Overview() {
  const { range, show, toggleShow } = useDashboard();
  const navigate = useSiteNavigate();
  const d = useSiteData();
  const { S, stats } = useMemo(() => allStats(d, range), [d, range]);

  const top = stats
    .filter((s) => s.potential >= 1)
    .sort((a, b) => b.potential - a.potential)
    .slice(0, 3);

  const rows: Row[] = stats.map((s) => ({
    p: s.p,
    name: s.p.name,
    vis: s.T.vis,
    conv: s.T.conv,
    inq: s.T.inq,
    r1: s.T.r1,
    dr1: s.T.r1 - s.P.r1,
    time: s.T.time,
    scroll: s.T.scroll,
    pot: s.potential,
    d: s.diag[0],
  }));
  const maxR1 = Math.max(...rows.map((r) => r.r1));

  return (
    <>
      <Head title="How your website turns visitors into appointment requests">
        Last {rangeName(range)}, compared with the period before. Every number is also available for each page.
      </Head>

      <section className="panel" aria-label="Numbers for the whole website">
        <MetricCards T={S.T} P={S.P} show={show} onToggle={toggleShow} />
        <TrendChart cur={S.cur} show={show} flags={[]} />
      </section>

      <Panel title="What to fix next">
        {!top.length && (
          <p className="note">
            No page is clearly below the site average yet. Pages are compared once at least 30 visits start on them and the gap is bigger than chance.
          </p>
        )}
        <ol className="fix">
          {top.map((s) => {
            const d = s.diag[0];
            const open = () => navigate(pagePath(s.p));
            return (
              <li
                key={s.p.id}
                tabIndex={0}
                role="link"
                onClick={open}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    open();
                  }
                }}
              >
                <span className="where">{s.p.name}</span>
                <span className="why">
                  {d.title}. {d.text}
                </span>
                <span className="gain r1">About +{fi(s.potential)} requests a month if the page reaches the site average</span>
              </li>
            );
          })}
        </ol>
      </Panel>

      <Panel title="All pages" id="allpages">
        <DataTable<Row>
          rows={rows}
          defKey="pot"
          columns={[
            {
              key: 'name',
              label: 'Page',
              cell: (r) => (
                <button className="lnk pn" onClick={() => navigate(pagePath(r.p))}>
                  <b>{r.name}</b>
                  <span>{r.p.path}</span>
                </button>
              ),
            },
            { key: 'vis', label: 'Visitors', num: true, cell: (r) => fi(r.vis) },
            { key: 'inq', label: 'Requests', num: true, cell: (r) => fi(r.inq) },
            { key: 'r1', label: 'Rate 1', num: true, cell: (r) => (
                <span title={rangeText(r.conv, r.vis)}>
                  <Bar v={r.r1} max={maxR1} color="#2B4FB3">
                    {fp(r.r1)}
                  </Bar>
                </span>
              ),
            },
            { key: 'dr1', label: 'Change', num: true, cell: (r) => <Change cur={r.r1} prev={r.r1 - r.dr1} rate /> },
            { key: 'time', label: 'Time on page', num: true, cell: (r) => mmss(r.time) },
            { key: 'scroll', label: 'Read 75%', num: true, cell: (r) => fp0(r.scroll) },
            { key: 'pot', label: 'Potential / month', num: true, cell: (r) => (r.pot >= 1 ? '+' + fi(r.pot) + ' requests' : '–') },
            { key: 'dtitle', label: 'Main finding', sort: false, cell: (r) => <Dx tone={r.d.tone}>{r.d.title}</Dx> },
          ]}
        />
        <p className="note">
          Visitors and Rate 1 are credited to the page a visit starts on. Potential = extra requests per month if the page reaches the
          site average of {fp(S.T.r1)}, shown only where the page is clearly below it. Hover a rate for its 95% range. Click a page for all
          details.
        </p>
      </Panel>
    </>
  );
}
