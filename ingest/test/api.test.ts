import { describe, expect, it } from 'vitest';
import { ORIGIN, setup, UA_IPHONE } from './helpers.js';

describe('health, r1.js, config', () => {
  it('GET /healthz', async () => {
    const t = await setup();
    const r = await t.app.inject('/healthz');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true, version: '0.1.0' });
  });

  it('serves r1.js with 1 h cache and versioned copies as immutable', async () => {
    const t = await setup();
    const r = await t.app.inject('/v1/r1.js');
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toMatch(/javascript/);
    expect(r.headers['cache-control']).toBe('public, max-age=3600');
    const v = await t.app.inject('/v1/r1.0.1.0.js');
    expect(v.statusCode).toBe(200);
    expect(v.headers['cache-control']).toContain('immutable');
    expect((await t.app.inject('/v1/r2.js')).statusCode).toBe(404);
    expect(r.headers['set-cookie']).toBeUndefined();
  });

  it('GET /v1/config/{key}: public, CORS *, max-age 300; 404 for unknown keys', async () => {
    const t = await setup();
    await t.setConfig({ booking_paths: ['/termin'], forms_browser: [{ form: 'contact', selector: 'form', success_selector: '.ok' }], request_rules: [{ method: 'thankyou', path: '/danke', form: 'contact' }] });
    const r = await t.app.inject('/v1/config/' + t.site.site_key);
    expect(r.statusCode).toBe(200);
    expect(r.headers['access-control-allow-origin']).toBe('*');
    expect(r.headers['cache-control']).toBe('max-age=300');
    expect(r.json()).toEqual({
      v: 1,
      config_version: 1,
      spa: 'auto',
      sections: [],
      booking_paths: ['/termin'],
      forms_browser: [{ form: 'contact', selector: 'form', success_selector: '.ok' }],
    }); // request_rules stay private (§5)
    const u = await t.app.inject('/v1/config/pk_000000000000000000000000');
    expect(u.statusCode).toBe(404);
    expect(u.headers['access-control-allow-origin']).toBe('*');
  });
});

