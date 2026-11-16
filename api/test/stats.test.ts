import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../src/app.ts';
import { computeStats, shortRoute, WEEKS, type Stats } from '../src/stats.ts';
import { Browser, freshApp, signUpVerified } from './helpers.ts';

let t: App;
let owner: Browser;
let outsider: Browser;
let siteId = '';

/** Wednesday; the site's current week starts Monday 16 Nov 00:00 Berlin = 15 Nov 23:00 UTC. */
const NOW = new Date('2026-11-18T12:00:00Z');

beforeAll(async () => {
  t = await freshApp('stats');
  owner = await signUpVerified(t, 'owner@stats.example');
  outsider = await signUpVerified(t, 'outsider@other.example');
  const org = await owner.post('/api/auth/organization/create', { name: 'stats', slug: 'stats' });
  siteId = (await owner.post(`/api/orgs/${org.json.id}/sites`, { name: 'Praxis', platform: 'wordpress', origins: ['https://praxis.example'] })).json.site.id;
});
afterAll(async () => {
  await t.app.close();
});

async function visit(v: { at: string; landing: string; source: string; device: string; test?: boolean }): Promise<string> {
  const { rows } = await t.db.query<{ id: string }>(
    `INSERT INTO visits (site_id, visitor_key, started_at, last_seen_at, landing_path, source_channel, device, test)
     VALUES ($1, md5(random()::text), $2, $2, $3, $4, $5, $6) RETURNING id`,
    [siteId, v.at, v.landing, v.source, v.device, v.test ?? false],
  );
  return rows[0].id;
}

async function pageview(visitId: string, p: { pv: string; seq: number; path: string; at: string; title?: string; active?: number; scroll?: number; sections?: string[]; load?: number }) {
  await t.db.query(
    `INSERT INTO pageviews (pv, site_id, visit_id, seq, path, title, nav, received_at, load_ms, active_ms, scroll, sections, has_engage)
     VALUES ($1, $2, $3, $4, $5, $6, 'load', $7, $8, $9, $10, $11, $12)`,
    [p.pv, siteId, visitId, p.seq, p.path, p.title ?? null, p.at, p.load ?? null, p.active ?? null, p.scroll ?? null, p.sections ?? [], p.active !== undefined],
  );
}

async function request(r: { visitId: string | null; pv?: string; path?: string; at: string; counts?: boolean; spam?: boolean; confirmation?: string; source?: string; formId?: string }) {
  await t.db.query(
    `INSERT INTO requests (site_id, visit_id, pv, path, channel, confirmation, source, form_id, counts, spam, received_at)
     VALUES ($1, $2, $3, $4, 'form', $5, $6, $7, $8, $9, $10)`,
    [siteId, r.visitId, r.pv ?? null, r.path ?? null, r.confirmation ?? 'server', r.source ?? null, r.formId ?? null, r.counts ?? true, r.spam ?? false, r.at],
  );
}

