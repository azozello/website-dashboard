import type { FastifyInstance } from 'fastify';
import type { Db } from './db.ts';
import { normalisePath } from './paths.ts';
import type { Guards } from './tenant.ts';

/**
 * Site config editor: GET/PUT /api/sites/:siteId/config.
 *
 * Writes `site_config` (contract §5, §10), which ingest serves at /v1/config/{site_key}
 * and uses to decide which requests count. The dashboard edits one list of request rules;
 * on save it splits them into the stored shapes:
 *
 *   request_rules  [{method, form, source?, form_id?, path?, counts}]   (contract README edit #6)
 *   forms_browser  [{form, selector, success_selector}]                 (browser rules with selectors)
 *
 * Every save bumps config_version; a save based on an older version gets 409, so two admins
 * editing at once can't silently overwrite each other.
 */

export const METHODS = ['server', 'webhook', 'browser', 'thankyou'] as const;
type Method = (typeof METHODS)[number];

export interface RuleDto {
  method: Method;
  /** Form name. Groups a form's rules: exactly one of them is primary (counts). */
  form: string;
  counts: boolean;
  source?: string; // server: plugin/helper that sends it (cf7, elementor, wpforms, php…)
  formId?: string; // server
  path?: string; // thankyou
  selector?: string; // browser, with successSelector; without both, the site calls r1.formOk(form)
  successSelector?: string;
}
export interface SectionDto {
  path?: string;
  selector: string;
  name: string;
}
export interface ConfigDto {
  version: number;
  spa: 'auto' | 'off';
  sections: SectionDto[];
  bookingPaths: string[];
  requestRules: RuleDto[];
  updatedAt: string | null;
}

interface Row {
  config_version: number;
  spa: string;
  sections: unknown;
  booking_paths: unknown;
  forms_browser: unknown;
  request_rules: unknown;
  updated_at: Date | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const optStr = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined);

/** Stored config → editor shape. Lenient: configs written by ingest's CLI may be loose. */
export function toDto(row: Row | undefined): ConfigDto {
  if (!row) return { version: 0, spa: 'auto', sections: [], bookingPaths: [], requestRules: [], updatedAt: null };
  const browser = new Map<string, { selector: string; successSelector: string }>();
  for (const f of arr(row.forms_browser).filter(isObj)) {
    const form = optStr(f.form);
    if (form && !browser.has(form)) browser.set(form, { selector: optStr(f.selector) ?? '', successSelector: optStr(f.success_selector) ?? '' });
  }
  const rules: RuleDto[] = [];
  for (const r of arr(row.request_rules).filter(isObj)) {
    if (!METHODS.includes(r.method as Method)) continue;
    const method = r.method as Method;
    const rule: RuleDto = { method, form: optStr(r.form) ?? optStr(r.form_id) ?? optStr(r.path) ?? '', counts: r.counts !== false };
    if (method === 'server') Object.assign(rule, { source: optStr(r.source) ?? '', formId: optStr(r.form_id) ?? '' });
    if (method === 'thankyou') rule.path = optStr(r.path) ?? '';
    if (method === 'browser') {
      const b = browser.get(rule.form);
      if (b?.selector) Object.assign(rule, b);
      browser.delete(rule.form);
    }
    rules.push(rule);
  }
  // forms_browser entries without a rule count on their own in ingest (browserRule): show them as primary browser rules.
  for (const [form, b] of browser) rules.push({ method: 'browser', form, counts: true, ...(b.selector ? b : {}) });

  const sections = arr(row.sections)
    .filter(isObj)
    .map((s) => ({ ...(optStr(s.path) ? { path: optStr(s.path) } : {}), selector: optStr(s.selector) ?? '', name: optStr(s.name) ?? '' }));
  return {
    version: row.config_version,
    spa: row.spa === 'off' ? 'off' : 'auto',
    sections,
    bookingPaths: arr(row.booking_paths).map(optStr).filter((p): p is string => Boolean(p)),
    requestRules: rules,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

export class ConfigError extends Error {
  field: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}

interface Input {
  version: number;
  spa: 'auto' | 'off';
  sections: { path?: string; selector: string; name: string }[];
  bookingPaths: string[];
  requestRules: RuleDto[];
}

/** Checks and normalises an edited config; returns the columns to store. Throws ConfigError. */
export function toStored(input: Input) {
  const sections = input.sections.map((s, i) => {
    const selector = s.selector.trim();
    const name = s.name.trim();
    if (!selector) throw new ConfigError(`sections[${i}].selector`, 'Enter a CSS selector.');
    if (!name) throw new ConfigError(`sections[${i}].name`, 'Enter a section name.');
    const path = s.path?.trim();
    return { ...(path ? { path: normalisePath(path) } : {}), selector, name };
  });

  const bookingPaths: string[] = [];
  input.bookingPaths.forEach((p, i) => {
    if (!p.trim()) throw new ConfigError(`bookingPaths[${i}]`, 'Enter a path, e.g. /booking.');
    const n = normalisePath(p.trim());
    if (!bookingPaths.includes(n)) bookingPaths.push(n);
  });

  const rules: Record<string, unknown>[] = [];
  const formsBrowser: { form: string; selector: string; success_selector: string }[] = [];
  const seen = new Map<string, number>();
  const primaries = new Map<string, number>();
  input.requestRules.forEach((r, i) => {
    const at = `requestRules[${i}]`;
    const form = r.form.trim();
    if (!form) throw new ConfigError(`${at}.form`, 'Enter the form name.');
    const out: Record<string, unknown> = { method: r.method, form };
    let key: string;
    if (r.method === 'server') {
      const source = r.source?.trim();
      const formId = r.formId?.trim();
      if (!source) throw new ConfigError(`${at}.source`, 'Enter the source, e.g. cf7.');
      if (!formId) throw new ConfigError(`${at}.formId`, 'Enter the form ID.');
      Object.assign(out, { source, form_id: formId });
      key = `server\u0000${source}\u0000${formId}`;
    } else if (r.method === 'thankyou') {
      if (!r.path?.trim()) throw new ConfigError(`${at}.path`, 'Enter the thank-you page path.');
      out.path = normalisePath(r.path.trim());
      key = `thankyou\u0000${out.path}`;
    } else {
      key = `${r.method}\u0000${form}`;
    }
    if (r.method === 'browser') {
      const selector = r.selector?.trim() ?? '';
      const success = r.successSelector?.trim() ?? '';
      if (Boolean(selector) !== Boolean(success))
        throw new ConfigError(`${at}.${selector ? 'successSelector' : 'selector'}`, 'Enter both selectors, or neither (then the site calls r1.formOk).');
      if (selector) formsBrowser.push({ form, selector, success_selector: success });
    }
    if (seen.has(key)) throw new ConfigError(at, `Same rule as rule ${seen.get(key)! + 1}.`);
    seen.set(key, i);
    out.counts = r.counts;
    if (r.counts) primaries.set(form, (primaries.get(form) ?? 0) + 1);
    rules.push(out);
  });
  // Contract §5: each form has exactly one primary method; the others are shadows.
  for (const r of input.requestRules) {
    const n = primaries.get(r.form.trim()) ?? 0;
    if (n !== 1) {
      const i = input.requestRules.findIndex((x) => x.form.trim() === r.form.trim() && (n === 0 || x.counts));
      throw new ConfigError(`requestRules[${i}].counts`, n ? `“${r.form.trim()}” has ${n} primary methods. Keep one; make the others comparisons.` : `“${r.form.trim()}” has no primary method.`);
    }
  }

  return { spa: input.spa, sections, bookingPaths, rules, formsBrowser };
}

const str = (max: number, min = 1) => ({ type: 'string', minLength: min, maxLength: max });

const bodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'spa', 'sections', 'bookingPaths', 'requestRules'],
  properties: {
    version: { type: 'integer', minimum: 0 },
    spa: { type: 'string', enum: ['auto', 'off'] },
    sections: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['selector', 'name'],
        properties: { path: str(512, 0), selector: str(300, 0), name: str(60, 0) },
      },
    },
    bookingPaths: { type: 'array', maxItems: 20, items: str(512, 0) },
    requestRules: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['method', 'form', 'counts'],
        properties: {
          method: { type: 'string', enum: [...METHODS] },
          form: str(100, 0),
          counts: { type: 'boolean' },
          source: str(40, 0),
          formId: str(100, 0),
          path: str(512, 0),
          selector: str(300, 0),
          successSelector: str(300, 0),
        },
      },
    },
  },
};

