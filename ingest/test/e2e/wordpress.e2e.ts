/**
 * WordPress real chain: Chromium → WordPress + Contact Form 7 + rate1-connector
 * (Docker, http://localhost:8088) → r1.js and POST /v1/r → real ingest → Postgres 16.
 *
 * Opt-in (needs the plugin's Docker WordPress, the mock collector on :4010 stopped):
 *   wp-plugin/tests/run.sh --keep        # leaves WordPress up; then stop the mock collector
 *   docker compose -f docker-compose.test.yml up -d
 *   WP_E2E=1 npm run test:e2e
 *
 * The WordPress containers reach the collector at http://host.docker.internal:4010
 * (RATE1_CONNECTOR_COLLECT_URL in wp-plugin/tests/docker-compose.yml), so ingest
 * listens there and the host browser loads r1.js from the same address.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import { chromium, type Browser } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { run } from '../../src/admin.js';
import { buildApp } from '../../src/app.js';
import { loadSettings } from '../../src/config.js';
import { migrate, pgDb, type Db } from '../../src/db.js';

const DATABASE_URL = process.env.E2E_DATABASE_URL || 'postgres://rate1:rate1@127.0.0.1:5433/rate1';
const WP = 'http://localhost:8088';
const COMPOSE = path.resolve(__dirname, '../../../wp-plugin/tests/docker-compose.yml');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const SENSITIVE = ['Max Mustermann', 'max.mustermann@example.com', 'Rückenschmerzen seit drei Wochen'];

const wp = (...args: string[]) =>
  execFileSync('docker', ['compose', '-f', COMPOSE, 'exec', '-T', 'cli', 'wp', ...args], { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } }).trim();

let db: Db;
let raw: pg.Pool;
let app: ReturnType<typeof buildApp>;
let browser: Browser;
let site: { site_id: string; site_key: string; site_secret: string };
let formId: string;

const rows = async (sql: string, p: unknown[] = []) => (await raw.query(sql, p)).rows;
const until = async (sql: string, p: unknown[], ok: (r: any[]) => boolean, ms = 15_000) => {
  const t0 = Date.now();
  for (;;) {
    const r = await rows(sql, p);
    if (ok(r)) return r;
    if (Date.now() - t0 > ms) throw new Error('timeout: ' + sql + '\nlast: ' + JSON.stringify(r));
    await new Promise((res) => setTimeout(res, 250));
  }
};

describe.runIf(process.env.WP_E2E === '1')('WordPress + CF7 + rate1-connector → real ingest', () => {
  beforeAll(async () => {
    raw = new pg.Pool({ connectionString: DATABASE_URL });
    await raw.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    db = pgDb(DATABASE_URL);
    await migrate(db);
    const settings = { ...loadSettings({}), env: 'test' as const, r1JsDir: path.resolve(__dirname, '../../../tracker/dist'), trustedProxyCidrs: [], collectBaseUrl: 'http://host.docker.internal:4010' };
    site = (await run(['create-site', '--name', 'WP e2e', '--platform', 'wordpress', '--origin', WP], db, settings)) as typeof site;
    app = buildApp({ db, settings, logger: false });
    await app.listen({ port: 4010, host: '0.0.0.0' }); // fails if the mock collector still holds :4010

    // Fresh plugin from the built zip (the plugin suite ends with an uninstall test).
    wp('plugin', 'install', '/dist/rate1-connector-0.1.0.zip', '--force', '--activate');
    for (const o of ['rate1_test_strip_tag', 'rate1_test_no_finish', 'rate1_test_no_exclusions'])
      try {
        wp('option', 'delete', o);
      } catch {
        /* not set */
      }
    wp('option', 'update', 'rate1_connector_site_key', site.site_key);
    wp('option', 'update', 'rate1_connector_site_secret', site.site_secret, '--autoload=no');
    wp('rewrite', 'structure', '/%postname%/');
    wp('rewrite', 'flush');
    formId = wp('post', 'list', '--post_type=wpcf7_contact_form', '--field=ID', '--posts_per_page=1', '--orderby=ID', '--order=ASC');
    const existing = wp('post', 'list', '--post_type=page', '--name=kontakt-e2e', '--field=ID');
    if (!existing) wp('post', 'create', '--post_type=page', '--post_status=publish', '--post_title=Kontakt E2E', '--post_name=kontakt-e2e', `--post_content=[contact-form-7 id="${formId}"]`);
    wp('cron', 'event', 'run', 'rate1_connector_hello'); // the daily hello, now

    // The browser runs on the host: reach the collector on loopback (a host firewall may drop host → LAN-IP traffic).
    browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled', '--user-agent=' + UA, '--host-resolver-rules=MAP host.docker.internal 127.0.0.1'] });
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await app?.close();
    await db?.close();
    await raw?.end();
  });

  it('hello reaches ingest with head_hook_ok and the CF7 form', async () => {
    const [s] = await until('SELECT * FROM plugin_status', [], (r) => r.length == 1);
    expect(s.platform).toBe('wordpress');
    expect(s.env.head_hook_ok).toBe(true);
    expect(s.env.home_url).toBe(WP);
    expect(s.env.forms).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'cf7', id: formId })]));
  });

  it('a visitor submits the CF7 form: page view, engagement and one server request linked to the visit, no field values', async () => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await page.goto(WP + '/kontakt-e2e/');
    expect(await page.locator('script[data-site]').getAttribute('data-site')).toBe(site.site_key);
    const [pv] = await until('SELECT * FROM pageviews', [], (r) => r.length == 1);
    expect(pv.path).toBe('/kontakt-e2e');
    expect(await page.inputValue('.wpcf7 form input[name=r1_pv]')).toBe(pv.pv);

    const form = page.locator('.wpcf7 form');
    for (const el of await form.locator('input[type=text], input:not([type])').all()) await el.fill('Max Mustermann');
    for (const el of await form.locator('input[type=email]').all()) await el.fill('max.mustermann@example.com');
    for (const el of await form.locator('textarea').all()) await el.fill('Rückenschmerzen seit drei Wochen');
    await form.locator('input[type=submit], button[type=submit]').first().click();
    await page.locator('.wpcf7 form.sent').waitFor({ timeout: 15_000 });
    await page.goto('about:blank');

    const [req] = await until('SELECT * FROM requests', [], (r) => r.length == 1);
    expect(req).toMatchObject({ confirmation: 'server', source: 'cf7', form_id: formId, pv: pv.pv, path: '/kontakt-e2e', visit_id: pv.visit_id, spam: false, counts: true, channel: 'form' });
    expect(req.external_id).toMatch(new RegExp(`^cf7:${formId}:[0-9a-f-]{36}$`));
    const [v] = await rows('SELECT * FROM visits');
    expect(v).toMatchObject({ landing_path: '/kontakt-e2e', device: 'desktop', test: false });
    await until('SELECT * FROM pageviews WHERE has_engage', [], (r) => r.length == 1);

    const dump = JSON.stringify(await Promise.all(['visits', 'pageviews', 'clicks', 'requests', 'plugin_status'].map((t) => rows(`SELECT * FROM ${t}`))));
    for (const s of SENSITIVE) expect(dump).not.toContain(s);
  });
});
