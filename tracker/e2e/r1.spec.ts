import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end: real Chromium, local test sites (localhost:4021) and the mock
 * collector (127.0.0.1:4020, a different site) which validates every payload
 * against contract/v1/*.schema.json.
 */
const COLLECT = 'http://127.0.0.1:4020';
const SITE = 'http://localhost:4021';
const KEY_PLAIN = 'pk_E2ePlainSite000000000001';
const KEY_SPA = 'pk_E2eWixLikeSpa00000000002';

type Ev = Record<string, any>;
interface Call {
  endpoint: string;
  valid: boolean;
  errors: string[];
  headers: Record<string, string | null>;
  body: { v: number; k: string; wd: boolean; test: boolean; ev: Ev[] };
}

async function api(p: string, body?: unknown) {
  const r = await fetch(COLLECT + p, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) });
  return r.json();
}
const calls = async (): Promise<Call[]> => api('/_calls?endpoint=/v1/e');
const events = async () => (await calls()).flatMap((c) => c.body?.ev ?? []);
const waitFor = async (pred: (e: Ev[]) => boolean, msg: string) => {
  await expect.poll(async () => pred(await events()), { message: msg, timeout: 10_000 }).toBe(true);
  return events();
};

/** Per-test guards: console output, page errors, storage access, foreign hosts. */
async function guard(page: Page) {
  const seen = { console: [] as string[], errors: [] as string[], hosts: new Set<string>() };
  page.on('console', (m) => seen.console.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => seen.errors.push(String(e)));
  page.on('request', (r) => seen.hosts.add(new URL(r.url()).origin));
  await page.addInitScript(() => {
    const log: string[] = ((window as any).__storageAccess = []);
    for (const m of ['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const) {
      const o = Storage.prototype[m] as (...a: unknown[]) => unknown;
      (Storage.prototype as any)[m] = function (this: Storage, ...a: unknown[]) {
        log.push('storage.' + m);
        return o.apply(this, a);
      };
    }
    const d = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get() {
        log.push('cookie.get');
        return d.get!.call(document);
      },
      set(v) {
        log.push('cookie.set');
        d.set!.call(document, v);
      },
    });
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...a: Parameters<IDBFactory['open']>) => {
      log.push('indexedDB.open');
      return open(...a);
    };
  });
  return seen;
}

async function expectClean(page: Page, seen: Awaited<ReturnType<typeof guard>>, opts: { debug?: boolean } = {}) {
  if (!page.isClosed() && page.url().startsWith(SITE)) expect(await page.evaluate(() => (window as any).__storageAccess)).toEqual([]);
  expect(seen.errors).toEqual([]);
  // Chrome itself logs failed HTTP statuses ("Failed to load resource"); r1.js logs nothing.
  if (!opts.debug) expect(seen.console.filter((c) => !c.startsWith('error: Failed to load resource'))).toEqual([]);
  expect([...seen.hosts].filter((h) => h != SITE && h != COLLECT && h != 'null')).toEqual([]);
  const all = await calls();
  for (const c of all) {
    expect(c.valid, JSON.stringify(c.errors)).toBe(true);
    expect(c.headers['content-type']).toMatch(/^text\/plain/);
    expect(c.headers.origin).toBe(SITE);
  }
}

test.beforeEach(async () => {
  await api('/_reset', {});
  await api('/_config', {
    key: KEY_PLAIN,
    config: { v: 1, config_version: 1, spa: 'auto', sections: [], booking_paths: ['/booking.html'], forms_browser: [] },
  });
  await api('/_config', {
    key: KEY_SPA,
    config: {
      v: 1,
      config_version: 4,
      spa: 'auto',
      sections: [{ path: '/spa/preise', selector: '#prices', name: 'prices' }],
      booking_paths: [],
      forms_browser: [{ form: 'contact', selector: 'form.wix-form', success_selector: '.form-success' }],
    },
  });
});

test('bundle has no storage or cookie APIs and stays under 5 KB gzipped', async () => {
  const code = fs.readFileSync(path.resolve('dist/r1.js'), 'utf8');
  expect(code).not.toMatch(/localStorage|sessionStorage|indexedDB|\.cookie|console\./);
  const { gzipSync } = await import('node:zlib');
  expect(gzipSync(code).length).toBeLessThan(5 * 1024);
});

