import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

export interface TestApp extends App {
  /** Superuser pool on the test database for setup and assertions; bypasses row-level security. */
  sql: pg.Pool;
}

const INGEST_MIGRATIONS = fileURLToPath(new URL('../../ingest/migrations/', import.meta.url));

/** Cluster-wide service role (infra/postgres/initdb/10-roles.sh); the migrations grant it its tables. */
async function ensureRole(admin: pg.Client, role: 'app_rw' | 'ingest_rw') {
  try {
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${role}'`);
  } catch (err) {
    // 42710: exists already; 23505: another test file created it at the same moment
    if (!['42710', '23505'].includes((err as { code?: string }).code ?? '')) throw err;
  }
}

/** Connection string for `db` on the test server, as `role` (default: the superuser of TEST_DATABASE_URL). */
export function dbUrl(db: string, role?: 'app_rw' | 'ingest_rw') {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${db}`;
  if (role) [url.username, url.password] = [role, role];
  return url.toString();
}

/**
 * A migrated, empty database of its own, and the app on top of it. Like when deployed, the app connects
 * as app_rw, which is not a superuser, so row-level security applies to it (migrations/008_rls.sql).
 * `ingest: true` first applies ingest's schema (tracking tables), as a deploy does. `google`: a fake Google
 * (Search Console tests).
 */
export async function freshApp(name: string, opts: { ingest?: boolean; google?: GoogleApi } = {}): Promise<TestApp> {
  const dbName = `rate1_api_test_${name}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await ensureRole(admin, 'app_rw');
  if (opts.ingest) await ensureRole(admin, 'ingest_rw');
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();

  const sql = createPool(dbUrl(dbName), 2);
  if (opts.ingest) {
    for (const f of fs.readdirSync(INGEST_MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
      await sql.query(fs.readFileSync(path.join(INGEST_MIGRATIONS, f), 'utf8'));
    }
  }
  await migrate(sql);
  const settings = loadSettings({ DATABASE_URL: dbUrl(dbName, 'app_rw'), APP_BASE_URL: BASE, RATE_LIMIT: 'off' } as NodeJS.ProcessEnv);
  const t = await buildApp(settings, { logger: false, google: opts.google });
  t.app.addHook('onClose', async () => sql.end());
  return { ...t, sql };
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
  delete(url: string) {
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
