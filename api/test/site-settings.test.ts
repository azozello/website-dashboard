import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../src/app.ts';
import { normalisePath } from '../src/paths.ts';
import { Browser, firstUrl, freshApp, lastMail, signUpVerified } from './helpers.ts';

let t: App;
let owner: Browser;
let viewer: Browser;
let outsider: Browser;
const ids = { org: '', wp: '', wix: '' };

const rule = (r: Record<string, unknown>) => ({ counts: true, ...r });
const base = { spa: 'auto', sections: [], bookingPaths: [], requestRules: [] };

beforeAll(async () => {
  t = await freshApp('site_settings');
  owner = await signUpVerified(t, 'owner@physio-s.example');
  viewer = await signUpVerified(t, 'viewer@physio-s.example');
  outsider = await signUpVerified(t, 'outsider@other.example');
  const org = await owner.post('/api/auth/organization/create', { name: 'physio-s', slug: 'physio-s' });
  ids.org = org.json.id;
  ids.wp = (await owner.post(`/api/orgs/${ids.org}/sites`, { name: 'wp', platform: 'wordpress', origins: ['https://wp.example'] })).json.site.id;
  ids.wix = (await owner.post(`/api/orgs/${ids.org}/sites`, { name: 'wix', platform: 'wix', origins: ['https://wix.example'] })).json.site.id;
  await owner.post('/api/auth/organization/invite-member', { email: 'viewer@physio-s.example', role: 'member', organizationId: ids.org });
  const link = firstUrl(lastMail(t, 'viewer@physio-s.example', /Join physio-s/).text);
  const invitationId = link.pathname.split('/').pop();
  expect((await viewer.post('/api/auth/organization/accept-invitation', { invitationId })).status).toBe(200);
});
afterAll(async () => {
  await t.app.close();
});

describe('path rule', () => {
  it('passes the shared §1 vectors', () => {
    const { cases } = JSON.parse(fs.readFileSync(new URL('../../contract/v1/path-normalisation.json', import.meta.url), 'utf8')) as { cases: [string, string][] };
    for (const [input, expected] of cases) expect(normalisePath(input), input).toBe(expected);
  });
});

