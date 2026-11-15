import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../src/app.ts';
import { Browser, freshApp, signUpVerified } from './helpers.ts';

let t: App;
let alice: Browser;
let bob: Browser;
let aliceOrg = '';
let bobOrg = '';
let wpSite = '';

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const returnFor = (origin: string) => `${origin}/wp-admin/admin-post.php?action=rate1_connector_connected`;
const start = (b: Browser, orgId: string, body: Record<string, unknown>) => b.post(`/api/orgs/${orgId}/connect/wordpress`, body);
const exchange = (code: string) => new Browser(t).post('/api/connect/exchange', { code });
const codeOf = (redirectUrl: string) => new URL(redirectUrl).searchParams.get('code')!;

beforeAll(async () => {
  t = await freshApp('connect');
  alice = await signUpVerified(t, 'alice@agency.example');
  bob = await signUpVerified(t, 'bob@other.example');
  aliceOrg = (await alice.post('/api/auth/organization/create', { name: 'Agency', slug: 'agency' })).json.id;
  bobOrg = (await bob.post('/api/auth/organization/create', { name: 'Other', slug: 'other' })).json.id;
  wpSite = (await alice.post(`/api/orgs/${aliceOrg}/sites`, { name: 'wp.example', platform: 'wordpress', origins: ['https://wp.example'] })).json.site.id;
});
afterAll(async () => {
  await t.app.close();
});

describe('connect a new WordPress site', () => {
  it('creates the site, redirects back with code and state, and the code buys the keys once', async () => {
    const r = await start(alice, aliceOrg, { homeUrl: 'https://new.example/', returnUrl: returnFor('https://new.example'), state: 'st4te-ABC_123' });
    expect(r.status, JSON.stringify(r.json)).toBe(200);

    const back = new URL(r.json.redirectUrl);
    expect(back.origin + back.pathname).toBe('https://new.example/wp-admin/admin-post.php');
    expect(back.searchParams.get('action')).toBe('rate1_connector_connected'); // existing params kept
    expect(back.searchParams.get('state')).toBe('st4te-ABC_123');
    expect(back.searchParams.get('code')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(r.headers['cache-control']).toBe('no-store');

    const site = await alice.get(`/api/sites/${r.json.siteId}`);
    expect(site.json).toMatchObject({ platform: 'wordpress', allowedOrigins: ['https://new.example'], name: 'new.example', orgId: aliceOrg });

    const x = await exchange(back.searchParams.get('code')!);
    expect(x.status).toBe(200);
    expect(x.json.site_key).toBe(site.json.siteKey);
    expect(x.json.site_secret).toMatch(/^sk_[0-9A-Za-z]{40}$/);
    const { rows } = await t.db.query('SELECT site_secret_hash FROM sites WHERE id = $1', [r.json.siteId]);
    expect(rows[0].site_secret_hash).toBe(sha(x.json.site_secret));

    expect((await exchange(back.searchParams.get('code')!)).status).toBe(400); // single use
  });
});

describe('connect an existing site', () => {
  it('rotates its secret and keeps its key', async () => {
    const before = (await t.db.query('SELECT site_key, site_secret_hash FROM sites WHERE id = $1', [wpSite])).rows[0];
    const r = await start(alice, aliceOrg, { homeUrl: 'https://wp.example', returnUrl: returnFor('https://wp.example'), state: 'abcdefgh', siteId: wpSite });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.siteId).toBe(wpSite);
    const x = await exchange(codeOf(r.json.redirectUrl));
    expect(x.json.site_key).toBe(before.site_key);
    const after = (await t.db.query('SELECT site_secret_hash FROM sites WHERE id = $1', [wpSite])).rows[0];
    expect(after.site_secret_hash).not.toBe(before.site_secret_hash);
    expect(after.site_secret_hash).toBe(sha(x.json.site_secret));
  });

  it('refuses a site that does not allow the WordPress origin, or is not WordPress', async () => {
    const other = await start(alice, aliceOrg, { homeUrl: 'https://evil.example', returnUrl: returnFor('https://evil.example'), state: 'abcdefgh', siteId: wpSite });
    expect(other.status).toBe(400);
    expect(other.json.error).toBe('origin_not_allowed');

    const php = (await alice.post(`/api/orgs/${aliceOrg}/sites`, { name: 'php', platform: 'php', origins: ['https://php.example'] })).json.site.id;
    const r = await start(alice, aliceOrg, { homeUrl: 'https://php.example', returnUrl: returnFor('https://php.example'), state: 'abcdefgh', siteId: php });
    expect(r.json.error).toBe('not_wordpress');
  });
});

describe('who may connect, and where the code may go', () => {
  it('return_url must be on the WordPress site', async () => {
    const r = await start(alice, aliceOrg, { homeUrl: 'https://wp.example', returnUrl: 'https://attacker.example/steal', state: 'abcdefgh' });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('return_url_not_on_site');
    expect((await start(alice, aliceOrg, { homeUrl: 'https://wp.example', returnUrl: 'not a url', state: 'abcdefgh' })).status).toBe(400);
    expect((await start(alice, aliceOrg, { homeUrl: 'https://wp.example', returnUrl: returnFor('https://wp.example'), state: 'bad state!' })).status).toBe(400);
  });

  it("anonymous 401, another organisation 404, another organisation's site 404, plain member 403", async () => {
    const body = { homeUrl: 'https://wp.example', returnUrl: returnFor('https://wp.example'), state: 'abcdefgh' };
    expect((await start(new Browser(t), aliceOrg, body)).status).toBe(401);
    expect((await start(bob, aliceOrg, body)).status).toBe(404);
    expect((await start(bob, bobOrg, { ...body, siteId: wpSite })).status).toBe(404);

    const inv = await alice.post('/api/auth/organization/invite-member', { email: 'carol@agency.example', role: 'member', organizationId: aliceOrg });
    const carol = await signUpVerified(t, 'carol@agency.example');
    await carol.post('/api/auth/organization/accept-invitation', { invitationId: inv.json.id });
    expect((await start(carol, aliceOrg, body)).status).toBe(403);
  });

  it('expired and unknown codes are refused', async () => {
    const r = await start(alice, aliceOrg, { homeUrl: 'https://wp.example', returnUrl: returnFor('https://wp.example'), state: 'abcdefgh', siteId: wpSite });
    const code = codeOf(r.json.redirectUrl);
    await t.db.query(`UPDATE connect_codes SET expires_at = now() - interval '1 second' WHERE code_hash = $1`, [sha(code)]);
    expect((await exchange(code)).status).toBe(400);
    expect((await exchange('A'.repeat(43))).status).toBe(400);
    expect((await exchange('short')).status).toBe(400);
  });
});

describe('site details for the setup screen', () => {
  it('include the script tag and, in /api/me, the allowed origins', async () => {
    const site = await alice.get(`/api/sites/${wpSite}`);
    expect(site.json.scriptTag).toMatch(new RegExp(`/v1/r1\\.js" data-site="${site.json.siteKey}"`));
    const me = await alice.get('/api/me');
    expect(me.json.sites.find((s: { id: string }) => s.id === wpSite).origins).toEqual(['https://wp.example']);
  });
});
