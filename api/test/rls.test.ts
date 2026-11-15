import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { actor } from '../src/db.ts';
import { Browser, PASSWORD, dbUrl, firstUrl, freshApp, lastMail, signUpVerified, type TestApp } from './helpers.ts';

/**
 * Row-level security (migrations/008_rls.sql), on the app's own pool (app_rw, not a superuser), with the
 * route guards out of the way: what a handler would get if it forgot its WHERE clause or trusted an id.
 * The database has ingest's schema too, as when deployed.
 */

let t: TestApp;
let alice: Browser;
const id = { alice: '', bob: '', carol: '', aliceOrg: '', bobOrg: '', aliceSite: '', bobSite: '' };

async function orgWithSite(b: Browser, slug: string) {
  const org = await b.post('/api/auth/organization/create', { name: slug, slug });
  expect(org.status, JSON.stringify(org.json)).toBe(200);
  const site = await b.post(`/api/orgs/${org.json.id}/sites`, { name: slug, platform: 'php', origins: [`https://${slug}.example`] });
  expect(site.status, JSON.stringify(site.json)).toBe(201);
  const me = await b.get('/api/me');
  return { user: me.json.user.userId as string, org: org.json.id as string, site: site.json.site.id as string };
}

/** One query on the app's tenant pool, acting for `userId` (null: nobody signed in). */
const as = (userId: string | null, text: string, values?: unknown[]) => actor.run({ userId }, () => t.db.query(text, values));

beforeAll(async () => {
  t = await freshApp('rls', { ingest: true });
  alice = await signUpVerified(t, 'alice@a.example');
  const bob = await signUpVerified(t, 'bob@b.example');
  const a = await orgWithSite(alice, 'clinic-a');
  const b = await orgWithSite(bob, 'clinic-b');
  Object.assign(id, { alice: a.user, bob: b.user, aliceOrg: a.org, bobOrg: b.org, aliceSite: a.site, bobSite: b.site });

  // carol: plain member of clinic-a
  const inv = await alice.post('/api/auth/organization/invite-member', { email: 'carol@a.example', role: 'member', organizationId: id.aliceOrg });
  expect(inv.status).toBe(200);
  const carol = await signUpVerified(t, 'carol@a.example');
  const invitationId = firstUrl(lastMail(t, 'carol@a.example', /Join clinic-a/).text).pathname.split('/').pop();
  expect((await carol.post('/api/auth/organization/accept-invitation', { invitationId })).status).toBe(200);
  id.carol = (await carol.get('/api/me')).json.user.userId;

  // A visit with one pageview on each site, written as ingest would.
  for (const site of [id.aliceSite, id.bobSite]) {
    const v = await t.sql.query<{ id: string }>(
      `INSERT INTO visits (site_id, visitor_key, started_at, last_seen_at, source_channel, device)
       VALUES ($1, 'k', now(), now(), 'direct', 'desktop') RETURNING id`,
      [site],
    );
    await t.sql.query(`INSERT INTO pageviews (pv, site_id, visit_id, seq, path, nav, received_at) VALUES ('pv1', $1, $2, 0, '/', 'load', now())`, [
      site,
      v.rows[0].id,
    ]);
  }
});
afterAll(async () => {
  await t.app.close();
});

describe('reads', () => {
  it('without a signed-in user, the app sees no tenant rows at all', async () => {
    expect((await t.sql.query('SELECT 1 FROM sites')).rowCount).toBe(2);
    for (const table of ['sites', 'site_config', 'visits', 'pageviews']) {
      expect((await as(null, `SELECT 1 FROM ${table}`)).rowCount, table).toBe(0);
    }
    expect((await t.db.query('SELECT 1 FROM sites')).rowCount).toBe(0); // outside any request
  });

  it('an unfiltered query returns only the user’s own organisations', async () => {
    expect((await as(id.alice, 'SELECT id FROM sites')).rows).toEqual([{ id: id.aliceSite }]);
    expect((await as(id.bob, 'SELECT id FROM sites')).rows).toEqual([{ id: id.bobSite }]);
    expect((await as(id.carol, 'SELECT site_id FROM site_config')).rows).toEqual([{ site_id: id.aliceSite }]);
    expect((await as(id.alice, 'SELECT site_id FROM pageviews')).rows).toEqual([{ site_id: id.aliceSite }]);
    expect((await as(id.bob, 'SELECT site_id FROM visits')).rows).toEqual([{ site_id: id.bobSite }]);
  });

  it('asking for another tenant’s id by name finds nothing', async () => {
    expect((await as(id.alice, 'SELECT 1 FROM sites WHERE id = $1', [id.bobSite])).rowCount).toBe(0);
    expect((await as(id.alice, 'SELECT 1 FROM pageviews WHERE site_id = $1', [id.bobSite])).rowCount).toBe(0);
  });
});