const COLS = 'config_version, spa, sections, booking_paths, forms_browser, request_rules, updated_at';

export function registerSiteConfig(app: FastifyInstance, db: Db, { requireSite }: Guards) {
  /** The site's tracking config in editor shape, plus the forms the WordPress plugin reported (§8 hello). */
  app.get('/api/sites/:siteId/config', { preHandler: requireSite('member') }, async (req) => {
    const siteId = req.tenant!.siteId!;
    const { rows } = await db.query<Row>(`SELECT ${COLS} FROM site_config WHERE site_id = $1`, [siteId]);
    let detectedForms: { source: string; id: string; title: string }[] = [];
    const ps = await db.query<{ ok: boolean }>(`SELECT to_regclass('plugin_status') IS NOT NULL AS ok`);
    if (ps.rows[0].ok) {
      const hello = await db.query<{ env: unknown }>('SELECT env FROM plugin_status WHERE site_id = $1', [siteId]);
      const env = hello.rows[0]?.env;
      if (isObj(env))
        detectedForms = arr(env.forms)
          .filter(isObj)
          .map((f) => ({ source: optStr(f.source) ?? '', id: optStr(f.id) ?? '', title: optStr(f.title) ?? '' }))
          .filter((f) => f.source && f.id);
    }
    return { config: toDto(rows[0]), detectedForms };
  });

  /** Replace the site's tracking config (owner/admin). Body: the editor shape with the version it was based on. */
  app.put('/api/sites/:siteId/config', { preHandler: requireSite('admin'), schema: { body: bodySchema } }, async (req, reply) => {
    const siteId = req.tenant!.siteId!;
    const body = req.body as Input;
    let s: ReturnType<typeof toStored>;
    try {
      s = toStored(body);
    } catch (err) {
      if (err instanceof ConfigError) return reply.code(400).send({ error: 'invalid_config', field: err.field, message: err.message });
      throw err;
    }
    const { rows } = await db.query<Row>(
      `INSERT INTO site_config AS c (site_id, config_version, spa, sections, booking_paths, forms_browser, request_rules, updated_at)
       VALUES ($1, 1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (site_id) DO UPDATE
         SET config_version = c.config_version + 1, spa = EXCLUDED.spa, sections = EXCLUDED.sections, booking_paths = EXCLUDED.booking_paths,
             forms_browser = EXCLUDED.forms_browser, request_rules = EXCLUDED.request_rules, updated_at = now()
         WHERE c.config_version = $7
       RETURNING ${COLS}`,
      [siteId, s.spa, JSON.stringify(s.sections), JSON.stringify(s.bookingPaths), JSON.stringify(s.formsBrowser), JSON.stringify(s.rules), body.version],
    );
    if (!rows[0]) return reply.code(409).send({ error: 'version_conflict', message: 'Someone else changed these settings. Reload to see their version.' });
    return { config: toDto(rows[0]) };
  });
}