describe('stats', () => {
  it('is empty before ingest has created its tables', async () => {
    const s = await computeStats(t.db, siteId, { weeks: 4, now: NOW });
    expect(s.weeks).toHaveLength(WEEKS);
    expect(s.weeks.at(-1)).toBe('2026-11-16');
    expect(s.pages).toEqual([]);
    expect(s.site.series.every((w) => w.vis === 0)).toBe(true);
  });

  it('seeds tracking data', async () => {
    await t.db.query(fs.readFileSync(new URL('../../ingest/migrations/001_init.sql', import.meta.url), 'utf8'));
    await t.db.query(`UPDATE site_config SET request_rules = $2 WHERE site_id = $1`, [
      siteId,
      JSON.stringify([{ method: 'server', source: 'cf7', form_id: '12', form: 'Contact', counts: true }]),
    ]);

    // A: Google, mobile, lands on /, goes to /kontakt and sends the form there.
    const a = await visit({ at: '2026-11-17T10:00:00Z', landing: '/', source: 'google_organic', device: 'mobile' });
    await pageview(a, { pv: 'a1', seq: 1, path: '/', at: '2026-11-17T10:00:00Z', title: 'Home', active: 40_000, scroll: 80, sections: ['prices'], load: 1200 });
    await pageview(a, { pv: 'a2', seq: 2, path: '/kontakt', at: '2026-11-17T10:03:00Z', title: 'Kontakt', active: 20_000, scroll: 100 });
    await t.db.query(`INSERT INTO clicks (site_id, visit_id, pv, eid, kind, received_at) VALUES ($1, $2, 'a1', 'e1', 'call', '2026-11-17T10:01:00Z')`, [siteId, a]);
    await request({ visitId: a, pv: 'a2', path: '/kontakt', at: '2026-11-17T10:05:00Z', source: 'cf7', formId: '12' });
    await request({ visitId: a, pv: 'a2', path: '/kontakt', at: '2026-11-17T10:05:01Z', confirmation: 'browser', formId: 'Contact', counts: false }); // shadow
    for (const step of [1, 2])
      await t.db.query(`INSERT INTO flow_steps (site_id, visit_id, pv, flow, flow_id, step, name, received_at) VALUES ($1, $2, 'a1', 'booking', 'bk', $3, $4, '2026-11-17T10:02:00Z')`, [
        siteId,
        a,
        step,
        step === 1 ? 'Service' : 'Time',
      ]);

    // B: direct, desktop, short look at /, starts the booking only.
    const b = await visit({ at: '2026-11-16T08:00:00Z', landing: '/', source: 'direct', device: 'desktop' });
    await pageview(b, { pv: 'b1', seq: 1, path: '/', at: '2026-11-16T08:00:00Z', active: 5_000, scroll: 30, load: 800 });
    await t.db.query(`INSERT INTO flow_steps (site_id, visit_id, pv, flow, flow_id, step, name, received_at) VALUES ($1, $2, 'b1', 'booking', 'bk', 1, 'Service', '2026-11-16T08:00:10Z')`, [siteId, b]);

    // E: Monday 00:30 in Berlin, still Sunday in UTC: belongs to the current week.
    const e = await visit({ at: '2026-11-15T23:30:00Z', landing: '/', source: 'direct', device: 'tablet' });
    await pageview(e, { pv: 'e1', seq: 1, path: '/', at: '2026-11-15T23:30:00Z' });

    // D: last week, referral, spam only.
    const d = await visit({ at: '2026-11-10T09:00:00Z', landing: '/leistungen', source: 'referral', device: 'desktop' });
    await pageview(d, { pv: 'd1', seq: 1, path: '/leistungen', at: '2026-11-10T09:00:00Z', title: 'Leistungen' });
    await request({ visitId: d, pv: 'd1', path: '/leistungen', at: '2026-11-10T09:01:00Z', spam: true, source: 'cf7', formId: '12' });

    // Test visit: never counted.
    const x = await visit({ at: '2026-11-17T11:00:00Z', landing: '/', source: 'direct', device: 'desktop', test: true });
    await pageview(x, { pv: 'x1', seq: 1, path: '/', at: '2026-11-17T11:00:00Z', active: 9_000, scroll: 100 });
    await request({ visitId: x, pv: 'x1', path: '/', at: '2026-11-17T11:01:00Z', source: 'cf7', formId: '12' });

    // Unattributed (Wix-style webhook), and a visit older than the 52 weeks.
    await request({ visitId: null, at: '2026-11-17T12:00:00Z', confirmation: 'webhook', formId: 'Callback' });
    const old = await visit({ at: '2025-01-01T09:00:00Z', landing: '/alt', source: 'direct', device: 'desktop' });
    await pageview(old, { pv: 'o1', seq: 1, path: '/alt', at: '2025-01-01T09:00:00Z' });
  });

  let s: Stats;
  it('counts the weekly series by the site timezone', async () => {
    s = await computeStats(t.db, siteId, { weeks: 4, now: NOW });
    expect(s.timezone).toBe('Europe/Berlin');
    expect(s.range).toEqual({ weeks: 4, from: '2026-10-25T23:00:00.000Z' });
    expect(s.site.series.at(-1)).toEqual({ vis: 3, conv: 1, inq: 2, cta: 1, pvs: 4, eng: 3, activeMs: 65_000, s75: 2 });
    expect(s.site.series.at(-2)).toEqual({ vis: 1, conv: 0, inq: 0, cta: 0, pvs: 1, eng: 0, activeMs: 0, s75: 0 });
    expect(s.site.series.slice(0, -2).every((w) => w.vis === 0 && w.pvs === 0)).toBe(true);
  });

  it('lists pages by views with their latest title, crediting visits to the landing page', () => {
    expect(s.pages.map((p) => [p.path, p.title])).toEqual([
      ['/', 'Home'],
      ['/kontakt', 'Kontakt'],
      ['/leistungen', 'Leistungen'],
    ]);
    const [home, kontakt] = s.pages;
    expect(home.series.at(-1)).toEqual({ vis: 3, conv: 1, inq: 1, cta: 1, pvs: 3, eng: 2, activeMs: 45_000, s75: 1 });
    expect(kontakt.series.at(-1)).toEqual({ vis: 0, conv: 0, inq: 0, cta: 0, pvs: 1, eng: 1, activeMs: 20_000, s75: 1 });
  });

  it('breaks the range down by source, device, contact option, scroll, time and section', () => {
    const x = s.site.breakdown;
    expect(x.sources).toEqual([
      { name: 'direct', vis: 2, conv: 0, inq: 0 },
      { name: 'google_organic', vis: 1, conv: 1, inq: 1 },
      { name: 'referral', vis: 1, conv: 0, inq: 0 },
    ]);
    const mobile = x.devices.find((d) => d.name === 'mobile');
    expect(mobile).toEqual({ name: 'mobile', vis: 1, conv: 1, inq: 1, pvs: 2, eng: 2, activeMs: 60_000, s75: 2, loadMs: 1200, loadN: 1 });
    expect(x.devices.find((d) => d.name === 'desktop')).toMatchObject({ vis: 2, conv: 0, pvs: 2, eng: 1, loadMs: 800, loadN: 1 });
    expect(x.clicks).toEqual({ call: 1 });
    expect(x.requests).toEqual({ form: 2 });
    expect(x.scroll).toEqual({ eng: 3, s25: 3, s50: 2, s75: 2, s100: 1 });
    expect(x.time).toEqual([1, 1, 1, 0, 0]);
    expect(x.sections).toEqual([{ name: 'prices', n: 1 }]);
    expect(s.site.unattributed).toBe(1);

    const [home, kontakt] = s.pages;
    expect(home.breakdown.clicks).toEqual({ call: 1 });
    expect(home.breakdown.requests).toEqual({});
    expect(kontakt.breakdown.requests).toEqual({ form: 1 });
    expect(home.breakdown.sources.map((r) => r.name)).toEqual(['direct', 'google_organic']);
  });

  it('builds funnels, routes and the request list', () => {
    expect(s.funnels).toEqual([
      {
        flow: 'booking',
        flowId: 'bk',
        startPath: '/',
        steps: [
          { step: 1, name: 'Service', visits: 2 },
          { step: 2, name: 'Time', visits: 1 },
        ],
      },
    ]);
    expect(s.routes).toEqual([{ path: '/kontakt', route: ['/', '/kontakt'], n: 1 }]);
    expect(s.requests).toEqual([
      { at: '2026-11-17T12:00:00.000Z', channel: 'form', form: 'Callback', path: null, source: null, device: null, secondsBefore: null },
      { at: '2026-11-17T10:05:00.000Z', channel: 'form', form: 'Contact', path: '/kontakt', source: 'google_organic', device: 'mobile', secondsBefore: 300 },
    ]);
  });

  it('shortens long routes', () => {
    expect(shortRoute(['/', '/', '/a', '/a'])).toEqual(['/', '/a']);
    expect(shortRoute(['/', '/a', '/b', '/c', '/d'])).toEqual(['/', '…', '/c', '/d']);
  });

  it('serves members only, with a valid range', async () => {
    const r = await owner.get(`/api/sites/${siteId}/stats?weeks=26`);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(r.json.range.weeks).toBe(26);
    expect(r.json.weeks).toHaveLength(WEEKS); // real clock here: which seeded rows fall in range depends on today
    expect(Array.isArray(r.json.pages)).toBe(true);
    expect((await owner.get(`/api/sites/${siteId}/stats`)).json.range.weeks).toBe(13);
    expect((await owner.get(`/api/sites/${siteId}/stats?weeks=5`)).status).toBe(400);
    expect((await outsider.get(`/api/sites/${siteId}/stats`)).status).toBe(404);
    expect((await new Browser(t).get(`/api/sites/${siteId}/stats`)).status).toBe(401);
  });
});
