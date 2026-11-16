/** Search terms from Google Search Console (contract §11), shared by the site-wide view and the page detail. */
import type { ReactNode } from 'react';
import { DataTable, type Column } from '../components/DataTable';
import { Bar } from '../components/ui';
import { weekLabel, type SearchData, type SearchTerm } from '../data/model';
import { useSiteData } from '../data/stats';
import { fi, fp } from '../lib/format';
import { useSiteNavigate } from '../site';
import { PathLink } from './shared';

interface Row {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  /** Sort key; lower is better, missing last. */
  position: number;
  pos: number | null;
  path: string;
}

/** Terms with clicks, impressions, click share and average position; site-wide with the main landing page. */
export function TermTable({ terms, withPage }: { terms: SearchTerm[]; withPage?: boolean }) {
  const d = useSiteData();
  const rows: Row[] = terms.map((t) => ({
    query: t.query,
    clicks: t.clicks,
    impressions: t.impressions,
    ctr: t.impressions ? t.clicks / t.impressions : 0,
    position: t.position ?? 999,
    pos: t.position,
    path: t.path ?? '',
  }));
  const max = Math.max(1, ...rows.map((r) => r.clicks));
  const cols: Column<Row>[] = [
    { key: 'query', label: 'Search term', strong: true, cell: (r) => r.query },
    {
      key: 'clicks',
      label: 'Clicks',
      num: true,
      cell: (r) => (
        <Bar v={r.clicks} max={max} color="#55635F">
          {fi(r.clicks)}
        </Bar>
      ),
    },
    { key: 'impressions', label: 'Shown in results', num: true, cell: (r) => fi(r.impressions) },
    { key: 'ctr', label: 'Clicked', num: true, cell: (r) => fp(r.ctr) },
    { key: 'position', label: 'Avg. position', num: true, cell: (r) => (r.pos === null ? '–' : r.pos.toFixed(1)) },
  ];
  if (withPage) cols.push({ key: 'path', label: 'Main landing page', cell: (r) => <PathLink path={r.path || null} d={d} /> });
  return <DataTable<Row> columns={cols} rows={rows} defKey="clicks" />;
}

/** "Data through Nov 13, imported 3 h ago." for an active connection. */
export function throughText(s: SearchData): string {
  return s.through ? `Search Console data through ${weekLabel(s.through)}.` : '';
}

/**
 * What to say when there are no terms to show: the connection's state with a way to fix it, or `empty`
 * when the connection is fine and Google simply has no terms for this range.
 */
export function SearchNote({ s, empty }: { s: SearchData; empty: ReactNode }) {
  const navigate = useSiteNavigate();
  const go = (label: string) => (
    <>
      {' '}
      <button className="lnk" onClick={() => navigate('/settings/search-console')}>
        {label}
      </button>
    </>
  );
  let text: ReactNode;
  switch (s.status) {
    case 'unavailable':
      text = 'Search terms come from Google Search Console, which this server can’t connect yet. Until then, Sources shows how many visits come from Google search.';
      break;
    case 'not_connected':
      text = <>Search terms come from Google Search Console.{go('Connect Search Console')}</>;
      break;
    case 'needs_property':
      text = <>Search Console is connected, but the property for this website still has to be chosen.{go('Choose the property')}</>;
      break;
    case 'error':
      text = <>The Search Console connection stopped working.{go('Connect it again')}</>;
      break;
    default:
      text = s.lastSyncAt ? empty : 'Search Console is connected; the first import is running. Reload in a minute or two.';
  }
  return <p className="note">{text}</p>;
}
