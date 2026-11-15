/** Site-wide breakdowns: every page combined. */
import { useMemo, type ReactNode } from 'react';
import { DataTable } from '../components/DataTable';
import { Bar, Dx, Head, Muted, PageLink, Panel, VRows } from '../components/ui';
import { allStats, baseK, rangeName, type Range } from '../lib/analysis';
import { fi, fp, fp0, mmss } from '../lib/format';
import { BOOK, CHANGES, INQUIRIES, PAGES, type Page, type Tone } from '../data/model';
import { useDashboard } from '../state';
import { ChangesTable, InquiryTable } from './shared';

function SiteHead({ title, range, children }: { title: string; range: Range; children: ReactNode }) {
  return (
    <Head title={title}>
      {children} Last {rangeName(range)}, all pages combined.
    </Head>
  );
}

function useAllStats() {
  const { range } = useDashboard();
  return { range, ...useMemo(() => allStats(range), [range]) };
}

/* ---------- Search terms ---------- */

export function SearchTerms() {
  const { range, stats } = useAllStats();
  const rows = stats.flatMap((s) => {
    const p = s.p;
    const rv = baseK(p, s.T);
    const tc = p.terms.reduce((a, t) => a + t[3], 0);
    return p.terms.map((t) => {
      const ctr = t[3] / t[2];
      let d: string;
      let tone: Tone;
      if (t[2] * rv > 3000 && ctr < 0.025) [tone, d] = ['warn', 'Seen often, rarely clicked. Rewrite the title'];
      else if (t[1] <= 3.5) [tone, d] = ['good', 'Strong. Hold the position'];
      else if (t[1] <= 10) [tone, d] = ['info', 'Close to the top spots. Expand the content'];
      else [tone, d] = ['info', 'Ranks low. Strengthen content and links'];
      return { q: t[0], p, page: p.name, pos: t[1], impr: t[2] * rv, clicks: t[3] * rv, ctr, inq: (s.T.inq * 0.8 * t[3]) / tc, d, tone };
    });
  });
  return (
    <>
      <SiteHead title="Search terms" range={range}>
        Every search term that brings visitors from Google, with the page they land on.
      </SiteHead>
      <Panel title="All search terms">
        <DataTable
          rows={rows}
          defKey="clicks"
          columns={[
            { key: 'q', label: 'Search term', strong: true, cell: (r) => r.q },
            { key: 'page', label: 'Landing page', cell: (r) => <PageLink page={r.p} /> },
            { key: 'pos', label: 'Position', num: true, cell: (r) => r.pos.toFixed(1) },
            { key: 'impr', label: 'Impressions', num: true, cell: (r) => fi(r.impr) },
            { key: 'clicks', label: 'Clicks', num: true, cell: (r) => fi(r.clicks) },
            { key: 'ctr', label: 'Click rate', num: true, cell: (r) => fp(r.ctr) },
            { key: 'inq', label: 'Requests (est.)', num: true, cell: (r) => fi(r.inq) },
            { key: 'd', label: 'Meaning', sort: false, cell: (r) => <Dx tone={r.tone}>{r.d}</Dx> },
          ]}
        />
        <p className="note">
          From Google Search Console. Google doesn’t say which term each visitor used, so requests per term are estimated from each term’s share of
          clicks.
        </p>
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
  const { range, stats } = useAllStats();
  const agg = new Map<string, { name: string; vis: number; inq: number; best: PageRate | null; worst: PageRate | null }>();
  stats.forEach((s) =>
    s.p.sources.forEach((x) => {
      const vis = s.T.vis * x[1];
      const r1 = s.T.r1 * x[2];
      if (!agg.has(x[0])) agg.set(x[0], { name: x[0], vis: 0, inq: 0, best: null, worst: null });
      const a = agg.get(x[0])!;
      a.vis += vis;
      a.inq += vis * r1;
      if (vis >= 25) {
        if (!a.best || r1 > a.best.r1) a.best = { p: s.p, r1 };
        if (!a.worst || r1 < a.worst.r1) a.worst = { p: s.p, r1 };
      }
    }),
  );
  const list = [...agg.values()];
  const tot = list.reduce((t, a) => t + a.vis, 0);
  const rows = list.map((a) => ({ ...a, share: a.vis / tot, r1: a.inq / a.vis }));
  const mx = Math.max(...rows.map((r) => r.r1));
  const top = rows.filter((r) => r.share >= 0.05).sort((a, b) => b.r1 - a.r1)[0];
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
            { key: 'name', label: 'Source', strong: true, cell: (r) => r.name },
            { key: 'vis', label: 'Visitors', num: true, cell: (r) => fi(r.vis) },
            { key: 'share', label: 'Share', num: true, cell: (r) => <Bar v={r.share} max={1} color="#55635F">{fp0(r.share)}</Bar> },
            { key: 'inq', label: 'Requests', num: true, cell: (r) => fi(r.inq) },
            { key: 'r1', label: 'Rate 1', num: true, cell: (r) => <Bar v={r.r1} max={mx} color="#2B4FB3">{fp(r.r1)}</Bar> },
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
        {top && (
          <div className="callout">
            Visitors from <b>{top.name}</b> get in touch most often (Rate 1 {fp(top.r1)}). This source is the most worth growing.
          </div>
        )}
      </Panel>
    </>
  );
}

