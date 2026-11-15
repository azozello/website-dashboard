/**
 * Site admin for the PoC, until the dashboard (W4) owns sites:
 *
 *   node dist/cli.js migrate
 *   node dist/cli.js create-site --name "WP test" --platform wordpress --origin https://wp.example [--origin …] [--timezone Europe/Berlin]
 *   node dist/cli.js set-origins --site pk_… --origin https://a.example --origin https://www.a.example
 *   node dist/cli.js set-config --site pk_… --file config.json      (bumps config_version)
 *   node dist/cli.js rotate-secret --site pk_…
 *   node dist/cli.js list-sites
 *
 * Secrets are printed once and stored only as SHA-256 hashes.
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { loadSettings } from './config.js';
import { migrate, type Db } from './db.js';
import { newSiteKey, newSiteSecret, newWebhookToken, sha256hex } from './util.js';

const PLATFORMS = ['php', 'wordpress', 'wix'];

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function origins(list: string[] | undefined): string[] {
  return (list || []).map((o) => {
    try {
      const u = new URL(o);
      if (!/^https?:$/.test(u.protocol)) throw new Error();
      return u.origin;
    } catch {
      return fail(`not an origin: ${o} (expected e.g. https://www.example.com)`);
    }
  });
}

async function siteId(db: Db, key: string | undefined): Promise<string> {
  if (!key) fail('--site pk_… is required');
  const r = await db.query<{ id: string }>('SELECT id FROM sites WHERE site_key = $1 OR id::text = $1', [key]);
  return r.rows[0]?.id ?? fail(`unknown site ${key}`);
}

export async function run(argv: string[], db: Db, settings = loadSettings()): Promise<Record<string, unknown>> {
  const [cmd, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      name: { type: 'string' },
      platform: { type: 'string' },
      origin: { type: 'string', multiple: true },
      timezone: { type: 'string' },
      site: { type: 'string' },
      file: { type: 'string' },
    },
  });
  switch (cmd) {
    case 'migrate':
      return { applied: await migrate(db) };

    case 'create-site': {
      if (!values.name) fail('--name is required');
      if (!values.platform || !PLATFORMS.includes(values.platform)) fail(`--platform must be one of ${PLATFORMS.join(', ')}`);
      const allowed = origins(values.origin);
      if (!allowed.length) fail('at least one --origin is required (the site address, e.g. https://www.example.com)');
      const key = newSiteKey();
      const secret = newSiteSecret();
      const token = values.platform === 'wix' ? newWebhookToken() : null;
      const r = await db.query<{ id: string }>(
        `INSERT INTO sites (name, platform, timezone, allowed_origins, site_key, site_secret_hash, webhook_token_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [values.name, values.platform, values.timezone || 'Europe/Berlin', allowed, key, sha256hex(secret), token ? sha256hex(token) : null],
      );
      await db.query('INSERT INTO site_config (site_id) VALUES ($1)', [r.rows[0].id]);
      return {
        site_id: r.rows[0].id,
        site_key: key,
        site_secret: secret,
        ...(token ? { webhook_token: token, webhook_url: `${settings.collectBaseUrl}/v1/w/${token}` } : {}),
        allowed_origins: allowed,
        script_tag: `<script defer src="${settings.collectBaseUrl}/v1/r1.js" data-site="${key}"></script>`,
        note: 'The secret and webhook token are shown only now; only their hashes are stored.',
      };
    }

    case 'set-origins': {
      const id = await siteId(db, values.site);
      const allowed = origins(values.origin);
      if (!allowed.length) fail('at least one --origin is required');
      await db.query('UPDATE sites SET allowed_origins = $2 WHERE id = $1', [id, allowed]);
      return { site_id: id, allowed_origins: allowed };
    }

    case 'set-config': {
      const id = await siteId(db, values.site);
      if (!values.file) fail('--file config.json is required');
      const c = JSON.parse(fs.readFileSync(values.file, 'utf8'));
      const arr = (k: string) => {
        if (c[k] !== undefined && !Array.isArray(c[k])) fail(`${k} must be an array`);
        return JSON.stringify(c[k] ?? []);
      };
      const r = await db.query<{ config_version: number }>(
        `INSERT INTO site_config (site_id, config_version, spa, sections, booking_paths, forms_browser, request_rules, updated_at)
         VALUES ($1, 1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (site_id) DO UPDATE SET config_version = site_config.config_version + 1, spa = EXCLUDED.spa, sections = EXCLUDED.sections,
           booking_paths = EXCLUDED.booking_paths, forms_browser = EXCLUDED.forms_browser, request_rules = EXCLUDED.request_rules, updated_at = now()
         RETURNING config_version`,
        [id, c.spa ?? 'auto', arr('sections'), arr('booking_paths'), arr('forms_browser'), arr('request_rules')],
      );
      return { site_id: id, config_version: r.rows[0].config_version };
    }

    case 'rotate-secret': {
      const id = await siteId(db, values.site);
      const secret = newSiteSecret();
      await db.query('UPDATE sites SET site_secret_hash = $2 WHERE id = $1', [id, sha256hex(secret)]);
      return { site_id: id, site_secret: secret, note: 'Paste the new secret into the plugin/helper; the old one stops working (after ≤30 s cache).' };
    }

    case 'list-sites': {
      const r = await db.query(
        `SELECT s.id, s.name, s.platform, s.site_key, s.allowed_origins, c.config_version, p.last_hello_at
         FROM sites s LEFT JOIN site_config c ON c.site_id = s.id LEFT JOIN plugin_status p ON p.site_id = s.id ORDER BY s.created_at`,
      );
      return { sites: r.rows };
    }

    default:
      return fail('commands: migrate | create-site | set-origins | set-config | rotate-secret | list-sites');
  }
}
