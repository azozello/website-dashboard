import { DataTable, type Column } from '../components/DataTable';
import { PageLink } from '../components/ui';
import { CHANNEL_NAME, DEVICE_NAME, SOURCE_NAME, type Page, type RequestRow, type SiteData } from '../data/model';
import { useSiteData } from '../data/stats';

/** A path as the page's name when it is a listed page, else the path itself. */
export function PathLink({ path, d }: { path: string | null; d: SiteData }) {
  if (!path) return <>–</>;
  const p = d.byId[path];
  return p ? <PageLink page={p} /> : <>{path}</>;
}

export const pageName = (d: SiteData, path: string) => d.byId[path]?.name ?? path;

/** "2 min 05 s", "1 h 12 min". */
export function duration(s: number): string {
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

interface Row {
  at: string;
  when: string;
  ch: string;
  page: string;
  path: string | null;
  p: Page | undefined;
  src: string;
  dev: string;
  t: number;
}

/** Latest counted requests (spam and shadow methods left out). */
export function RequestTable({ list, withPage }: { list: RequestRow[]; withPage?: boolean }) {
  const d = useSiteData();
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: d.timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const cols: Column<Row>[] = [
    { key: 'at', label: 'Received', cell: (r) => r.when },
    { key: 'ch', label: 'Channel', strong: true, cell: (r) => r.ch },
  ];
  if (withPage) cols.push({ key: 'page', label: 'Page', cell: (r) => <PathLink path={r.path} d={d} /> });
  cols.push(
    { key: 'src', label: 'Source', cell: (r) => r.src },
    { key: 'dev', label: 'Device', cell: (r) => r.dev },
    { key: 't', label: 'Time on site before contact', num: true, cell: (r) => (r.t >= 0 ? duration(r.t) : '–') },
  );
  const rows: Row[] = list.map((r) => ({
    at: r.at,
    when: fmt.format(new Date(r.at)),
    ch: (CHANNEL_NAME[r.channel] ?? r.channel) + (r.form ? ` · ${r.form}` : ''),
    path: r.path,
    p: r.path ? d.byId[r.path] : undefined,
    page: r.path ? pageName(d, r.path) : '',
    src: r.source ? (SOURCE_NAME[r.source] ?? r.source) : 'Not linked to a visit',
    dev: r.device ? (DEVICE_NAME[r.device] ?? r.device) : '–',
    t: r.secondsBefore ?? -1,
  }));
  return (
    <>
      <DataTable<Row> columns={cols} rows={rows} defKey="at" />
      <p className="note">Contact and health data stay in the practice system and are not shown here. Spam is filtered out.</p>
    </>
  );
}
