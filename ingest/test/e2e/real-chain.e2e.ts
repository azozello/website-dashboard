/**
 * Real chain: Chromium → test site (localhost:4031) → r1.js served by ingest →
 * ingest over HTTP (127.0.0.1:4030) → Postgres 16. Plus the server-side
 * requests a WordPress plugin, the PHP helper and Wix would send.
 *
 *   docker compose -f docker-compose.test.yml up -d && npm run build:tracker && npm run test:e2e
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadSettings } from '../../src/config.js';
import { migrate, pgDb, type Db } from '../../src/db.js';
import { sha256hex } from '../../src/util.js';

const DATABASE_URL = process.env.E2E_DATABASE_URL || 'postgres://rate1:rate1@127.0.0.1:5433/rate1';
const INGEST = 'http://127.0.0.1:4030';
const SITE = 'http://localhost:4031';
const KEY_PLAIN = 'pk_E2ePlainSite000000000001';
const KEY_SPA = 'pk_E2eWixLikeSpa00000000002';
const SECRET = 'sk_' + 'E2eSecret0'.repeat(4);
const TOKEN = 'wh_' + 'E2eWebhookToken0'.repeat(2);
// A normal desktop Chrome: headless markers would be (correctly) dropped as bots.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

let db: Db;
let raw: pg.Pool;
let app: ReturnType<typeof buildApp>;
let site: ChildProcess;
let browser: Browser;

const rows = async (sql: string, p: unknown[] = []) => (await raw.query(sql, p)).rows;
const until = async (sql: string, p: unknown[], ok: (r: any[]) => boolean, ms = 10_000) => {
  const t0 = Date.now();
  for (;;) {
    const r = await rows(sql, p);
    if (ok(r)) return r;
    if (Date.now() - t0 > ms) throw new Error('timeout waiting for: ' + sql + '\nlast: ' + JSON.stringify(r));
    await new Promise((res) => setTimeout(res, 200));
  }
};
const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(INGEST + url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'user-agent': 'WordPress/6.9; https://wp.example', ...headers } });

beforeAll(async () => {
  raw = new pg.Pool({ connectionString: DATABASE_URL });
  await raw.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  db = pgDb(DATABASE_URL);
  await migrate(db);
  const ins = async (key: string, platform: string, secret: string, token: string | null) =>
    (
      await raw.query(
        `INSERT INTO sites (name, platform, allowed_origins, site_key, site_secret_hash, webhook_token_hash) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [key, platform, [SITE], key, sha256hex(secret), token ? sha256hex(token) : null],
      )
    ).rows[0].id as string;
  const plain = await ins(KEY_PLAIN, 'wordpress', SECRET, null);
  const spa = await ins(KEY_SPA, 'wix', 'sk_' + 'x'.repeat(40), TOKEN);
  await raw.query(
    `INSERT INTO site_config (site_id, config_version, booking_paths, request_rules) VALUES ($1, 2, '["/booking.html"]', '[{"method":"thankyou","path":"/thanks.html","form":"contact"}]')`,
    [plain],
  );
  await raw.query(
    `INSERT INTO site_config (site_id, config_version, sections, forms_browser, request_rules) VALUES ($1, 1, $2, $3, $4)`,
    [
      spa,
      JSON.stringify([{ path: '/spa/preise', selector: '#prices', name: 'prices' }]),
      JSON.stringify([{ form: 'contact', selector: 'form.wix-form', success_selector: '.form-success' }]),
      JSON.stringify([
        { method: 'browser', form: 'contact', counts: true },
        { method: 'webhook', form: 'Kontakt', counts: false },
      ]),
    ],
  );

  const settings = { ...loadSettings({}), env: 'test' as const, r1JsDir: path.resolve(__dirname, '../../../tracker/dist'), trustedProxyCidrs: [] };
  app = buildApp({ db, settings, logger: false });
  if (process.env.E2E_DEBUG) app.addHook('onSend', async (req, reply, payload) => { if (req.url.startsWith('/v1/e')) console.log('INGEST', reply.statusCode, req.headers['user-agent'], String(req.body).slice(0, 120)); return payload; });
  await app.listen({ port: 4030, host: '127.0.0.1' });

  site = spawn(process.execPath, [path.resolve(__dirname, '../../../tracker/e2e/site-server.mjs')], {
    env: { ...process.env, SITE_PORT: '4031', COLLECT_URL: INGEST },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    if (await fetch(SITE + '/index.html').then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  // UA at browser level: Chromium sends unload-time beacons with the browser UA, not a per-context override.
  browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled', '--user-agent=' + UA] });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  site?.kill();
  await app?.close();
  await db?.close();
  await raw?.end();
});

async function newPage(): Promise<Page> {
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  if (process.env.E2E_DEBUG) page.on('response', (r) => r.url().includes('/v1/') && console.log('RESP', r.status(), r.request().method(), r.url().replace(INGEST, ''), r.request().resourceType()));
  if (process.env.E2E_DEBUG) page.on('requestfailed', (r) => console.log('FAILED', r.url(), r.failure()?.errorText));
  return page;
}

describe('real chain: browser → ingest → Postgres 16', () => {
  it('classic site: visit, clicks, engagement, steps, server request, thank-you page', async () => {
    const page = await newPage();
    expect(await page.evaluate(() => navigator.webdriver)).toBe(false);
    await page.goto(SITE + '/index.html?utm_source=newsletter&utm_campaign=herbst');
    await page.click('#call');
    await page.click('#cta');
    await page.evaluate(() => document.querySelector('#prices')!.scrollIntoView());
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);
    const pv1 = await page.inputValue('#contact input[name=r1_pv]');
    await page.click('#booking');
    await page.waitForURL('**/booking.html');
    await page.click('#s1');
    await page.click('#s2');

    // What the WordPress plugin sends after Contact Form 7 accepted the form on page 1.
    const rid = 'cf7:12:' + crypto.randomUUID();
    const r = await post('/v1/r', { v: 1, rid, ts: Date.now(), pv: pv1, path: '/index.html', channel: 'form', source: 'cf7', form_id: '12', spam: false, spam_reason: null }, { authorization: 'Bearer ' + SECRET });
    expect(r.status).toBe(202);
    expect((await post('/v1/r', { v: 1, rid, ts: Date.now(), pv: pv1, path: '/index.html', channel: 'form', source: 'cf7', form_id: '12', spam: false, spam_reason: null }, { authorization: 'Bearer ' + SECRET })).status).toBe(200);

    await page.goto(SITE + '/thanks.html'); // thank-you rule
    await page.goto('about:blank');

    const visits = await until(`SELECT * FROM visits WHERE NOT test`, [], (r) => r.length == 1 && r[0].pv_count == 3);
    expect(visits[0]).toMatchObject({ landing_path: '/index.html', source_channel: 'campaign', source_detail: 'newsletter', utm_campaign: 'herbst', device: 'desktop' });
    const pvs = await until(`SELECT * FROM pageviews ORDER BY seq`, [], (r) => r.length == 3 && r.filter((x) => x.has_engage).length == 3);
    expect(pvs.map((p) => [p.seq, p.path, p.nav])).toEqual([
      [1, '/index.html', 'load'],
      [2, '/booking.html', 'load'],
      [3, '/thanks.html', 'load'],
    ]);
    expect(pvs[0].pv).toBe(pv1);
    expect(pvs[0].scroll).toBe(100);
    expect(pvs[0].sections).toEqual(expect.arrayContaining(['headline', 'prices', 'contact']));
    expect(pvs[0].load_ms).toBeGreaterThanOrEqual(0);
    expect((await rows(`SELECT kind, label FROM clicks ORDER BY id`)).map((c) => [c.kind, c.label])).toEqual([
      ['call', 'Jetzt anrufen'],
      ['booking_cta', 'Termin buchen'],
      ['booking_cta', 'Online-Termin'],
    ]);
    expect((await rows(`SELECT step FROM flow_steps ORDER BY step`)).map((s) => s.step)).toEqual([1, 2]);
    const reqs = await until(`SELECT * FROM requests ORDER BY confirmation`, [], (r) => r.length == 2);
    expect(reqs.map((q) => [q.confirmation, q.path, q.visit_id == visits[0].id, q.counts])).toEqual([
      ['server', '/index.html', true, true],
      ['thankyou', '/booking.html', true, true], // credited to the previous page view
    ]);
  });

  it('Wix-like site: in-page routes, sections, browser form success; webhook as shadow', async () => {
    const page = await newPage();
    await page.goto(SITE + '/spa/');
    await page.waitForTimeout(1200); // a visitor reads before clicking; the router sets the title after 80 ms
    await page.click('#nav-preise');
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.querySelector('#prices')!.scrollIntoView());
    await page.waitForTimeout(400);
    await page.click('#nav-kontakt');
    await page.waitForSelector('form.wix-form');
    await page.click('#send');
    await page.waitForSelector('.form-success:not([hidden])');
    await page.waitForTimeout(500);
    await page.goto('about:blank');

    // Wix Automations "Send HTTP request" with only form + submission_id … and a careless extra key.
    const w = await post('/v1/w/' + TOKEN, { form: 'Kontakt', submission_id: 'wix-1', email: 'max@example.com' }, { 'user-agent': 'Wix' });
    expect(w.status).toBe(202);

    const siteId = (await rows(`SELECT id FROM sites WHERE site_key = $1`, [KEY_SPA]))[0].id;
    const pvs = await until(`SELECT * FROM pageviews WHERE site_id = $1 ORDER BY seq`, [siteId], (r) => r.length == 3 && r.every((x) => x.has_engage));
    expect(pvs.map((p) => [p.path, p.nav, p.title])).toEqual([
      ['/spa', 'load', 'Start | Physio Praxis'],
      ['/spa/preise', 'spa', 'Preise | Physio Praxis'],
      ['/spa/kontakt', 'spa', 'Kontakt | Physio Praxis'],
    ]);
    expect(pvs[1].sections).toEqual(['prices']);
    expect(new Set(pvs.map((p) => p.visit_id)).size).toBe(1);
    const reqs = await until(`SELECT * FROM requests WHERE site_id = $1 ORDER BY confirmation`, [siteId], (r) => r.length == 2);
    expect(reqs.map((q) => [q.confirmation, q.form_id, q.path, q.counts, !!q.visit_id])).toEqual([
      ['browser', 'contact', '/spa/kontakt', true, true],
      ['webhook', 'Kontakt', null, false, false],
    ]);
    expect(JSON.stringify(await rows('SELECT * FROM requests'))).not.toContain('max@example.com');
  });

  it('debug mode against the real collector: CORS status shown, visit flagged as test', async () => {
    const page = await browser.newPage({ userAgent: 'Mozilla/5.0 HeadlessChrome/159' }); // a bot UA: kept only because test=true
    await page.goto(SITE + '/index.html?r1_debug=1');
    await page.locator('[data-r1-debug]').getByText('← 204').first().waitFor({ timeout: 10_000 });
    const t = await until(`SELECT * FROM visits WHERE test`, [], (r) => r.length == 1);
    expect(t[0].test).toBe(true);
  });

  it('plugin hello is stored; /v1/config reflects the dashboard-written config', async () => {
    const hello = { v: 1, platform: 'wordpress', plugin_version: '0.1.0', wp_version: '6.9', php_version: '8.3', home_url: SITE, theme: 'astra', head_hook_ok: true, forms: [], cache: [], consent: [] };
    const h = await post('/v1/plugin/hello', hello, { authorization: 'Bearer ' + SECRET });
    expect(h.status).toBe(200);
    expect(((await h.json()) as { config_version: number }).config_version).toBe(2);
    expect((await rows('SELECT env FROM plugin_status'))[0].env).toEqual(hello);
    const c = await fetch(INGEST + '/v1/config/' + KEY_PLAIN);
    expect(c.headers.get('access-control-allow-origin')).toBe('*');
    expect(await c.json()).toEqual({ v: 1, config_version: 2, spa: 'auto', sections: [], booking_paths: ['/booking.html'], forms_browser: [] });
  });
});