test('classic site: pageview, contact clicks, sections, scroll, final engage on navigation, steps', async ({ page }) => {
  const seen = await guard(page);
  await page.goto('/index.html?utm_source=newsletter&utm_campaign=herbst&fbclid=XYZ&email=secret%40x.de');
  let ev = await waitFor((e) => e.some((x) => x.type == 'pageview'), 'pageview arrives');
  const pv1 = ev.find((x) => x.type == 'pageview')!;
  expect(pv1).toMatchObject({
    path: '/index.html',
    nav: 'load',
    ref: null,
    utm: { source: 'newsletter', campaign: 'herbst' },
    clid: ['fbclid'],
    title: 'Rückenschmerzen | Physio Praxis',
    vw: 1280,
  });
  expect(typeof pv1.load_ms).toBe('number');
  expect(JSON.stringify(ev)).not.toContain('secret');

  for (const id of ['#call', '#mail', '#wa', '#cta']) await page.click(id);
  await page.evaluate(() => document.querySelector('#prices')!.scrollIntoView());
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  await page.click('#booking'); // real navigation → pagehide → final engage
  await page.waitForURL('**/booking.html');
  await page.click('#s1');
  await page.click('#s2');
  await page.goto('about:blank');

  ev = await waitFor((e) => e.filter((x) => x.type == 'step').length == 2, 'steps arrive after leaving the page');
  const mine = (pv: string) => ev.filter((x) => x.pv == pv);
  expect(mine(pv1.pv).filter((x) => x.type == 'click').map((c) => [c.kind, c.label])).toEqual([
    ['call', 'Jetzt anrufen'],
    ['email', 'E-Mail'],
    ['whatsapp', 'WhatsApp'],
    ['booking_cta', 'Termin buchen'],
    ['booking_cta', 'Online-Termin'],
  ]);
  const eng1 = mine(pv1.pv).filter((x) => x.type == 'engage');
  expect(eng1.at(-1)).toMatchObject({ final: true, scroll: 100 });
  expect(eng1.at(-1)!.sections).toEqual(expect.arrayContaining(['headline', 'prices', 'contact']));
  expect(eng1.at(-1)!.active_ms).toBeGreaterThan(0);

  const pv2 = ev.find((x) => x.type == 'pageview' && x.path == '/booking.html')!;
  expect(pv2).toMatchObject({ nav: 'load', ref: null, title: 'Termin | Physio Praxis' });
  expect(pv2.pv).not.toBe(pv1.pv);
  expect(mine(pv2.pv).filter((x) => x.type == 'step').map((s) => [s.flow, s.flow_id, s.step, s.name ?? null])).toEqual([
    ['booking', 'online', 1, 'Zeit wählen'],
    ['booking', 'online', 2, null],
  ]);
  expect(mine(pv2.pv).some((x) => x.type == 'engage' && x.final)).toBe(true);
  for (const c of await calls()) expect(c.body).toMatchObject({ v: 1, k: KEY_PLAIN, test: false });
  await expectClean(page, seen);
});

test('hidden fields reach the form handler on a real submit', async ({ page }) => {
  const seen = await guard(page);
  await page.goto('/index.html');
  const [pv] = (await waitFor((e) => e.some((x) => x.type == 'pageview'), 'pageview')).filter((x) => x.type == 'pageview');
  await page.click('#contact button');
  await page.waitForURL('**/thanks.html**');
  const q = new URL(page.url()).searchParams;
  expect(q.get('r1_pv')).toBe(pv.pv);
  expect(q.get('r1_path')).toBe('/index.html');
  await expectClean(page, seen);
});

test('engage on visibilitychange→hidden (final=false), and again after the tab returns', async ({ page }) => {
  const seen = await guard(page);
  await page.goto('/index.html');
  await waitFor((e) => e.some((x) => x.type == 'pageview'), 'pageview');
  const setHidden = (h: boolean) =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
      document.dispatchEvent(new Event('visibilitychange'));
    }, h);
  await setHidden(true);
  let ev = await waitFor((e) => e.some((x) => x.type == 'engage'), 'engage on hide');
  expect(ev.filter((x) => x.type == 'engage')).toEqual([expect.objectContaining({ final: false })]);
  await setHidden(false);
  await page.mouse.move(10, 10);
  await page.waitForTimeout(300);
  await setHidden(true);
  ev = await waitFor((e) => e.filter((x) => x.type == 'engage').length == 2, 'second engage');
  const [a, b] = ev.filter((x) => x.type == 'engage');
  expect(b.active_ms).toBeGreaterThan(a.active_ms);
  await expectClean(page, seen);
});

