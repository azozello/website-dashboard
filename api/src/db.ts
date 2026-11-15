import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/** What the app needs from a pool: a pg.Pool, or the tenant pool below. */
export interface Db {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query<R extends pg.QueryResultRow = any>(text: string, values?: unknown[]): Promise<pg.QueryResult<R>>;
  connect(): Promise<pg.PoolClient>;
  end(): Promise<void>;
}

export const createPool = (url: string, max = 10) => new pg.Pool({ connectionString: url, max });

/** Whom the current request acts for. app.ts opens one per request; the guards (tenant.ts) fill in the user. */
export const actor = new AsyncLocalStorage<{ userId: string | null }>();

/**
 * Pool for tenant data: the second layer behind the guards. Every connection it hands out first gets
 * app.user_id = the signed-in user of the current request ('' outside a request, or before a guard ran).
 * The row-level security policies (migrations/008_rls.sql) then limit that connection to the user's
 * organisations, so a query that forgets its site filter finds nothing of other tenants.
 * It is set on every checkout, so a connection never carries a previous request's user.
 */
export function createTenantPool(url: string, max = 10): Db {
  const pool = createPool(url, max);
  async function connect() {
    const client = await pool.connect();
    try {
      await client.query(`SELECT set_config('app.user_id', $1, false)`, [actor.getStore()?.userId ?? '']);
    } catch (err) {
      client.release(err as Error);
      throw err;
    }
    return client;
  }
  return {
    connect,
    async query(text, values) {
      const client = await connect();
      try {
        return await client.query(text, values);
      } finally {
        client.release();
      }
    },
    end: () => pool.end(),
  };
}

export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

/**
 * Applies migrations/*.sql in name order, each once, each in its own transaction.
 * Tracked in app_schema_migrations (ingest tracks its own in schema_migrations).
 * Needs a role that may create tables (the database owner), not app_rw.
 */
export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db.query('CREATE TABLE IF NOT EXISTS app_schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await db.query<{ name: string }>('SELECT name FROM app_schema_migrations')).rows.map((r) => r.name));
  const applied: string[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await client.query('INSERT INTO app_schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  return applied;
}