describe('writes', () => {
  it("another tenant's rows can't be changed or deleted", async () => {
    expect((await as(id.alice, `UPDATE sites SET name = 'pwned' WHERE id = $1`, [id.bobSite])).rowCount).toBe(0);
    expect((await as(id.alice, `UPDATE site_config SET spa = 'off' WHERE site_id = $1`, [id.bobSite])).rowCount).toBe(0);
    expect((await as(id.alice, 'DELETE FROM sites WHERE id = $1', [id.bobSite])).rowCount).toBe(0);
    expect((await t.sql.query('SELECT name FROM sites WHERE id = $1', [id.bobSite])).rows[0].name).toBe('clinic-b');
  });

  it("a site can't be added to, or moved into, another tenant's organisation", async () => {
    await expect(
      as(id.alice, `INSERT INTO sites (name, platform, site_key, site_secret_hash, org_id) VALUES ('x', 'php', 'pk_x', 'h_x', $1)`, [id.bobOrg]),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(as(id.alice, 'UPDATE sites SET org_id = $2 WHERE id = $1', [id.aliceSite, id.bobOrg])).rejects.toMatchObject({ code: '42501' });
  });

  it('roles: a member reads only, an admin changes, only an owner deletes', async () => {
    expect((await as(id.carol, `UPDATE sites SET name = 'renamed' WHERE id = $1`, [id.aliceSite])).rowCount).toBe(0);
    expect((await as(id.carol, 'DELETE FROM sites WHERE id = $1', [id.aliceSite])).rowCount).toBe(0);

    await t.sql.query(`UPDATE member SET role = 'admin' WHERE "userId" = $1`, [id.carol]);
    expect((await as(id.carol, `UPDATE sites SET name = 'Clinic A' WHERE id = $1`, [id.aliceSite])).rowCount).toBe(1);
    expect((await as(id.carol, 'DELETE FROM sites WHERE id = $1', [id.aliceSite])).rowCount).toBe(0);
    await t.sql.query(`UPDATE member SET role = 'member' WHERE "userId" = $1`, [id.carol]);
  });

  it('the app has no write access to tracking data', async () => {
    await expect(as(id.alice, 'DELETE FROM pageviews WHERE site_id = $1', [id.aliceSite])).rejects.toMatchObject({ code: '42501' });
  });
});

describe('ingest', () => {
  it('is not limited by tenant, even when it does not own the tables', async () => {
    const ingest = new pg.Client({ connectionString: dbUrl('rate1_api_test_rls', 'ingest_rw') });
    await ingest.connect();
    try {
      expect((await ingest.query('SELECT 1 FROM sites')).rowCount).toBe(2);
      const { rows } = await ingest.query<{ id: string }>('SELECT id FROM visits WHERE site_id = $1', [id.bobSite]);
      await ingest.query(`INSERT INTO pageviews (pv, site_id, visit_id, seq, path, nav, received_at) VALUES ('pv2', $1, $2, 1, '/b', 'spa', now())`, [
        id.bobSite,
        rows[0].id,
      ]);
      expect((await as(id.bob, 'SELECT pv FROM pageviews ORDER BY seq')).rows.map((r) => r.pv)).toEqual(['pv1', 'pv2']);
    } finally {
      await ingest.end();
    }
  });
});

describe('through the API', () => {
  it('the guards and the policies agree: requests work as app_rw', async () => {
    const carol = new Browser(t);
    expect((await carol.post('/api/auth/sign-in/email', { email: 'carol@a.example', password: PASSWORD })).status).toBe(200);
    const me = await carol.get('/api/me');
    expect(me.json.sites.map((s: { id: string }) => s.id)).toEqual([id.aliceSite]);
    expect((await carol.get(`/api/sites/${id.aliceSite}`)).status).toBe(200);
    expect((await carol.get(`/api/sites/${id.bobSite}`)).status).toBe(404);
  });

  it('deleting a site removes its tracking data too', async () => {
    expect((await alice.delete(`/api/sites/${id.aliceSite}`)).status).toBe(200);
    for (const table of ['site_config', 'visits', 'pageviews']) {
      expect((await t.sql.query(`SELECT 1 FROM ${table} WHERE site_id = $1`, [id.aliceSite])).rowCount, table).toBe(0);
    }
    expect((await t.sql.query('SELECT 1 FROM pageviews WHERE site_id = $1', [id.bobSite])).rowCount).toBe(2);
  });
});
