import crypto from 'node:crypto';
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../src/app.ts';
import { computeChecks } from '../src/checks.ts';
import { GSC_SCOPE, GoogleError, type AnalyticsRequest, type AnalyticsRow, type GoogleApi, type GscProperty, type Tokens } from '../src/google.ts';
import { aggregate, BACKFILL_DAYS, matchingProperties, pickProperty, REREAD_DAYS } from '../src/gsc.ts';
import { seal, unseal } from '../src/seal.ts';
import { computeStats } from '../src/stats.ts';
import { Browser, freshApp, signUpVerified } from './helpers.ts';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const D1 = daysAgo(6);
const D2 = daysAgo(5);

/** Search Analytics data the fake Google serves for every property. */
const PAGE_ROWS: AnalyticsRow[] = [
  { keys: [D1, 'https://praxis.example/ruecken/'], clicks: 5, impressions: 100, position: 4 },
  { keys: [D1, 'https://praxis.example/ruecken?utm_source=x'], clicks: 1, impressions: 100, position: 8 },
  { keys: [D1, 'https://shop.praxis.example/cart'], clicks: 9, impressions: 9, position: 1 }, // not one of the site's hosts
  { keys: [D2, 'https://praxis.example/'], clicks: 3, impressions: 50, position: 2 },
];
const QUERY_ROWS: AnalyticsRow[] = [
  { keys: [D1, 'https://praxis.example/ruecken/', 'rückenschmerzen'], clicks: 4, impressions: 60, position: 3 },
  { keys: [D1, 'https://praxis.example/ruecken?utm_source=x', 'rückenschmerzen'], clicks: 1, impressions: 20, position: 9 },
  { keys: [D2, 'https://praxis.example/', 'physio berlin'], clicks: 3, impressions: 40, position: 2 },
  { keys: [D2, 'https://praxis.example/ruecken', 'physio berlin'], clicks: 0, impressions: 10, position: 7 },
];

class FakeGoogle implements GoogleApi {
  properties: GscProperty[] = [
    { siteUrl: 'sc-domain:praxis.example', permissionLevel: 'siteOwner' },
    { siteUrl: 'https://other.example/', permissionLevel: 'siteFullUser' },
  ];
  scope = `openid email ${GSC_SCOPE}`;
  refreshError: string | null = null;
  refreshToken = 'rt-secret-1';
  challenge = '';
  calls: (AnalyticsRequest & { property: string })[] = [];
  revoked: string[] = [];

  authUrl(p: { redirectUri: string; state: string; codeChallenge: string }) {
    this.challenge = p.codeChallenge;
    return `https://accounts.google.example/auth?${new URLSearchParams({ redirect_uri: p.redirectUri, state: p.state })}`;
  }
  async exchangeCode(p: { code: string; redirectUri: string; codeVerifier: string }): Promise<Tokens> {
    if (p.code !== 'good-code') throw new GoogleError(400, 'invalid_grant');
    // PKCE: the verifier stored with the state matches the challenge sent to Google.
    expect(crypto.createHash('sha256').update(p.codeVerifier).digest('base64url')).toBe(this.challenge);
    expect(p.redirectUri).toBe('http://localhost:5173/api/gsc/callback');
    return { accessToken: 'at-1', refreshToken: this.refreshToken, scope: this.scope, email: 'agency@mail.example' };
  }
  async refresh(rt: string) {
    if (this.refreshError) throw new GoogleError(400, this.refreshError);
    expect(rt).toBe(this.refreshToken);
    return 'at-2';
  }
  async listProperties() {
    return this.properties;
  }
  async searchAnalytics(_at: string, property: string, q: AnalyticsRequest) {
    this.calls.push({ property, ...q });
    const src = q.dimensions.includes('query') ? QUERY_ROWS : PAGE_ROWS;
    const rows = src.filter((r) => r.keys[0] >= q.startDate && r.keys[0] <= q.endDate);
    return rows.slice(q.startRow, q.startRow + q.rowLimit);
  }
  async revoke(token: string) {
    this.revoked.push(token);
  }
}

/* ---------------------------------------------------------------- pure parts */

