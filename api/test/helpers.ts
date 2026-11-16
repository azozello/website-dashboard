import crypto from 'node:crypto';
import pg from 'pg';
import { expect } from 'vitest';
import { buildApp, type App } from '../src/app.ts';
import { loadSettings } from '../src/config.ts';
import { createPool, migrate } from '../src/db.ts';
import type { GoogleApi } from '../src/google.ts';

/** Server that owns the throwaway test databases (the dev container from docker-compose.dev.yml). */
const ADMIN_URL = process.env.TEST_DATABASE_URL || 'postgres://rate1:rate1@127.0.0.1:5434/rate1';
export const BASE = 'http://localhost:5173';
export const PASSWORD = 'correct-horse-battery';

/** A migrated, empty database of its own, and the app on top of it. opts.google: a fake Google (Search Console tests). */
export async function freshApp(name: string, opts: { google?: GoogleApi } = {}): Promise<App> {
  const dbName = `rate1_api_test_${name}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();

  const url = ADMIN_URL.replace(/\/[^/]*$/, `/${dbName}`);
  const db = createPool(url);
  await migrate(db);
  await db.end();
  const settings = loadSettings({ DATABASE_URL: url, APP_BASE_URL: BASE, RATE_LIMIT: 'off' } as NodeJS.ProcessEnv);
  return buildApp(settings, { logger: false, google: opts.google });
}

interface Res {
  status: number;
  json: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  headers: Record<string, unknown>;
}

/** A browser: cookie jar + same-origin requests, driven through fastify.inject. */
export class Browser {
  private jar = new Map<string, string>();
  private t: App;
  constructor(t: App) {
    this.t = t;
  }

  get(url: string) {
    return this.send('GET', url);
  }
  post(url: string, body: unknown = {}) {
    return this.send('POST', url, body);
  }
  patch(url: string, body: unknown) {
    return this.send('PATCH', url, body);
  }
  put(url: string, body: unknown) {
    return this.send('PUT', url, body);
  }
  del(url: string) {
    return this.send('DELETE', url);
  }

  async send(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, body?: unknown): Promise<Res> {
    const headers: Record<string, string> = { origin: BASE };
    if (this.jar.size) headers.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await this.t.app.inject({ method, url, headers, payload: body === undefined ? undefined : JSON.stringify(body) });

    const set = res.headers['set-cookie'];
    for (const c of set === undefined ? [] : Array.isArray(set) ? set : [set]) {
      const [pair, ...attrs] = c.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      const expired = attrs.some((a) => /^\s*max-age=0\s*$/i.test(a)) || value === '';
      if (expired) this.jar.delete(name);
      else this.jar.set(name, value);
    }
    let json: unknown = null;
    try {
      json = JSON.parse(res.body);
    } catch {
      /* not JSON */
    }
    return { status: res.statusCode, json, headers: res.headers };
  }
}

/** Newest message to `to` whose subject matches. */
export function lastMail(t: App, to: string, subject: RegExp) {
  const m = t.mailer.outbox.findLast((x) => x.to === to && subject.test(x.subject));
  expect(m, `mail to ${to} matching ${subject}`).toBeTruthy();
  return m!;
}

export const firstUrl = (text: string) => new URL(text.match(/https?:\/\/\S+/)![0]);

/** Sign up and confirm the email; the returned browser is signed in. */
export async function signUpVerified(t: App, email: string, name = email.split('@')[0]): Promise<Browser> {
  const b = new Browser(t);
  const r = await b.post('/api/auth/sign-up/email', { name, email, password: PASSWORD });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  const link = firstUrl(lastMail(t, email, /Confirm your email/).text);
  const v = await b.get(link.pathname + link.search);
  expect([200, 302]).toContain(v.status);
  expect((await b.get('/api/me')).status).toBe(200);
  return b;
}

/** RFC 6238 code for an otpauth:// URI (SHA-1). */
export function totp(uri: string, at = Date.now()): string {
  const u = new URL(uri);
  const digits = Number(u.searchParams.get('digits') ?? 6);
  const period = Number(u.searchParams.get('period') ?? 30);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / period)));
  const h = crypto.createHmac('sha1', base32(u.searchParams.get('secret')!)).update(counter).digest();
  const off = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(off) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}

function base32(s: string): Buffer {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    value = (value << 5) | A.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
      value &= (1 << bits) - 1;
    }
  }
  return Buffer.from(out);
}
