/**
 * Dashboard data model: the shapes the views render, and the site's data.
 *
 * Empty until the data API (`/api/sites/:siteId/…`, tables in specs/Data-Contract-v1.md §10, metrics in §11)
 * fills it. While SITE is empty, every site view shows the "waiting for data" screen (views/NoData.tsx), so the
 * views and lib/analysis.ts never run on empty arrays.
 */

export type Tone = 'good' | 'warn' | 'info';

/** One week of a page or of the whole site. */
export interface Week {
  label: string;
  vis: number;
  inq: number;
  cta: number;
  time: number;
  scroll: number;
  r1: number;
}

export interface Page {
  id: string;
  slug: string;
  path: string;
  name: string;
  series: Week[];
  /** [name, share of requests, clicks per request] */
  channels: [string, number, number][];
  /** [element, position on page in %] */
  elements: [string, number][];
  timeBuckets: number[];
  /** [source, share of visitors, Rate 1 factor] */
  sources: [string, number, number][];
  /** [term, position, impressions, clicks] */
  terms: [string, number, number, number][];
  mobile: number;
  mobF: number;
  deskF: number;
  load: [number, number];
  /** Booking or calculator steps: [step, visits that reached it] */
  calc: [string, number][] | null;
  /** [click path, requests] */
  paths: [string, number][];
}

export interface Change {
  /** Week index in the series. */
  at: number;
  num: number;
  date: string;
  pages: string[];
  title: string;
  metric: string;
  before: string;
  after: string;
  verdict: 'Clear' | 'Likely';
}

/** [n, received, channel, page id, source, device, time on site before contact] */
export type Inquiry = [number, string, string, string, string, string, string];

/** Request channel name for online bookings. */
export const BOOK = 'Online booking';

/** Weeks in every series (the 6-month range compares the last 26 weeks with the 26 before). */
export const WEEKS = 52;

export const PAGES: Page[] = [];
export const BY_ID: Record<string, Page> = {};
export const BY_SLUG: Record<string, Page> = {};
export const CHANGES: Change[] = [];
export const INQUIRIES: Inquiry[] = [];
/** Whole-site weekly series. Empty = no data yet. */
export const SITE: Week[] = [];

export const hasData = () => SITE.length > 0;