test('Wix-like single-page site: route changes, title, sections, dynamic form, browser success, back button', async ({ page }) => {
  const seen = await guard(page);
  await page.goto('/spa/');
  await waitFor((e) => e.some((x) => x.type == 'pageview'), 'first pageview');

  await page.click('#nav-preise');
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('#prices')!.scrollIntoView());
  await page.waitForTimeout(400);
  await page.click('#nav-kontakt');
  await page.waitForSelector('form.wix-form');
  let ev = await waitFor((e) => e.some((x) => x.type == 'pageview' && x.path == '/spa/kontakt'), 'kontakt pageview');
  const kontakt = ev.find((x) => x.type == 'pageview' && x.path == '/spa/kontakt')!;
  await page.waitForTimeout(200); // MutationObserver debounce
  expect(await page.inputValue('form.wix-form input[name=r1_pv]')).toBe(kontakt.pv);
  expect(await page.inputValue('form.wix-form input[name=r1_path]')).toBe('/spa/kontakt');

  await page.click('#send');
  ev = await waitFor((e) => e.some((x) => x.type == 'form_ok'), 'form_ok after success message');
  expect(ev.find((x) => x.type == 'form_ok')).toMatchObject({ form: 'contact', pv: kontakt.pv, path: '/spa/kontakt' });

  await page.goBack();
  await page.waitForSelector('#prices');
  await page.waitForTimeout(1300);
  await page.goto('about:blank');
  ev = await waitFor((e) => e.filter((x) => x.type == 'pageview').length == 4 && e.filter((x) => x.type == 'engage' && x.final).length == 4, 'all views closed');

  const views = ev.filter((x) => x.type == 'pageview');
  expect(views.map((v) => [v.nav, v.path, v.title])).toEqual([
    ['load', '/spa', 'Start | Physio Praxis'],
    ['spa', '/spa/preise', 'Preise | Physio Praxis'],
    ['spa', '/spa/kontakt', 'Kontakt | Physio Praxis'],
    ['spa', '/spa/preise', 'Preise | Physio Praxis'],
  ]);
  expect(new Set(views.map((v) => v.pv)).size).toBe(4);
  expect(views.slice(1).every((v) => v.ref === null && v.load_ms === null)).toBe(true);
  const finalOf = (pv: string) => ev.filter((x) => x.type == 'engage' && x.pv == pv && x.final).at(-1)!;
  expect(finalOf(views[0].pv).sections).toEqual([]);
  expect(finalOf(views[1].pv).sections).toEqual(['prices']);
  expect(finalOf(views[2].pv).sections).toEqual([]); // prices from the old route not credited
  expect((await api('/_calls?endpoint=/v1/config')).length).toBe(1); // config once per page load
  await expectClean(page, seen);
});

test('debug mode: test=true, panel with pv, events and HTTP status', async ({ page }) => {
  const seen = await guard(page);
  await page.goto('/index.html?r1_debug=1');
  const panel = page.locator('[data-r1-debug]');
  await expect(panel).toContainText('← 204', { timeout: 10_000 });
  await expect(panel).toContainText('→ {"type":"pageview"');
  const [pv] = (await events()).filter((x) => x.type == 'pageview');
  await expect(panel).toContainText('pv ' + pv.pv);
  expect((await calls())[0].body.test).toBe(true);
  await expectClean(page, seen, { debug: true });
});

test('data-consent="required": only page views until r1.consent(true)', async ({ page }) => {
  const seen = await guard(page);
  await page.goto('/consent.html');
  await waitFor((e) => e.some((x) => x.type == 'pageview'), 'pageview without consent');
  await page.click('#call');
  await page.waitForTimeout(1500);
  expect((await events()).map((x) => x.type)).toEqual(['pageview']);
  await page.click('#accept');
  await page.click('#call');
  const ev = await waitFor((e) => e.some((x) => x.type == 'click'), 'click after consent');
  expect(ev.map((x) => x.type)).toEqual(['pageview', 'click']);
  await expectClean(page, seen);
});

test('config endpoint down: works with defaults, no errors', async ({ page }) => {
  const seen = await guard(page);
  await api('/_fail', { endpoint: '/v1/config', count: 10, status: 500 });
  await page.goto('/index.html');
  await page.click('#call');
  await page.click('#booking'); // no booking_paths without config → plain navigation
  await page.waitForURL('**/booking.html');
  await page.goto('about:blank');
  const ev = await waitFor((e) => e.filter((x) => x.type == 'pageview').length == 2, 'both pageviews');
  expect(ev.filter((x) => x.type == 'click').map((c) => c.kind)).toEqual(['call']);
  await expectClean(page, seen);
});

test('collector down: the page keeps working and nothing is thrown or logged', async ({ page }) => {
  const seen = await guard(page);
  await api('/_fail', { endpoint: '/v1/e', count: 100, status: 503 });
  await page.goto('/index.html');
  await page.click('#call');
  await page.waitForTimeout(1500);
  await page.click('#contact button');
  await page.waitForURL('**/thanks.html**');
  expect((await calls()).every((c) => (c as any).failed_with == 503)).toBe(true);
  expect(seen.errors).toEqual([]);
  expect(seen.console.filter((c) => !c.includes('Failed to load resource'))).toEqual([]);
});
