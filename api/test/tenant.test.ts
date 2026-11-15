import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../src/app.ts';
import { topRole } from '../src/tenant.ts';
import { Browser, firstUrl, freshApp, lastMail, signUpVerified } from './helpers.ts';

let t: App;
let alice: Browser;
let bob: Browser;
const ids = { aliceOrg: '', aliceSite: '', bobOrg: '', bobSite: '' };

async function orgWithSite(b: Browser, slug: string, origin: string) {
  const org = await b.post('/api/auth/organization/create', { name: slug, slug });
  expect(org.status, JSON.stringify(org.json)).toBe(200);
  const site = await b.post(`/api/orgs/${org.json.id}/sites`, { name: slug, platform: 'wordpress', origins: [origin] });
  expect(site.status, JSON.stringify(site.json)).toBe(201);
  return { orgId: org.json.id as string, site: site.json };
}

beforeAll(async () => {
  t = await freshApp('tenant');
  alice = await signUpVerified(t, 'alice@physio-a.example');
  bob = await signUpVerified(t, 'bob@physio-b.example');
  const a = await orgWithSite(alice, 'physio-a', 'https://www.physio-a.example/some/page');
  const b = await orgWithSite(bob, 'physio-b', 'https://physio-b.example');
  Object.assign(ids, { aliceOrg: a.orgId, aliceSite: a.site.site.id, bobOrg: b.orgId, bobSite: b.site.site.id });
});
afterAll(async () => {
  await t.app.close();
});

describe('site creation', () => {
  it('stores keys the way ingest checks them', async () => {
    const r = await alice.post(`/api/orgs/${ids.aliceOrg}/sites`, { name: 'second', platform: 'wix', origins: ['https://second.example'] });
    expect(r.status).toBe(201);
    expect(r.json.siteKey).toMatch(/^pk_[0-9A-Za-z]{24}$/);
    expect(r.json.siteSecret).toMatch(/^sk_[0-9A-Za-z]{40}$/);
    expect(r.json.webhookUrl).toMatch(/\/v1\/w\/wh_[0-9A-Za-z]{32}$/);
    const { rows } = await t.db.query('SELECT site_secret_hash, allowed_origins, org_id FROM sites WHERE id = $1', [r.json.site.id]);
    expect(rows[0].site_secret_hash).toBe(crypto.createHash('sha256').update(r.json.siteSecret).digest('hex'));
    expect(rows[0].allowed_origins).toEqual(['https://second.example']);
    expect(rows[0].org_id).toBe(ids.aliceOrg);
    expect((await t.db.query('SELECT 1 FROM site_config WHERE site_id = $1', [r.json.site.id])).rowCount).toBe(1);
  });

  it('normalises origins and rejects non-URLs', async () => {
    const site = await alice.get(`/api/sites/${ids.aliceSite}`);
    expect(site.json.allowedOrigins).toEqual(['https://www.physio-a.example']);
    expect((await alice.post(`/api/orgs/${ids.aliceOrg}/sites`, { name: 'x', platform: 'php', origins: ['not a url'] })).status).toBe(400);
  });
});

describe('isolation between tenants', () => {
  it('owner opens their own site', async () => {
    const r = await alice.get(`/api/sites/${ids.aliceSite}`);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ id: ids.aliceSite, orgId: ids.aliceOrg, role: 'owner' });
    expect(r.json.siteSecretHash).toBeUndefined();
  });

  it("another tenant's site and organisation are 404, read or write", async () => {
    expect((await alice.get(`/api/sites/${ids.bobSite}`)).status).toBe(404);
    expect((await alice.patch(`/api/sites/${ids.bobSite}`, { name: 'pwned' })).status).toBe(404);
    expect((await alice.post(`/api/orgs/${ids.bobOrg}/sites`, { name: 'x', platform: 'php', origins: ['https://x.example'] })).status).toBe(404);
    expect((await bob.get(`/api/sites/${ids.aliceSite}`)).status).toBe(404);
  });

  it('/api/me lists only what the user can open', async () => {
    const me = await bob.get('/api/me');
    expect(me.json.orgs.map((o: { id: string }) => o.id)).toEqual([ids.bobOrg]);
    expect(me.json.sites.map((s: { id: string }) => s.id)).toEqual([ids.bobSite]);
    expect(me.json.sites[0]).toMatchObject({ orgId: ids.bobOrg, role: 'owner' });
  });

  it('no session is 401; unknown or malformed ids are 404', async () => {
    const anon = new Browser(t);
    expect((await anon.get(`/api/sites/${ids.aliceSite}`)).status).toBe(401);
    expect((await anon.get('/api/me')).status).toBe(401);
    expect((await alice.get('/api/sites/not-a-uuid')).status).toBe(404);
    expect((await alice.get(`/api/sites/${crypto.randomUUID()}`)).status).toBe(404);
    expect((await alice.post(`/api/orgs/${encodeURIComponent("x' OR 1=1 --")}/sites`, { name: 'x', platform: 'php', origins: ['https://x.example'] })).status).toBe(404);
  });

  it('a site without an organisation is visible to nobody', async () => {
    const { rows } = await t.db.query(
      `INSERT INTO sites (name, platform, site_key, site_secret_hash) VALUES ('orphan', 'php', 'pk_orphan', 'h_orphan') RETURNING id`,
    );
    expect((await alice.get(`/api/sites/${rows[0].id}`)).status).toBe(404);
  });
});