describe('POST /v1/e (§4)', () => {
  it('stores a page view, opens a visit with source and device, answers 204 with CORS for the origin', async () => {
    const t = await setup();
    const pv = t.pv();
    const r = await t.send([t.ev.pageview(pv, '/back-pain', { ref: 'www.google.de', utm: { campaign: 'herbst' } })]);
    expect(r.statusCode).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBe(ORIGIN);
    const [v] = await t.rows('SELECT * FROM visits');
    expect(v).toMatchObject({ landing_path: '/back-pain', source_channel: 'google_organic', source_detail: 'www.google.de', utm_campaign: 'herbst', device: 'desktop', test: false });
    expect(v.visitor_key).toMatch(/^[0-9a-f]{32}$/);
    const [p] = await t.rows('SELECT * FROM pageviews');
    expect(p).toMatchObject({ pv, seq: 1, path: '/back-pain', nav: 'load', load_ms: 900, has_engage: false, visit_id: v.id });
  });

  it('origin check: 403 for other origins and unknown keys; Referer host fallback when Origin is missing', async () => {
    const t = await setup();
    expect((await t.send([t.ev.pageview(t.pv(), '/')], { headers: { origin: 'https://evil.example' } })).statusCode).toBe(403);
    expect((await t.send([t.ev.pageview(t.pv(), '/')], { key: 'pk_000000000000000000000000' })).statusCode).toBe(403);
    expect((await t.send([t.ev.pageview(t.pv(), '/')], { headers: { origin: '', referer: 'https://praxis.example/x?y=1' } })).statusCode).toBe(204);
    expect((await t.send([t.ev.pageview(t.pv(), '/')], { headers: { origin: '', referer: 'https://evil.example/' } })).statusCode).toBe(403);
    expect((await t.send([t.ev.pageview(t.pv(), '/')], { headers: { origin: '' } })).statusCode).toBe(403);
  });

  it('400 names the field; 413 over 16 KB', async () => {
    const t = await setup();
    const r = await t.send([{ ...t.ev.pageview(t.pv(), '/'), pv: 'nope' }]);
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({ ok: false, error: 'invalid', field: 'ev[0].pv' });
    expect((await t.post('/v1/e', '{not json', { origin: ORIGIN })).json().field).toBe('body');
    const big = await t.post('/v1/e', 'x'.repeat(17 * 1024), { origin: ORIGIN });
    expect(big.statusCode).toBe(413);
  });

  it('drops bots and webdriver traffic unless test=true, and flags test visits', async () => {
    const t = await setup();
    t.as('203.0.113.7', 'Googlebot/2.1 (+http://www.google.com/bot.html)');
    expect((await t.send([t.ev.pageview(t.pv(), '/')])).statusCode).toBe(204);
    t.as('203.0.113.7', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140 Safari/537.36');
    expect((await t.send([t.ev.pageview(t.pv(), '/')], { wd: true })).statusCode).toBe(204);
    expect(await t.rows('SELECT * FROM pageviews')).toHaveLength(0);
    await t.send([t.ev.pageview(t.pv(), '/')], { wd: true, test: true });
    await t.send([t.ev.pageview(t.pv(), '/')]);
    const v = await t.rows('SELECT test FROM visits ORDER BY test');
    expect(v.map((x) => x.test)).toEqual([false, true]); // test and real traffic never share a visit
  });

  it('visits: same visitor within 30 min continues (seq), after 30 min or another visitor starts a new one', async () => {
    const t = await setup();
    await t.send([t.ev.pageview(t.pv(), '/a')]);
    t.advance(29 * 60_000);
    await t.send([t.ev.pageview(t.pv(), '/b', { nav: 'spa' })]);
    t.advance(31 * 60_000);
    await t.send([t.ev.pageview(t.pv(), '/c')]);
    t.as('203.0.113.99', UA_IPHONE);
    await t.send([t.ev.pageview(t.pv(), '/d', { vw: 390 })]);
    const v = await t.rows('SELECT v.landing_path, v.device, array_agg(p.path ORDER BY p.seq) AS paths FROM visits v JOIN pageviews p ON p.visit_id = v.id GROUP BY v.id ORDER BY v.started_at, v.landing_path');
    expect(v.map((x) => [x.landing_path, x.device, x.paths])).toEqual([
      ['/a', 'desktop', ['/a', '/b']],
      ['/c', 'desktop', ['/c']],
      ['/d', 'mobile', ['/d']],
    ]);
  });

  it('a new UTC day (salt change) starts a new visit', async () => {
    const t = await setup();
    t.advance(13 * 3600_000 + 55 * 60_000); // 23:55 UTC
    await t.send([t.ev.pageview(t.pv(), '/a')]);
    t.advance(10 * 60_000); // 00:05 UTC next day
    await t.send([t.ev.pageview(t.pv(), '/b')]);
    expect(await t.rows('SELECT * FROM visits')).toHaveLength(2);
    expect(await t.rows('SELECT day FROM salts')).toHaveLength(1); // yesterday's salt deleted
  });

  it('pageview: first one wins; engage merges max active/scroll and the union of sections', async () => {
    const t = await setup();
    const pv = t.pv();
    await t.send([t.ev.pageview(pv, '/a', { title: 'First' })]);
    await t.send([t.ev.pageview(pv, '/a', { title: 'Second' })]);
    await t.send([t.ev.engage(pv, '/a', { active_ms: 5000, scroll: 40, sections: ['headline'] })]);
    await t.send([t.ev.engage(pv, '/a', { active_ms: 3000, scroll: 80, sections: ['headline', 'prices'], final: true })]);
    const p = await t.rows('SELECT * FROM pageviews');
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ title: 'First', active_ms: 5000, scroll: 80, sections: ['headline', 'prices'], has_engage: true });
  });

  it('engage without a page view creates a stub (nav=unknown) that a late pageview fills', async () => {
    const t = await setup();
    const pv = t.pv();
    await t.send([t.ev.engage(pv, '/late', { active_ms: 2000 })]);
    expect((await t.rows('SELECT nav, active_ms FROM pageviews'))[0]).toEqual({ nav: 'unknown', active_ms: 2000 });
    await t.send([t.ev.pageview(pv, '/late')]);
    expect((await t.rows('SELECT nav, active_ms, title FROM pageviews'))[0]).toEqual({ nav: 'load', active_ms: 2000, title: 'T /late' });
  });

  it('clicks dedupe on (pv, eid); steps are unique per (visit, flow_id, step)', async () => {
    const t = await setup();
    const pv = t.pv();
    const click = t.ev.click(pv, '/a', 'whatsapp');
    await t.send([t.ev.pageview(pv, '/a'), click, click, t.ev.click(pv, '/a', 'email')]);
    await t.send([click]); // retry of the same batch
    await t.send([t.ev.step(pv, '/a', 1), t.ev.step(pv, '/a', 1), t.ev.step(pv, '/a', 2, { name: 'Zeit' })]);
    expect((await t.rows('SELECT kind FROM clicks ORDER BY id')).map((r) => r.kind)).toEqual(['whatsapp', 'email']);
    expect((await t.rows('SELECT step, name FROM flow_steps ORDER BY step')).map((r) => [r.step, r.name])).toEqual([
      [1, null],
      [2, 'Zeit'],
    ]);
  });

  it('form_ok creates a browser request only when a request rule covers the form', async () => {
    const t = await setup();
    const pv = t.pv();
    await t.send([t.ev.pageview(pv, '/kontakt'), t.ev.formOk(pv, '/kontakt', 'contact')]);
    expect(await t.rows('SELECT * FROM requests')).toHaveLength(0);
    await t.setConfig({ forms_browser: [{ form: 'contact', selector: 'form', success_selector: '.ok' }] });
    const ok = t.ev.formOk(pv, '/kontakt', 'contact');
    await t.send([ok]);
    await t.send([ok]); // dedupe (pv, eid)
    const r = await t.rows('SELECT * FROM requests');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ confirmation: 'browser', channel: 'form', form_id: 'contact', path: '/kontakt', pv, counts: true, spam: false });
    expect(r[0].visit_id).toBeTruthy();
  });

  it('thank-you rule: one request per visit, credited to the previous page view', async () => {
    const t = await setup();
    await t.setConfig({ request_rules: [{ method: 'thankyou', path: '/danke/', form: 'contact', counts: true }] });
    const [a, b] = [t.pv(), t.pv()];
    await t.send([t.ev.pageview(a, '/kontakt'), t.ev.pageview(b, '/danke')]);
    await t.send([t.ev.pageview(t.pv(), '/danke')]); // reload: same visit, no second request
    const r = await t.rows('SELECT * FROM requests');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ confirmation: 'thankyou', path: '/kontakt', pv: a, form_id: 'contact', counts: true });
  });

  it('never stores the IP address or user agent', async () => {
    const t = await setup();
    const pv = t.pv();
    await t.send([t.ev.pageview(pv, '/a'), t.ev.click(pv, '/a'), t.ev.engage(pv, '/a', { final: true })]);
    await t.serverReq({ pv });
    const dump = JSON.stringify(
      await Promise.all(['sites', 'site_config', 'salts', 'visits', 'pageviews', 'clicks', 'flow_steps', 'requests', 'plugin_status'].map((tb) => t.rows(`SELECT * FROM ${tb}`))),
    );
    expect(dump).not.toContain('203.0.113.7');
    expect(dump).not.toContain('198.51.100.1');
    expect(dump).not.toContain('Chrome/140');
    expect(dump).not.toContain(t.site.site_secret);
  });

  it('rate limits /v1/e at 120 requests per minute per client IP', async () => {
    const t = await setup();
    const codes: number[] = [];
    for (let i = 0; i < 122; i++) codes.push((await t.send([t.ev.click(t.pv(), '/')])).statusCode);
    expect(codes.slice(0, 120).every((c) => c == 204)).toBe(true);
    expect(codes.slice(120)).toEqual([429, 429]);
    t.as('203.0.113.8');
    expect((await t.send([t.ev.click(t.pv(), '/')])).statusCode).toBe(204);
  });
});