describe('site config', () => {
  it('starts empty at version 0', async () => {
    const r = await owner.get(`/api/sites/${ids.wp}/config`);
    expect(r.status).toBe(200);
    expect(r.json.config).toMatchObject({ version: 0, spa: 'auto', sections: [], bookingPaths: [], requestRules: [] });
    expect(r.json.detectedForms).toEqual([]);
  });

  it('saves in the shapes ingest reads and bumps the version', async () => {
    const r = await owner.put(`/api/sites/${ids.wp}/config`, {
      version: 0,
      spa: 'off',
      sections: [{ path: 'https://wp.example/Back-Pain/?x=1', selector: '#prices', name: ' prices ' }, { selector: '.faq', name: 'faq' }],
      bookingPaths: ['/booking/', 'https://wp.example/Termin', '/booking'],
      requestRules: [
        rule({ method: 'server', form: 'Contact', source: 'cf7', formId: '12' }),
        rule({ method: 'browser', form: 'Contact', selector: 'form.wpcf7-form', successSelector: '.wpcf7-mail-sent-ok', counts: false }),
        rule({ method: 'thankyou', form: 'Callback', path: '/danke/' }),
        rule({ method: 'browser', form: 'Quiz' }),
      ],
    });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.config.version).toBe(1);

    const { rows } = await t.db.query('SELECT * FROM site_config WHERE site_id = $1', [ids.wp]);
    expect(rows[0]).toMatchObject({
      config_version: 1,
      spa: 'off',
      sections: [{ path: '/Back-Pain', selector: '#prices', name: 'prices' }, { selector: '.faq', name: 'faq' }],
      booking_paths: ['/booking', '/Termin'],
      forms_browser: [{ form: 'Contact', selector: 'form.wpcf7-form', success_selector: '.wpcf7-mail-sent-ok' }],
      request_rules: [
        { method: 'server', form: 'Contact', source: 'cf7', form_id: '12', counts: true },
        { method: 'browser', form: 'Contact', counts: false },
        { method: 'thankyou', form: 'Callback', path: '/danke', counts: true },
        { method: 'browser', form: 'Quiz', counts: true },
      ],
    });

    // Round trip: the editor gets back what it saved.
    const back = (await viewer.get(`/api/sites/${ids.wp}/config`)).json.config;
    expect(back.requestRules[1]).toEqual({ method: 'browser', form: 'Contact', counts: false, selector: 'form.wpcf7-form', successSelector: '.wpcf7-mail-sent-ok' });
    expect(back.requestRules[3]).toEqual({ method: 'browser', form: 'Quiz', counts: true });
  });

  it('rejects a save based on an old version', async () => {
    const r = await owner.put(`/api/sites/${ids.wp}/config`, { ...base, version: 0 });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('version_conflict');
  });

  it.each([
    ['two primaries', [rule({ method: 'server', form: 'A', source: 'cf7', formId: '1' }), rule({ method: 'webhook', form: 'A' })], 'requestRules[0].counts'],
    ['no primary', [rule({ method: 'webhook', form: 'A', counts: false })], 'requestRules[0].counts'],
    ['server without form id', [rule({ method: 'server', form: 'A', source: 'cf7' })], 'requestRules[0].formId'],
    ['thank-you without path', [rule({ method: 'thankyou', form: 'A' })], 'requestRules[0].path'],
    ['one selector only', [rule({ method: 'browser', form: 'A', selector: 'form' })], 'requestRules[0].successSelector'],
    ['duplicate', [rule({ method: 'thankyou', form: 'A', path: '/danke' }), rule({ method: 'thankyou', form: 'B', path: '/danke/' })], 'requestRules[1]'],
  ])('rejects %s', async (_name, requestRules, field) => {
    const r = await owner.put(`/api/sites/${ids.wp}/config`, { ...base, version: 1, requestRules });
    expect(r.status).toBe(400);
    expect(r.json).toMatchObject({ error: 'invalid_config', field });
  });

  it('rejects an empty section name and unknown methods', async () => {
    expect((await owner.put(`/api/sites/${ids.wp}/config`, { ...base, version: 1, sections: [{ selector: '#x', name: ' ' }] })).json.field).toBe('sections[0].name');
    expect((await owner.put(`/api/sites/${ids.wp}/config`, { ...base, version: 1, requestRules: [rule({ method: 'email', form: 'A' })] })).status).toBe(400);
  });

  it('members read, only admins write, outsiders see nothing', async () => {
    expect((await viewer.get(`/api/sites/${ids.wp}/config`)).status).toBe(200);
    expect((await viewer.put(`/api/sites/${ids.wp}/config`, { ...base, version: 1 })).status).toBe(403);
    expect((await outsider.get(`/api/sites/${ids.wp}/config`)).status).toBe(404);
    expect((await outsider.put(`/api/sites/${ids.wp}/config`, { ...base, version: 1 })).status).toBe(404);
  });

  it('shows a CLI-written forms_browser entry as a browser rule', async () => {
    await t.db.query(`UPDATE site_config SET request_rules = '[]', forms_browser = $2 WHERE site_id = $1`, [
      ids.wix,
      JSON.stringify([{ form: 'contact', selector: 'form', success_selector: '.ok' }]),
    ]);
    const r = await owner.get(`/api/sites/${ids.wix}/config`);
    expect(r.json.config.requestRules).toEqual([{ method: 'browser', form: 'contact', counts: true, selector: 'form', successSelector: '.ok' }]);
  });
});