describe('invitations and roles', () => {
  it('invited member can read but not change; still sees nothing of other tenants', async () => {
    const inv = await alice.post('/api/auth/organization/invite-member', { email: 'carol@physio-a.example', role: 'member', organizationId: ids.aliceOrg });
    expect(inv.status, JSON.stringify(inv.json)).toBe(200);
    const invitationId = firstUrl(lastMail(t, 'carol@physio-a.example', /Join physio-a/).text).pathname.split('/').pop();

    const carol = await signUpVerified(t, 'carol@physio-a.example');
    expect((await carol.get(`/api/sites/${ids.aliceSite}`)).status).toBe(404); // not yet a member
    expect((await carol.post('/api/auth/organization/accept-invitation', { invitationId })).status).toBe(200);

    const site = await carol.get(`/api/sites/${ids.aliceSite}`);
    expect(site.status).toBe(200);
    expect(site.json.role).toBe('member');
    expect((await carol.patch(`/api/sites/${ids.aliceSite}`, { name: 'renamed' })).status).toBe(403);
    expect((await carol.post(`/api/orgs/${ids.aliceOrg}/sites`, { name: 'x', platform: 'php', origins: ['https://x.example'] })).status).toBe(403);
    expect((await carol.get(`/api/sites/${ids.bobSite}`)).status).toBe(404);
  });

  it('admin can change site settings', async () => {
    const inv = await alice.post('/api/auth/organization/invite-member', { email: 'dan@physio-a.example', role: 'admin', organizationId: ids.aliceOrg });
    expect(inv.status).toBe(200);
    const dan = await signUpVerified(t, 'dan@physio-a.example');
    expect((await dan.post('/api/auth/organization/accept-invitation', { invitationId: inv.json.id })).status).toBe(200);
    expect((await dan.patch(`/api/sites/${ids.aliceSite}`, { name: 'Physio A' })).status).toBe(200);
    expect((await alice.get(`/api/sites/${ids.aliceSite}`)).json.name).toBe('Physio A');
  });

  it("an invitation can't be accepted by someone else", async () => {
    const inv = await alice.post('/api/auth/organization/invite-member', { email: 'erin@physio-a.example', role: 'member', organizationId: ids.aliceOrg });
    expect(inv.status).toBe(200);
    expect((await bob.post('/api/auth/organization/accept-invitation', { invitationId: inv.json.id })).status).not.toBe(200);
    expect((await bob.get(`/api/sites/${ids.aliceSite}`)).status).toBe(404);
  });

  it('a member cannot invite', async () => {
    const carol = new Browser(t);
    await carol.post('/api/auth/sign-in/email', { email: 'carol@physio-a.example', password: 'correct-horse-battery' });
    const r = await carol.post('/api/auth/organization/invite-member', { email: 'mallory@evil.example', role: 'owner', organizationId: ids.aliceOrg });
    expect(r.status).not.toBe(200);
  });
});

describe('topRole', () => {
  it('takes the highest known role from a comma-separated field', () => {
    expect(topRole('member, admin')).toBe('admin');
    expect(topRole('owner')).toBe('owner');
    expect(topRole('auditor')).toBeNull();
    expect(topRole('')).toBeNull();
    expect(topRole(undefined)).toBeNull();
  });
});