describe('POST /v1/r (§6)', () => {
  it('401 without the right secret', async () => {
    const t = await setup();
    expect((await t.serverReq({}, 'sk_' + 'x'.repeat(40))).statusCode).toBe(401);
    expect((await t.post('/v1/r', '{}', { 'content-type': 'application/json' })).statusCode).toBe(401);
  });

  it('202 then 200 for a duplicate rid; links pv → visit; path falls back to the page view', async () => {
    const t = await setup();
    const pv = t.pv();
    await t.send([t.ev.pageview(pv, '/back-pain')]);
    const body = { rid: 'cf7:12:8e1c0f6a', pv, path: null };
    const a = await t.serverReq(body);
    expect(a.statusCode).toBe(202);
    const b = await t.serverReq(body);
    expect(b.statusCode).toBe(200);
    expect(b.json().request_id).toBe(a.json().request_id);
    const r = await t.rows('SELECT * FROM requests');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ confirmation: 'server', source: 'cf7', form_id: '12', path: '/back-pain', pv, spam: false, counts: true, external_id: 'cf7:12:8e1c0f6a' });
    expect(r[0].visit_id).toBeTruthy();
  });

  it('unknown pv → unattributed; a later page view with that pv links it', async () => {
    const t = await setup();
    const pv = t.pv();
    await t.serverReq({ pv, path: '/kontakt' });
    expect((await t.rows('SELECT visit_id FROM requests'))[0].visit_id).toBeNull();
    await t.send([t.ev.pageview(pv, '/kontakt')]);
    expect((await t.rows('SELECT visit_id FROM requests'))[0].visit_id).toBeTruthy();
  });

  it('stores spam verdicts and applies request rules (primary vs shadow)', async () => {
    const t = await setup();
    await t.setConfig({ request_rules: [{ method: 'server', source: 'elementor', form_id: 'a1b2c3', form: 'contact', counts: false }] });
    await t.serverReq({ spam: true, spam_reason: 'honeypot' });
    await t.serverReq({ source: 'elementor', form_id: 'a1b2c3', channel: 'booking' });
    const r = await t.rows('SELECT source, spam, spam_reason, counts, channel FROM requests ORDER BY source');
    expect(r).toEqual([
      { source: 'cf7', spam: true, spam_reason: 'honeypot', counts: true, channel: 'form' },
      { source: 'elementor', spam: false, spam_reason: null, counts: false, channel: 'booking' },
    ]);
  });

  it('400 names the field', async () => {
    const t = await setup();
    const r = await t.serverReq({ channel: 'chat' });
    expect(r.statusCode).toBe(400);
    expect(r.json().field).toBe('channel');
  });
});

