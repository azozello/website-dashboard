import crypto from 'node:crypto';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { run } from '../src/admin.js';
import { buildApp } from '../src/app.js';
import { loadSettings, type Settings } from '../src/config.js';
import { migrate, type Db, type Q } from '../src/db.js';

/** In-process Postgres (PGlite) behind the same Db interface as pg.Pool. */
export async function testDb(): Promise<Db> {
  const pg = new PGlite();
  const q = (t: { query: PGlite['query']; exec: PGlite['exec'] }): Q => ({
    async query(sql, params) {
      if (params && params.length) return (await t.query(sql, params)) as never;
      const r = await t.exec(sql);
      return (r[r.length - 1] ?? { rows: [] }) as never;
    },
  });
  return {
    ...q(pg),
    tx: (fn) => pg.transaction((tx) => fn(q(tx as never))),
    close: () => pg.close(),
  };
}

export const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
export const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
export const ORIGIN = 'https://www.praxis.example';
export const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const rnd = (n: number) => Array.from(crypto.randomBytes(n), (b) => B62[b % 62]).join('');

export async function setup(over: Partial<Settings> = {}) {
  const db = await testDb();
  await migrate(db);
  const settings: Settings = {
    ...loadSettings({}),
    env: 'test',
    r1JsDir: path.resolve(__dirname, '../../tracker/dist'),
    trustedProxyCidrs: ['10.0.0.0/8', '127.0.0.1/32'],
    clientIpHeader: 'x-forwarded-for',
    collectBaseUrl: 'https://collect.bazed.live',
    ...over,
  };
  const clock = { t: new Date('2026-11-15T10:00:00Z') };
  const app = buildApp({ db, settings, now: () => clock.t, logger: false });
  const site = (await run(['create-site', '--name', 'Praxis', '--platform', 'wix', '--origin', ORIGIN, '--origin', 'https://praxis.example'], db, settings)) as {
    site_id: string;
    site_key: string;
    site_secret: string;
    webhook_token: string;
  };

  let ip = '203.0.113.7';
  let ua = UA_DESKTOP;
  const ev = {
    pageview: (pv: string, path: string, x: Record<string, unknown> = {}) => ({
      type: 'pageview',
      eid: rnd(8),
      pv,
      path,
      ts: clock.t.getTime(),
      nav: 'load',
      ref: null,
      utm: {},
      clid: [],
      title: 'T ' + path,
      vw: 1280,
      load_ms: 900,
      ...x,
    }),
    engage: (pv: string, path: string, x: Record<string, unknown> = {}) => ({
      type: 'engage',
      eid: rnd(8),
      pv,
      path,
      ts: clock.t.getTime(),
      active_ms: 1000,
      scroll: 50,
      sections: [],
      final: false,
      ...x,
    }),
    click: (pv: string, path: string, kind = 'call', x: Record<string, unknown> = {}) => ({ type: 'click', eid: rnd(8), pv, path, ts: clock.t.getTime(), kind, label: 'Call', ...x }),
    step: (pv: string, path: string, step: number, x: Record<string, unknown> = {}) => ({
      type: 'step',
      eid: rnd(8),
      pv,
      path,
      ts: clock.t.getTime(),
      flow: 'booking',
      flow_id: 'online',
      step,
      ...x,
    }),
    formOk: (pv: string, path: string, form: string) => ({ type: 'form_ok', eid: rnd(8), pv, path, ts: clock.t.getTime(), form }),
  };

  const post = (url: string, body: unknown, headers: Record<string, string> = {}, remoteAddress = '10.0.0.2') =>
    app.inject({
      method: 'POST',
      url,
      payload: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'content-type': 'text/plain;charset=UTF-8', 'x-forwarded-for': `198.51.100.1, ${ip}`, 'user-agent': ua, ...headers },
      remoteAddress,
    });
  const send = (events: unknown[], x: { test?: boolean; wd?: boolean; headers?: Record<string, string>; key?: string } = {}) =>
    post('/v1/e', { v: 1, k: x.key ?? site.site_key, wd: x.wd ?? false, test: x.test ?? false, ev: events }, { origin: ORIGIN, ...x.headers });
  const serverReq = (body: Record<string, unknown>, secret = site.site_secret) =>
    post(
      '/v1/r',
      { v: 1, rid: 'cf7:12:' + rnd(10), ts: clock.t.getTime(), pv: null, path: null, channel: 'form', source: 'cf7', form_id: '12', spam: false, spam_reason: null, ...body },
      { authorization: 'Bearer ' + secret, 'content-type': 'application/json' },
    );
  const rows = async <T = Record<string, any>>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;
  const setConfig = async (c: Record<string, unknown>) => {
    await db.query(
      `UPDATE site_config SET config_version = config_version + 1, sections = $2, booking_paths = $3, forms_browser = $4, request_rules = $5 WHERE site_id = $1`,
      [site.site_id, JSON.stringify(c.sections ?? []), JSON.stringify(c.booking_paths ?? []), JSON.stringify(c.forms_browser ?? []), JSON.stringify(c.request_rules ?? [])],
    );
    app.store.clear();
  };

  return {
    db,
    app,
    site,
    settings,
    ev,
    send,
    post,
    serverReq,
    rows,
    setConfig,
    pv: () => rnd(16),
    advance: (ms: number) => (clock.t = new Date(clock.t.getTime() + ms)),
    as: (newIp: string, newUa = ua) => {
      ip = newIp;
      ua = newUa;
    },
  };
}
