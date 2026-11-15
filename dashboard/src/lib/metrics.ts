import { fi, fp, mmss } from './format';

export type MetricKey = 'vis' | 'inq' | 'r1' | 'time' | 'scroll' | 'cta';

export interface Metric {
  k: MetricKey;
  label: string;
  sub: string;
  c: string;
  f: (n: number) => string;
  rate?: boolean;
  /** Counts are averaged per page for the "site average" line. */
  count?: boolean;
}

export const METRICS: Metric[] = [
  { k: 'vis', label: 'Visitors', sub: 'Website visits', c: '#55635F', f: fi, count: true },
  { k: 'inq', label: 'Requests', sub: 'Booking, call, form', c: '#6246C2', f: fi, count: true },
  { k: 'r1', label: 'Rate 1', sub: 'Visitor → request', c: '#2B4FB3', f: fp, rate: true },
  { k: 'time', label: 'Time on page', sub: 'Avg. active time per visit', c: '#8A5410', f: mmss },
  { k: 'scroll', label: 'Scroll depth', sub: 'Read to 75% of the page', c: '#0F7A63', f: fp, rate: true },
  { k: 'cta', label: 'Contact clicks', sub: 'Booking, call, WhatsApp', c: '#1C2826', f: fi, count: true },
];
