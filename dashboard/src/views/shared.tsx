import { Fragment } from 'react';
import { DataTable, type Column } from '../components/DataTable';
import { Dx, PageLink } from '../components/ui';
import { BY_ID, type Change, type Inquiry, type Page } from '../data/model';

type ChangeRow = Change & { where: string };

export function ChangesTable({ list, noPage }: { list: Change[]; noPage?: boolean }) {
  let cols: Column<ChangeRow>[] = [
    { key: 'num', label: '#', num: true, cell: (r) => <b>{r.num}</b> },
    { key: 'at', label: 'Date', cell: (r) => r.date },
    { key: 'title', label: 'Change', strong: true, cell: (r) => r.title },
    {
      key: 'where',
      label: 'Page',
      cell: (r) =>
        r.pages.map((pid, i) => (
          <Fragment key={pid}>
            {i > 0 && ', '}
            <PageLink page={BY_ID[pid]} />
          </Fragment>
        )),
    },
    { key: 'metric', label: 'Measured by', cell: (r) => r.metric },
    { key: 'before', label: 'Before', num: true, cell: (r) => r.before },
    { key: 'after', label: 'After', num: true, cell: (r) => <b>{r.after}</b> },
    {
      key: 'verdict',
      label: 'Result',
      sort: false,
      cell: (r) => <Dx tone={r.verdict === 'Clear' ? 'good' : 'info'}>{r.verdict === 'Clear' ? 'Clear improvement' : 'Likely improvement'}</Dx>,
    },
  ];
  if (noPage) cols = cols.filter((c) => c.key !== 'where');
  return (
    <>
      <DataTable<ChangeRow> columns={cols} rows={list.map((c) => ({ ...c, where: BY_ID[c.pages[0]].name }))} defKey="at" />
      <p className="note">
        Equal periods before and after are compared, on the changed page only. “Likely” means the trend is clear but there is still little data.
      </p>
    </>
  );
}

interface InquiryRow {
  n: number;
  when: string;
  ch: string;
  p: Page;
  page: string;
  src: string;
  dev: string;
  t: string;
}

export function InquiryTable({ list, withPage }: { list: Inquiry[]; withPage?: boolean }) {
  const cols: Column<InquiryRow>[] = [
    { key: 'n', label: 'Received', cell: (r) => r.when },
    { key: 'ch', label: 'Channel', strong: true, cell: (r) => r.ch },
  ];
  if (withPage) cols.push({ key: 'page', label: 'Page', cell: (r) => <PageLink page={r.p} /> });
  cols.push(
    { key: 'src', label: 'Source', cell: (r) => r.src },
    { key: 'dev', label: 'Device', cell: (r) => r.dev },
    { key: 't', label: 'Time on site before contact', num: true, cell: (r) => r.t },
  );
  const rows = list.map(([n, when, ch, pid, src, dev, t]) => ({ n, when, ch, p: BY_ID[pid], page: BY_ID[pid].name, src, dev, t }));
  return (
    <>
      <DataTable<InquiryRow> columns={cols} rows={rows} defKey="n" />
      <p className="note">Contact and health data stay in the practice system and are not shown here.</p>
    </>
  );
}