describe('POST /v1/w/{token} (§7)', () => {
  it('stores only form and submission_id, dedupes on submission_id, 401 for bad tokens', async () => {
    const t = await setup();
    const url = '/v1/w/' + t.site.webhook_token;
    const body = { form: 'Kontaktformular', submission_id: 'sub-1', email: 'max@example.com', phone: '+49 170 1234567', message: 'Rückenschmerzen' };
    const h = { 'content-type': 'application/json' };
    expect((await t.post(url, body, h)).statusCode).toBe(202);
    expect((await t.post(url, body, h)).statusCode).toBe(202);
    expect((await t.post(url, { form: 'Kontaktformular' }, h)).statusCode).toBe(202);
    expect((await t.post('/v1/w/wh_' + 'x'.repeat(32), body, h)).statusCode).toBe(401);
    const r = await t.rows('SELECT * FROM requests ORDER BY external_id NULLS LAST');
    expect(r.map((x) => [x.confirmation, x.form_id, x.external_id, x.visit_id, x.path])).toEqual([
      ['webhook', 'Kontaktformular', 'sub-1', null, null],
      ['webhook', 'Kontaktformular', null, null, null],
    ]);
    expect(JSON.stringify(r)).not.toMatch(/max@example|1234567|Rückenschmerzen/);
  });
});

describe('POST /v1/plugin/hello (§8)', () => {
  it('stores the body in plugin_status.env and answers with site_id and config_version', async () => {
    const t = await setup();
    const hello = {
      v: 1,
      platform: 'wordpress',
      plugin_version: '0.1.0',
      wp_version: '6.9',
      php_version: '8.3',
      home_url: 'https://wp-test.example',
      theme: 'astra',
      head_hook_ok: true,
      forms: [{ source: 'cf7', id: '12', title: 'Contact' }],
      cache: [{ plugin: 'wp-rocket', delay_js: true, r1_excluded: true }],
      consent: [{ plugin: 'borlabs-cookie', r1_category: 'unknown' }],
    };
    const r = await t.post('/v1/plugin/hello', hello, { authorization: 'Bearer ' + t.site.site_secret, 'content-type': 'application/json' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true, site_id: t.site.site_id, config_version: 0 });
    const [s] = await t.rows('SELECT * FROM plugin_status');
    expect(s).toMatchObject({ platform: 'wordpress', plugin_version: '0.1.0', env: hello });
  });
});

describe('test-only echo (§2)', () => {
  it('shows the client IP seen through the trusted proxy when ENV=test, absent otherwise', async () => {
    const t = await setup();
    const r = await t.app.inject({ url: '/v1/_echo', headers: { 'x-forwarded-for': '203.0.113.77', 'user-agent': 'UA', origin: ORIGIN }, remoteAddress: '10.0.0.2' });
    expect(r.json()).toEqual({ ip_seen: '203.0.113.77', ua_seen: 'UA', origin: ORIGIN });
    const p = await setup({ env: 'prod' });
    expect((await p.app.inject('/v1/_echo')).statusCode).toBe(404);
  });
});