describe('search console helpers', () => {
  const props = (...urls: string[]) => urls.map((siteUrl) => ({ siteUrl, permissionLevel: 'siteOwner' }));

  it('matches properties to the site addresses', () => {
    const p = [
      ...props('sc-domain:praxis.example', 'https://praxis.example/', 'https://praxis.example/blog/', 'http://praxis.example/', 'sc-domain:other.example'),
      { siteUrl: 'sc-domain:example', permissionLevel: 'siteUnverifiedUser' },
    ];
    expect(matchingProperties(p, ['https://www.praxis.example', 'https://praxis.example'])).toEqual([
      'sc-domain:praxis.example',
      'https://praxis.example/',
      'https://praxis.example/blog/',
    ]);
    // Domain property for a parent domain counts; an unverified one doesn't.
    expect(matchingProperties(props('sc-domain:example'), ['https://praxis.example'])).toEqual(['sc-domain:example']);
    expect(matchingProperties([{ siteUrl: 'sc-domain:example', permissionLevel: 'siteUnverifiedUser' }], ['https://praxis.example'])).toEqual([]);
    expect(matchingProperties(props('sc-domain:xample'), ['https://praxis.example'])).toEqual([]);
  });

  it('picks a property only when there is no doubt', () => {
    expect(pickProperty(['sc-domain:a.example', 'https://a.example/'])).toBe('sc-domain:a.example');
    expect(pickProperty(['sc-domain:a.example', 'sc-domain:example'])).toBeNull();
    expect(pickProperty(['https://a.example/', 'https://a.example/blog/'])).toBe('https://a.example/');
    expect(pickProperty(['https://a.example/', 'https://www.a.example/'])).toBeNull();
    expect(pickProperty(['https://a.example/blog/'])).toBeNull();
    expect(pickProperty([])).toBeNull();
  });

  it('aggregates rows per day and normalised path, only on the site hosts', () => {
    const rows = aggregate(PAGE_ROWS, QUERY_ROWS, new Set(['praxis.example']));
    const find = (date: string, path: string, query: string | null) => rows.find((r) => r.date === date && r.path === path && r.query === query);
    // Two URLs of /ruecken: summed; positions weighted by impressions (4·100 + 8·100) / 200.
    expect(find(D1, '/ruecken', null)).toMatchObject({ clicks: 6, impressions: 200, position: 6 });
    expect(find(D1, '/ruecken', 'rückenschmerzen')).toMatchObject({ clicks: 5, impressions: 80, position: (3 * 60 + 9 * 20) / 80 });
    expect(find(D2, '/', null)).toMatchObject({ clicks: 3, impressions: 50, position: 2 });
    expect(rows.some((r) => r.path === '/cart')).toBe(false);
    expect(rows).toHaveLength(5);
  });

  it('seals tokens bound to their site', () => {
    const key = crypto.randomBytes(32);
    const s = seal(key, 'refresh-token', 'site-a');
    expect(s).toMatch(/^v1:/);
    expect(s).not.toContain('refresh-token');
    expect(unseal(key, s, 'site-a')).toBe('refresh-token');
    expect(() => unseal(key, s, 'site-b')).toThrow();
    expect(() => unseal(crypto.randomBytes(32), s, 'site-a')).toThrow();
  });
});

/* ---------------------------------------------------------------- without Google */