/* ---------- Devices ---------- */

export function Devices() {
  const { range, stats } = useAllStats();
  const agg = new Map<string, { name: string; vis: number; inq: number; time: number; scroll: number; load: number }>();
  const gaps = stats.map((s) => {
    s.dev.forEach((d) => {
      const vis = s.T.vis * d.share;
      if (!agg.has(d.name)) agg.set(d.name, { name: d.name, vis: 0, inq: 0, time: 0, scroll: 0, load: 0 });
      const a = agg.get(d.name)!;
      a.vis += vis;
      a.inq += vis * d.r1;
      a.time += d.time * vis;
      a.scroll += d.scroll * vis;
      a.load += d.load * vis;
    });
    return { p: s.p, page: s.p.name, mob: s.dev[0].r1, desk: s.dev[1].r1, ratio: s.dev[0].r1 / s.dev[1].r1, load: s.dev[0].load, vis: s.T.vis * s.dev[0].share };
  });
  const list = [...agg.values()];
  const tot = list.reduce((t, a) => t + a.vis, 0);
  const rows = list.map((a) => ({ name: a.name, vis: a.vis, share: a.vis / tot, inq: a.inq, r1: a.inq / a.vis, time: a.time / a.vis, scroll: a.scroll / a.vis, load: a.load / a.vis }));
  const mx = Math.max(...rows.map((r) => r.r1));
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
            { key: 'load', label: 'Avg. load time', num: true, cell: (r) => r.load.toFixed(1) + ' s' },
            { key: 'inq', label: 'Requests', num: true, cell: (r) => fi(r.inq) },
            { key: 'r1', label: 'Rate 1', num: true, cell: (r) => <Bar v={r.r1} max={mx} color="#2B4FB3">{fp(r.r1)}</Bar> },
          ]}
        />
      </Panel>
      <Panel title="Where mobile loses the most">
        <DataTable
          rows={gaps}
          defKey="ratio"
          defDir={1}
          columns={[
            { key: 'page', label: 'Page', cell: (r) => <PageLink page={r.p} /> },
            { key: 'vis', label: 'Mobile visitors', num: true, cell: (r) => fi(r.vis) },
            { key: 'mob', label: 'Rate 1 mobile', num: true, cell: (r) => fp(r.mob) },
            { key: 'desk', label: 'Rate 1 desktop', num: true, cell: (r) => fp(r.desk) },
            { key: 'load', label: 'Mobile load time', num: true, cell: (r) => r.load.toFixed(1) + ' s' },
            {
              key: 'ratio',
              label: 'Rating',
              cell: (r) =>
                r.ratio < 0.65 ? (
                  <Dx tone="warn">Clear gap. Check load time and buttons</Dx>
                ) : r.ratio < 0.8 ? (
                  <Dx tone="info">Small gap</Dx>
                ) : (
                  <Dx tone="good">Good on mobile</Dx>
                ),
            },
          ]}
        />
        <p className="note">Sorted by the ratio of mobile to desktop. The pages losing the most requests on mobile are at the top.</p>
      </Panel>
    </>
  );
}

/* ---------- Contact options ---------- */

