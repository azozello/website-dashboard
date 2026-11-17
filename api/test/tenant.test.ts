import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { topRole } from '../src/tenant.ts';
import { Browser, PASSWORD, firstUrl, freshApp, lastMail, signUpVerified, type TestApp } from './helpers.ts';

let t: TestApp;
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
    const { rows } = await t.sql.query('SELECT site_secret_hash, allowed_origins, org_id FROM sites WHERE id = $1', [r.json.site.id]);
    expect(rows[0].site_secret_hash).toBe(crypto.createHash('sha256').update(r.json.siteSecret).digest('hex'));
    expect(rows[0].allowed_origins).toEqual(['https://second.example']);
    expect(rows[0].org_id).toBe(ids.aliceOrg);
    expect((await t.sql.query('SELECT 1 FROM site_config WHERE site_id = $1', [r.json.site.id])).rowCount).toBe(1);
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
    const { rows } = await t.sql.query(
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

async function signIn(email: string) {
  const b = new Browser(t);
  expect((await b.post('/api/auth/sign-in/email', { email, password: PASSWORD })).status).toBe(200);
  return b;
}

/** Member id in physio-a (carol: member, dan: admin, alice: owner, from the tests above). */
async function memberId(email: string): Promise<string> {
  const org = await alice.get(`/api/auth/organization/get-full-organization?organizationId=${ids.aliceOrg}`);
  return org.json.members.find((m: { user: { email: string } }) => m.user.email === email).id;
}

const setRole = (b: Browser, memberId: string, role: string) =>
  b.post('/api/auth/organization/update-member-role', { memberId, role, organizationId: ids.aliceOrg });

describe('changing roles', () => {
  it('owner promotes a member to admin and back; it applies at once', async () => {
    const carol = await signIn('carol@physio-a.example');
    const cid = await memberId('carol@physio-a.example');
    expect((await setRole(alice, cid, 'admin')).status).toBe(200);
    expect((await carol.get('/api/me')).json.orgs[0].role).toBe('admin');
    expect((await carol.patch(`/api/sites/${ids.aliceSite}`, { name: 'Physio A' })).status).toBe(200);
    expect((await setRole(alice, cid, 'member')).status).toBe(200);
    expect((await carol.patch(`/api/sites/${ids.aliceSite}`, { name: 'Physio A' })).status).toBe(403);
  });

  it('a member cannot change roles, not even their own', async () => {
    const carol = await signIn('carol@physio-a.example');
    expect((await setRole(carol, await memberId('carol@physio-a.example'), 'admin')).status).not.toBe(200);
    expect((await setRole(carol, await memberId('dan@physio-a.example'), 'member')).status).not.toBe(200);
  });

  it("an admin changes members and admins, but can't touch an owner or make one", async () => {
    const dan = await signIn('dan@physio-a.example');
    const cid = await memberId('carol@physio-a.example');
    expect((await setRole(dan, await memberId('alice@physio-a.example'), 'member')).status).not.toBe(200);
    expect((await setRole(dan, cid, 'owner')).status).not.toBe(200);
    expect((await setRole(dan, cid, 'admin')).status).toBe(200);
    expect((await setRole(dan, cid, 'member')).status).toBe(200);
  });

  it('the last owner cannot step down; with a second owner they can', async () => {
    const aid = await memberId('alice@physio-a.example');
    const did = await memberId('dan@physio-a.example');
    expect((await setRole(alice, aid, 'admin')).status).not.toBe(200);
    expect((await setRole(alice, did, 'owner')).status).toBe(200);
    expect((await setRole(alice, aid, 'admin')).status).toBe(200);
    // back to alice owner, dan admin
    const dan = await signIn('dan@physio-a.example');
    expect((await setRole(dan, aid, 'owner')).status).toBe(200);
    expect((await setRole(alice, did, 'admin')).status).toBe(200);
  });

  it('unknown roles and other organisations are refused', async () => {
    expect((await setRole(alice, await memberId('carol@physio-a.example'), 'superuser')).status).toBe(400);
    const bobOrg = await bob.get(`/api/auth/organization/get-full-organization?organizationId=${ids.bobOrg}`);
    const bobMember = bobOrg.json.members[0].id;
    expect((await setRole(alice, bobMember, 'member')).status).not.toBe(200);
    expect((await alice.post('/api/auth/organization/update-member-role', { memberId: bobMember, role: 'member', organizationId: ids.bobOrg })).status).not.toBe(200);
  });
});

describe('deleting a website', () => {
  it('only an owner can, and the site is gone everywhere', async () => {
    const r = await alice.post(`/api/orgs/${ids.aliceOrg}/sites`, { name: 'doomed', platform: 'wordpress', origins: ['https://doomed.example'] });
    expect(r.status).toBe(201);
    const url = `/api/sites/${r.json.site.id}`;

    expect((await new Browser(t).delete(url)).status).toBe(401);
    expect((await bob.delete(url)).status).toBe(404);
    expect((await (await signIn('carol@physio-a.example')).delete(url)).status).toBe(403);
    expect((await (await signIn('dan@physio-a.example')).delete(url)).status).toBe(403); // admin

    expect((await alice.delete(url)).status).toBe(200);
    expect((await alice.get(url)).status).toBe(404);
    expect((await alice.delete(url)).status).toBe(404);
    expect((await alice.get('/api/me')).json.sites.map((s: { id: string }) => s.id)).not.toContain(r.json.site.id);
    expect((await t.sql.query('SELECT 1 FROM sites WHERE id = $1', [r.json.site.id])).rowCount).toBe(0);
    expect((await t.sql.query('SELECT 1 FROM site_config WHERE site_id = $1', [r.json.site.id])).rowCount).toBe(0);
    expect((await alice.get(`/api/sites/${ids.aliceSite}`)).status).toBe(200); // the others stay
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