describe('search console not configured', () => {
  let t: App;
  let owner: Browser;
  let siteId = '';
  beforeAll(async () => {
    t = await freshApp('gsc_off');
    owner = await signUpVerified(t, 'owner@gscoff.example');
    const org = await owner.post('/api/auth/organization/create', { name: 'off', slug: 'gsc-off' });
    siteId = (await owner.post(`/api/orgs/${org.json.id}/sites`, { name: 'P', platform: 'php', origins: ['https://p.example'] })).json.site.id;
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('says so everywhere', async () => {
    expect((await owner.get(`/api/sites/${siteId}/gsc`)).json).toMatchObject({ available: false, connection: null });
    expect((await owner.post(`/api/sites/${siteId}/gsc/connect`)).status).toBe(503);
    const checks = (await owner.get(`/api/sites/${siteId}/checks`)).json.checks;
    expect(checks.find((c: { id: string }) => c.id === 'gsc_connected')).toMatchObject({ status: 'pending', reason: 'gsc_not_available' });
    expect((await owner.get(`/api/sites/${siteId}/stats?weeks=4`)).json.search).toMatchObject({ status: 'unavailable', terms: [] });
  });
});

/* ---------------------------------------------------------------- with a fake Google */

describe('search console', () => {
  let t: App;
  let google: FakeGoogle;
  let owner: Browser;
  let member: Browser;
  let outsider: Browser;
  let orgId = '';
  let siteId = '';

  beforeAll(async () => {
    google = new FakeGoogle();
    t = await freshApp('gsc', { google });
    owner = await signUpVerified(t, 'owner@gsc.example');
    member = await signUpVerified(t, 'member@gsc.example');
    outsider = await signUpVerified(t, 'outsider@other.example');
    orgId = (await owner.post('/api/auth/organization/create', { name: 'gsc', slug: 'gsc' })).json.id;
    siteId = (await owner.post(`/api/orgs/${orgId}/sites`, { name: 'Praxis', platform: 'wordpress', origins: ['https://praxis.example'] })).json.site.id;
    const memberId = (await t.db.query<{ id: string }>(`SELECT id FROM "user" WHERE email = 'member@gsc.example'`)).rows[0].id;
    await t.db.query(`INSERT INTO member (id, "organizationId", "userId", role, "createdAt") VALUES ('m-gsc', $1, $2, 'member', now())`, [orgId, memberId]);
  });
  afterAll(async () => {
    await t.app.close();
  });

  /** Starts the connect flow as `b`; returns the state Google would send back. */
  async function start(b: Browser, site = siteId) {
    const r = await b.post(`/api/sites/${site}/gsc/connect`);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const u = new URL(r.json.url);
    expect(u.searchParams.get('redirect_uri')).toBe('http://localhost:5173/api/gsc/callback');
    return u.searchParams.get('state')!;
  }

  const callback = (b: Browser, params: Record<string, string>) => b.get(`/api/gsc/callback?${new URLSearchParams(params)}`);
  const location = (r: { headers: Record<string, unknown> }) => String(r.headers.location);
  const conn = async (site = siteId) => (await t.db.query('SELECT * FROM gsc_connections WHERE site_id = $1', [site])).rows[0];

  it('lets only admins start, and only members look', async () => {
    expect((await member.post(`/api/sites/${siteId}/gsc/connect`)).status).toBe(403);
    expect((await outsider.post(`/api/sites/${siteId}/gsc/connect`)).status).toBe(404);
    expect((await outsider.get(`/api/sites/${siteId}/gsc`)).status).toBe(404);
    expect((await member.get(`/api/sites/${siteId}/gsc`)).json).toMatchObject({ available: true, connection: null });
    const checks = await computeChecks(t.db, siteId, 'wordpress', { gsc: true });
    expect(checks.find((c) => c.id === 'gsc_connected')).toMatchObject({ status: 'fail', reason: 'not_connected' });
  });

  it('refuses a state that is unknown, someone else’s, used or denied', async () => {
    expect(location(await callback(owner, { state: 'x'.repeat(43), code: 'good-code' }))).toBe('/?gsc=error&reason=invalid_state');

    const state = await start(owner);
    // Stored hashed only.
    expect((await t.db.query('SELECT 1 FROM gsc_oauth_states WHERE state_hash = $1', [state])).rowCount).toBe(0);
    expect(location(await callback(member, { state, code: 'good-code' }))).toBe('/?gsc=error&reason=invalid_state');
    expect((await callback(new Browser(t), { state, code: 'good-code' })).status).toBe(401);

    const denied = await start(owner);
    expect(location(await callback(owner, { state: denied, error: 'access_denied' }))).toBe(`/s/${siteId}/settings/search-console?gsc=error&reason=denied`);
    expect(location(await callback(owner, { state: denied, code: 'good-code' }))).toBe('/?gsc=error&reason=invalid_state'); // used

    const expired = await start(owner);
    await t.db.query(`UPDATE gsc_oauth_states SET expires_at = now() - interval '1 second' WHERE used_at IS NULL`);
    expect(location(await callback(owner, { state: expired, code: 'good-code' }))).toBe(`/s/${siteId}/settings/search-console?gsc=error&reason=expired`);
    expect(await conn()).toBeUndefined();
  });

  it('refuses a grant without the Search Console scope', async () => {
    google.scope = 'openid email';
    const state = await start(owner);
    expect(location(await callback(owner, { state, code: 'good-code' }))).toBe(`/s/${siteId}/settings/search-console?gsc=error&reason=scope_missing`);
    expect(await conn()).toBeUndefined();
    google.scope = `openid email ${GSC_SCOPE}`;
  });

  it('connects, picks the domain property and imports the history', async () => {
    const state = await start(owner);
    const r = await callback(owner, { state, code: 'good-code' });
    expect(location(r)).toBe(`/s/${siteId}/settings/search-console?gsc=connected`);
    await t.gsc.idle();

    const c = await conn();
    expect(c).toMatchObject({ status: 'active', property: 'sc-domain:praxis.example', google_email: 'agency@mail.example', last_error: null, sync_started_at: null });
    // Refresh token only encrypted, and only for this site.
    expect(c.refresh_token_enc).not.toContain('rt-secret');
    expect(t.gsc.unseal(c.refresh_token_enc, siteId)).toBe('rt-secret-1');

    // First sync: the whole backfill, in chunks, both row types.
    const first = google.calls.filter((x) => x.property === 'sc-domain:praxis.example');
    const starts = first.map((x) => x.startDate).sort();
    expect(starts[0]).toBe(daysAgo(BACKFILL_DAYS));
    expect(first.at(-1)!.endDate).toBe(today());
    expect(new Set(first.map((x) => x.dimensions.join(',')))).toEqual(new Set(['date,page', 'date,page,query']));

    const rows = (await t.db.query(`SELECT to_char(date, 'YYYY-MM-DD') AS date, path, query, clicks, impressions, position FROM gsc_daily WHERE site_id = $1 ORDER BY date, path, query NULLS FIRST`, [siteId])).rows;
    expect(rows).toEqual([
      { date: D1, path: '/ruecken', query: null, clicks: 6, impressions: 200, position: 6 },
      { date: D1, path: '/ruecken', query: 'rückenschmerzen', clicks: 5, impressions: 80, position: 4.5 },
      { date: D2, path: '/', query: null, clicks: 3, impressions: 50, position: 2 },
      { date: D2, path: '/', query: 'physio berlin', clicks: 3, impressions: 40, position: 2 },
      { date: D2, path: '/ruecken', query: 'physio berlin', clicks: 0, impressions: 10, position: 7 },
    ]);

    const s = (await member.get(`/api/sites/${siteId}/gsc`)).json;
    expect(s.connection).toMatchObject({ status: 'active', property: 'sc-domain:praxis.example', googleEmail: 'agency@mail.example', syncedThrough: D2, syncing: false });
    expect(s.connection.accountProperties).toBeUndefined(); // members don't see the account's other properties
    expect((await owner.get(`/api/sites/${siteId}/gsc`)).json.connection.accountProperties).toEqual(['sc-domain:praxis.example', 'https://other.example/']);

    const checks = await computeChecks(t.db, siteId, 'wordpress', { gsc: true });
    expect(checks.find((x) => x.id === 'gsc_connected')).toMatchObject({ status: 'pass', reason: 'connected', detail: { property: 'sc-domain:praxis.example' } });
  });

  it('re-reads only the last days on the next sync', async () => {
    google.calls = [];
    expect(await t.gsc.syncSite(siteId)).toMatchObject({ status: 'synced', rows: 5, through: D2 });
    expect(Math.min(...google.calls.map((x) => Date.parse(x.startDate)))).toBe(Date.parse(daysAgo(5 + REREAD_DAYS)));
    expect((await t.db.query('SELECT count(*)::int AS n FROM gsc_daily WHERE site_id = $1', [siteId])).rows[0].n).toBe(5);
    // Not due again within the day.
    expect(await t.gsc.syncDue()).toEqual([]);
  });

  it('reports search terms per site and page', async () => {
    await t.db.query(fs.readFileSync(new URL('../../ingest/migrations/001_init.sql', import.meta.url), 'utf8'));
    const v = (await t.db.query<{ id: string }>(
      `INSERT INTO visits (site_id, visitor_key, started_at, last_seen_at, landing_path, source_channel, device, test)
       VALUES ($1, 'k', now() - interval '1 day', now() - interval '1 day', '/ruecken', 'google_organic', 'mobile', false) RETURNING id`,
      [siteId],
    )).rows[0].id;
    await t.db.query(
      `INSERT INTO pageviews (pv, site_id, visit_id, seq, path, title, nav, received_at, has_engage) VALUES ('pv1', $1, $2, 1, '/ruecken', 'Rücken', 'load', now() - interval '1 day', false)`,
      [siteId, v],
    );

    const s = await computeStats(t.db, siteId, { weeks: 4, gsc: true });
    expect(s.search).toMatchObject({ status: 'active', property: 'sc-domain:praxis.example', through: D2, clicks: 9, impressions: 250 });
    expect(s.search.terms).toEqual([
      { query: 'rückenschmerzen', clicks: 5, impressions: 80, position: 4.5, path: '/ruecken' },
      { query: 'physio berlin', clicks: 3, impressions: 50, position: 3, path: '/' },
    ]);
    const page = s.pages.find((p) => p.path === '/ruecken')!;
    expect(page.search).toEqual({
      clicks: 6,
      impressions: 200,
      position: 6,
      terms: [
        { query: 'rückenschmerzen', clicks: 5, impressions: 80, position: 4.5 },
        { query: 'physio berlin', clicks: 0, impressions: 10, position: 7 },
      ],
    });
    // Through the API the member sees the same.
    expect((await member.get(`/api/sites/${siteId}/stats?weeks=4`)).json.search.terms).toHaveLength(2);
  });

  it('asks which property when several match, and only accepts a matching one', async () => {
    const site2 = (await owner.post(`/api/orgs/${orgId}/sites`, { name: 'Two', platform: 'php', origins: ['https://two.example', 'https://www.two.example'] })).json.site.id;
    google.properties = [
      { siteUrl: 'https://two.example/', permissionLevel: 'siteOwner' },
      { siteUrl: 'https://www.two.example/', permissionLevel: 'siteOwner' },
      { siteUrl: 'https://other.example/', permissionLevel: 'siteOwner' },
    ];
    const state = await start(owner, site2);
    expect(location(await callback(owner, { state, code: 'good-code' }))).toBe(`/s/${site2}/settings/search-console?gsc=choose`);
    expect(await conn(site2)).toMatchObject({ status: 'needs_property', property: null });
    expect((await owner.get(`/api/sites/${site2}/gsc`)).json.connection).toMatchObject({
      status: 'needs_property',
      candidates: ['https://two.example/', 'https://www.two.example/'],
    });
    const checks = await computeChecks(t.db, site2, 'php', { gsc: true });
    expect(checks.find((x) => x.id === 'gsc_connected')).toMatchObject({ status: 'fail', reason: 'no_property' });

    expect((await owner.put(`/api/sites/${site2}/gsc/property`, { property: 'https://other.example/' })).status).toBe(400);
    expect((await member.put(`/api/sites/${site2}/gsc/property`, { property: 'https://www.two.example/' })).status).toBe(403);
    const r = await owner.put(`/api/sites/${site2}/gsc/property`, { property: 'https://www.two.example/' });
    expect(r.status).toBe(200);
    expect(r.json.connection).toMatchObject({ status: 'active', property: 'https://www.two.example/' });
    await t.gsc.idle();
    expect((await conn(site2)).last_sync_at).toBeTruthy();
  });

  it('marks the connection broken when Google refuses the token', async () => {
    google.refreshError = 'invalid_grant';
    await t.db.query(`UPDATE gsc_connections SET last_sync_at = NULL WHERE site_id = $1`, [siteId]);
    expect(await t.gsc.syncSite(siteId)).toMatchObject({ status: 'failed', error: 'token_revoked' });
    expect(await conn()).toMatchObject({ status: 'error', last_error: 'token_revoked' });
    const checks = await computeChecks(t.db, siteId, 'wordpress', { gsc: true });
    expect(checks.find((x) => x.id === 'gsc_connected')).toMatchObject({ status: 'fail', reason: 'connection_inactive', detail: { error: 'token_revoked' } });
    expect((await owner.post(`/api/sites/${siteId}/gsc/sync`)).status).toBe(409);
    // The data stays until someone reconnects or disconnects.
    expect((await t.db.query('SELECT count(*)::int AS n FROM gsc_daily WHERE site_id = $1', [siteId])).rows[0].n).toBe(5);
    google.refreshError = null;
  });

  it('keeps going through a Google outage', async () => {
    google.refreshError = 'unavailable';
    await t.db.query(`UPDATE gsc_connections SET status = 'active', last_error = NULL WHERE site_id = $1`, [siteId]);
    expect(await t.gsc.syncSite(siteId)).toMatchObject({ status: 'failed', error: 'google_unavailable' });
    expect(await conn()).toMatchObject({ status: 'active', last_error: 'google_unavailable', sync_started_at: null });
    google.refreshError = null;
  });

  it('disconnects: data and token gone, grant revoked unless another site shares the account', async () => {
    // The second site uses the same Google account: disconnecting the first keeps the grant.
    expect((await member.del(`/api/sites/${siteId}/gsc`)).status).toBe(403);
    expect((await owner.del(`/api/sites/${siteId}/gsc`)).json).toEqual({ ok: true });
    expect(await conn()).toBeUndefined();
    expect((await t.db.query('SELECT count(*)::int AS n FROM gsc_daily WHERE site_id = $1', [siteId])).rows[0].n).toBe(0);
    expect(google.revoked).toEqual([]);

    const site2 = (await t.db.query<{ site_id: string }>('SELECT site_id FROM gsc_connections')).rows[0].site_id;
    await owner.del(`/api/sites/${site2}/gsc`);
    expect(google.revoked).toEqual(['rt-secret-1']);
    expect((await owner.get(`/api/sites/${siteId}/gsc`)).json.connection).toBeNull();
  });
});