describe('setup checklist', () => {
  type Check = { id: string; status: string; reason: string; detail?: unknown };
  const byId = (checks: Check[]): Record<string, Check> => Object.fromEntries(checks.map((c) => [c.id, c]));

  it('is pending everywhere before ingest has tables', async () => {
    const r = await owner.get(`/api/sites/${ids.wp}/checks`);
    expect(r.status).toBe(200);
    expect(r.json.checks.map((c: { id: string }) => c.id)).toEqual([
      'script_live',
      'pages_tagged',
      'test_event',
      'plugin_ok',
      'delay_js_ok',
      'form_request',
      'buttons_found',
      'csp_ok',
      'gsc_connected',
    ]);
    expect(r.json.checks.every((c: { status: string }) => c.status === 'pending')).toBe(true);
    expect(r.json.install).toMatchObject({ allowedOrigins: ['https://wp.example'] });
    expect(r.json.install.scriptTag).toContain(`data-site="${r.json.install.siteKey}"`);
  });

  it('computes §12 from the tracking tables and stores the results', async () => {
    // The tracking tables, exactly as ingest creates them.
    await t.db.query(fs.readFileSync(new URL('../../ingest/migrations/001_init.sql', import.meta.url), 'utf8'));
    const visit = async (siteId: string, test: boolean, ago: string) => {
      const v = await t.db.query(
        `INSERT INTO visits (site_id, visitor_key, started_at, last_seen_at, source_channel, device, test)
         VALUES ($1, md5(random()::text), now() - $3::interval, now() - $3::interval, 'direct', 'desktop', $2) RETURNING id`,
        [siteId, test, ago],
      );
      await t.db.query(
        `INSERT INTO pageviews (pv, site_id, visit_id, seq, path, nav, received_at) VALUES (substr(md5(random()::text), 1, 16), $1, $2, 1, '/', 'load', now() - $3::interval)`,
        [siteId, v.rows[0].id, ago],
      );
      return v.rows[0].id as string;
    };
    const v1 = await visit(ids.wp, false, '2 hours');
    await visit(ids.wp, true, '2 hours'); // test event, but older than 1 h
    await t.db.query(
      `INSERT INTO requests (site_id, visit_id, channel, confirmation, source, form_id, counts, spam, received_at)
       VALUES ($1, $2, 'form', 'server', 'cf7', '12', true, false, now() - interval '3 days'),
              ($1, NULL, 'form', 'server', 'cf7', '12', true, true, now())`,
      [ids.wp, v1],
    );
    await t.db.query(`INSERT INTO plugin_status (site_id, platform, plugin_version, env, last_hello_at) VALUES ($1, 'wordpress', '0.1.0', $2, now() - interval '1 hour')`, [
      ids.wp,
      JSON.stringify({ head_hook_ok: true, plugin_version: '0.1.0', forms: [{ source: 'cf7', id: '12', title: 'Contact' }], cache: [{ plugin: 'wp-rocket', delay_js: true, r1_excluded: false }] }),
    ]);

    const c = byId((await viewer.get(`/api/sites/${ids.wp}/checks`)).json.checks);
    expect(c.script_live).toMatchObject({ status: 'pass', reason: 'pageview_24h' });
    expect(c.test_event).toMatchObject({ status: 'fail', reason: 'no_test_event_1h' });
    expect(c.form_request).toMatchObject({ status: 'pass', reason: 'request_7d' });
    expect(c.plugin_ok).toMatchObject({ status: 'pass', reason: 'hello_ok' });
    expect(c.delay_js_ok).toMatchObject({ status: 'fail', reason: 'delay_js_not_excluded', detail: { plugins: ['wp-rocket'] } });
    expect(c.pages_tagged.status).toBe('pending');
    expect(c.csp_ok.status).toBe('pending');
    expect(c.buttons_found).toMatchObject({ status: 'pending', reason: 'no_contact_click' });
    expect(c.gsc_connected).toMatchObject({ status: 'pending', reason: 'gsc_not_available' });

    const stored = await t.db.query('SELECT check_id, status FROM site_checks WHERE site_id = $1 ORDER BY check_id', [ids.wp]);
    expect(stored.rows).toContainEqual({ check_id: 'delay_js_ok', status: 'fail' });
    expect(stored.rowCount).toBe(9);

    // The plugin's forms are offered in the request-rule editor.
    expect((await owner.get(`/api/sites/${ids.wp}/config`)).json.detectedForms).toEqual([{ source: 'cf7', id: '12', title: 'Contact' }]);

    // A fresh test event and a broken head hook.
    await visit(ids.wp, true, '1 minute');
    await t.db.query(`UPDATE plugin_status SET env = env || '{"head_hook_ok": false, "head_hook_error": "tag_missing"}' WHERE site_id = $1`, [ids.wp]);
    const c2 = byId((await owner.get(`/api/sites/${ids.wp}/checks`)).json.checks);
    expect(c2.test_event.status).toBe('pass');
    expect(c2.plugin_ok).toMatchObject({ status: 'fail', reason: 'head_hook_failed', detail: { error: 'tag_missing' } });
  });

  it('checks Wix sites for the webhook, not the plugin', async () => {
    const before = byId((await owner.get(`/api/sites/${ids.wix}/checks`)).json.checks);
    expect(before.plugin_ok).toBeUndefined();
    expect(before.wix_webhook).toMatchObject({ status: 'fail', reason: 'no_webhook_request' });
    expect(before.script_live).toMatchObject({ status: 'fail', reason: 'no_pageview_ever' });
    await t.db.query(`INSERT INTO requests (site_id, channel, confirmation, form_id, counts, received_at) VALUES ($1, 'form', 'webhook', 'contact', false, now())`, [ids.wix]);
    const after = byId((await owner.get(`/api/sites/${ids.wix}/checks`)).json.checks);
    expect(after.wix_webhook.status).toBe('pass');
    expect(after.form_request.status).toBe('fail'); // the webhook is the shadow here: it doesn't count
  });

  it('outsiders get 404', async () => {
    expect((await outsider.get(`/api/sites/${ids.wp}/checks`)).status).toBe(404);
  });
});