export function ContactOptions() {
  const { range, stats } = useAllStats();
  const agg = new Map<string, { name: string; inq: number; clicks: number }>();
  let steps: number[] | null = null;
  let stepNames: string[] = [];
  stats.forEach((s) => {
    s.p.channels.forEach((c) => {
      if (!agg.has(c[0])) agg.set(c[0], { name: c[0], inq: 0, clicks: 0 });
      const a = agg.get(c[0])!;
      a.inq += s.T.inq * c[1];
      a.clicks += s.T.inq * c[1] * c[2];
    });
    if (s.p.calc) {
      const k = baseK(s.p, s.T);
      if (!steps) {
        steps = s.p.calc.map(() => 0);
        stepNames = s.p.calc.map((c) => c[0]);
      }
      const acc: number[] = steps;
      s.p.calc.forEach((c, i) => (acc[i] += c[1] * k));
    }
  });
  const list = [...agg.values()];
  const tot = list.reduce((t, a) => t + a.inq, 0);
  const rows = list.map((a) => ({ ...a, share: a.inq / tot, conv: a.inq / a.clicks }));

  let funnel: ReactNode = null;
  const st = steps as number[] | null;
  if (st) {
    let worstI = -1;
    let worstD = 0;
    for (let i = 1; i < st.length - 1; i++) {
      const dd = 1 - st[i] / st[i - 1];
      if (dd > worstD) {
        worstD = dd;
        worstI = i;
      }
    }
    funnel = (
      <Panel title={BOOK + ': where visitors drop out (all pages)'}>
        <VRows
          rows={st.map((v, j) => ({
            label: (
              <>
                {stepNames[j] + ' '}
                <Muted faint>{fi(v)}</Muted>
              </>
            ),
            v: v / st[0],
            text: fp0(v / st[0]),
            c: j === worstI ? '#A14B0A' : '#2B4FB3',
          }))}
        />
        <p className="note">
          Total across all pages with {BOOK}. Orange: the step with the biggest drop before it ({fp0(worstD)}).
        </p>
      </Panel>
    );
  }

  return (
    <>
      <SiteHead title="Contact options" range={range}>
        How visitors get in touch and which option works best.
      </SiteHead>
      <Panel title="All contact options">
        <DataTable
          rows={rows}
          defKey="inq"
          columns={[
            { key: 'name', label: 'Contact option', strong: true, cell: (r) => r.name },
            { key: 'clicks', label: 'Clicks', num: true, cell: (r) => fi(r.clicks) },
            { key: 'inq', label: 'Requests', num: true, cell: (r) => fi(r.inq) },
            { key: 'conv', label: 'Click → request', num: true, cell: (r) => fp(r.conv) },
            { key: 'share', label: 'Share of all requests', num: true, cell: (r) => <Bar v={r.share} max={0.6} color="#6246C2">{fp0(r.share)}</Bar> },
          ]}
        />
        <p className="note">
          Clicks count every button click, requests only real contacts. “Click → request” is lower for calls because not every click becomes a
          conversation.
        </p>
      </Panel>
      {funnel}
    </>
  );
}

/* ---------- Click paths ---------- */

export function ClickPaths() {
  const { range, stats } = useAllStats();
  const rows = stats.flatMap((s) => {
    const ptot = s.p.paths.reduce((a, x) => a + x[1], 0);
    return s.p.paths.map((x) => ({ path: x[0], p: s.p, page: s.p.name, inq: (x[1] / ptot) * s.T.inq, share: 0 }));
  });
  const total = rows.reduce((a, r) => a + r.inq, 0);
  rows.forEach((r) => (r.share = r.inq / total));
  const helpers = PAGES.map((q) => {
    const m = q.path === '/' ? 'Home page' : q.path;
    const n = rows.reduce((acc, r) => (r.p !== q && r.path.includes(m) ? acc + r.inq : acc), 0);
    return { p: q, page: q.name, n, share: n / total };
  }).filter((x) => x.n > 0);
  const direct = rows.filter((r) => r.path.startsWith('Requested directly')).reduce((a, r) => a + r.inq, 0);

  return (
    <>
      <SiteHead title="Click paths" range={range}>
        Which routes visitors take through the website before they get in touch.
      </SiteHead>
      <Panel title="Most common routes to a request">
        <DataTable
          rows={rows}
          defKey="inq"
          columns={[
            { key: 'path', label: 'Route', cell: (r) => r.path },
            { key: 'page', label: 'Requested via', cell: (r) => <PageLink page={r.p} /> },
            { key: 'inq', label: 'Requests', num: true, cell: (r) => fi(r.inq) },
            { key: 'share', label: 'Share', num: true, cell: (r) => <Bar v={r.share} max={0.4} color="#2B4FB3">{fp0(r.share)}</Bar> },
          ]}
        />
        <div className="callout">
          {fp0(direct / total)} of requests come straight from the first page visitors see. That’s why every landing page has to convince on its own.
        </div>
      </Panel>
      {helpers.length > 0 && (
        <Panel title="Pages that help requests happen">
          <DataTable
            rows={helpers}
            defKey="n"
            columns={[
              { key: 'page', label: 'Page', cell: (r) => <PageLink page={r.p} /> },
              { key: 'n', label: 'Requests where it appears on the way', num: true, cell: (r) => fi(r.n) },
              { key: 'share', label: 'Share', num: true, cell: (r) => <Bar v={r.share} max={0.5} color="#0F7A63">{fp0(r.share)}</Bar> },
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
        <ChangesTable list={CHANGES} />
      </Panel>
    </>
  );
}

export function Requests() {
  return (
    <>
      <Head title="Requests">Every request with the page it came from.</Head>
      <Panel title="Latest requests">
        <InquiryTable list={INQUIRIES} withPage />
      </Panel>
    </>
  );
}
