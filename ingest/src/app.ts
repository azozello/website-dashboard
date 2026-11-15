/**
 * HTTP surface of the collect host (Data contract v1 §2, §4–§8).
 * collect never sets cookies; request bodies and IPs are never logged.
 */
import fs from 'node:fs';
import path from 'node:path';
import Fastify, { LogController, type FastifyReply, type FastifyRequest } from 'fastify';
import { isBot } from './classify.js';
import { makeClientIp } from './clientip.js';
import type { Settings } from './config.js';
import type { Db } from './db.js';
import { makeSalts, makeStore, processEnvelope, processHello, processServerRequest, processWebhook, visitorKey, type Site } from './ingest.js';
import { Invalid, parseEnvelope, parseHello, parseServerRequest, parseWebhook, SITE_KEY } from './validate.js';

export interface AppOpts {
  db: Db;
  settings: Settings;
  now?: () => Date;
  logger?: boolean;
}

/** Fixed one-minute windows per client IP, in memory (single VM, §2 limits). */
function limiter(perMinute: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  const t = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, 60_000);
  t.unref();
  return (ip: string) => {
    const now = Date.now();
    let h = hits.get(ip);
    if (!h || h.reset <= now) hits.set(ip, (h = { n: 0, reset: now + 60_000 }));
    return ++h.n <= perMinute;
  };
}

function loadScripts(dir: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  try {
    for (const f of fs.readdirSync(dir)) if (/^r1(\.[\w.-]+)?\.js$/.test(f)) files.set(f, fs.readFileSync(path.join(dir, f)));
  } catch {
    /* tracker not built: /v1/r1.js answers 404 */
  }
  return files;
}

export function originAllowed(site: Site, origin: string | undefined, referer: string | undefined): boolean {
  const allowed = (site.allowed_origins || []).map((o) => o.toLowerCase().replace(/\/+$/, ''));
  if (origin && origin !== 'null') return allowed.includes(origin.toLowerCase());
  if (referer) {
    try {
      const host = new URL(referer).host.toLowerCase();
      return allowed.some((a) => {
        try {
          return new URL(a).host === host;
        } catch {
          return false;
        }
      });
    } catch {
      /* unparsable referer */
    }
  }
  return false;
}

const parseJson = (body: unknown): unknown => {
  if (typeof body !== 'string' || !body) throw new Invalid('body');
  try {
    return JSON.parse(body);
  } catch {
    throw new Invalid('body');
  }
};

const bearer = (req: FastifyRequest) => {
  const m = /^Bearer (sk_[0-9A-Za-z]{40})$/.exec(String(req.headers.authorization || '').trim());
  return m ? m[1] : null;
};

export function buildApp({ db, settings, now = () => new Date(), logger = true }: AppOpts) {
  const app = Fastify({
    logger: logger ? { level: settings.env === 'prod' ? 'info' : 'debug' } : false,
    logController: new LogController({ disableRequestLogging: true }), // no URLs (webhook tokens), IPs or bodies in logs (§2)
    bodyLimit: 64 * 1024,
    trustProxy: false, // client IP handled below, per §2
    return503OnClosing: true,
  });
  const store = makeStore(db);
  const salts = makeSalts(db);
  const clientIp = makeClientIp(settings.trustedProxyCidrs, settings.clientIpHeader);
  const ipOf = (req: FastifyRequest) => clientIp(req.socket.remoteAddress, req.headers);
  const limitE = limiter(120);
  const limitServer = limiter(60);
  const scripts = loadScripts(settings.r1JsDir);

  // Every body arrives as a string (sendBeacon sends text/plain); handlers parse it.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => done(null, body));

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    if (!reply.getHeader('Cache-Control')) reply.header('Cache-Control', 'no-store');
  });

  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, req, reply) => {
    if (err instanceof Invalid) return reply.code(400).send({ ok: false, error: 'invalid', field: err.field });
    if (err.statusCode === 413 || err.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return reply.code(413).send({ ok: false, error: 'too large' });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ ok: false, error: err.code || 'bad request' });
    req.log.error({ route: req.routeOptions?.url, code: err.code, message: err.message }, 'request failed');
    return reply.code(500).send({ ok: false, error: 'internal' });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ ok: false, error: 'not found' }));

  const tooMany = (reply: FastifyReply) => reply.code(429).header('Retry-After', '60').send({ ok: false, error: 'rate limited' });

  // ------------------------------------------------------------ health
  app.get('/healthz', async (_req, reply) => {
    try {
      await db.query('SELECT 1');
      return { ok: true, version: settings.version };
    } catch {
      return reply.code(503).send({ ok: false, version: settings.version });
    }
  });

  // ------------------------------------------------------------ r1.js (§2: 1 h; versioned copies immutable)
  app.get<{ Params: { file: string } }>('/v1/:file', async (req, reply) => {
    const body = scripts.get(req.params.file);
    if (!body) return reply.code(404).send({ ok: false, error: 'not found' });
    return reply
      .header('Content-Type', 'application/javascript; charset=utf-8')
      .header('Cache-Control', req.params.file === 'r1.js' ? 'public, max-age=3600' : 'public, max-age=31536000, immutable')
      .header('Access-Control-Allow-Origin', '*')
      .send(body);
  });

  // ------------------------------------------------------------ I2 config (§5)
  app.get<{ Params: { key: string } }>('/v1/config/:key', async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    const site = SITE_KEY.test(req.params.key) ? await store.siteByKey(req.params.key) : null;
    if (!site) return reply.header('Cache-Control', 'max-age=60').code(404).send({ ok: false, error: 'unknown key' });
    const c = await store.config(site.id);
    return reply.header('Cache-Control', 'max-age=300').send({
      v: 1,
      config_version: c.config_version,
      spa: c.spa,
      sections: c.sections,
      booking_paths: c.booking_paths,
      forms_browser: c.forms_browser,
    });
  });

  // ------------------------------------------------------------ I1 browser events (§4)
  app.options('/v1/e', async (req, reply) =>
    reply
      .code(204)
      .header('Access-Control-Allow-Origin', req.headers.origin || '*')
      .header('Access-Control-Allow-Methods', 'POST, OPTIONS')
      .header('Access-Control-Allow-Headers', 'Content-Type')
      .header('Access-Control-Max-Age', '600')
      .header('Vary', 'Origin')
      .send(),
  );

  app.post('/v1/e', { bodyLimit: 16 * 1024 }, async (req, reply) => {
    const ip = ipOf(req);
    if (!limitE(ip)) return tooMany(reply);
    const env = parseEnvelope(parseJson(req.body));
    const site = await store.siteByKey(env.k);
    if (!site) return reply.code(403).send({ ok: false, error: 'unknown key' });
    if (!originAllowed(site, req.headers.origin, req.headers.referer)) return reply.code(403).send({ ok: false, error: 'origin not allowed' });
    if (req.headers.origin) reply.header('Access-Control-Allow-Origin', req.headers.origin).header('Vary', 'Origin');

    const ua = String(req.headers['user-agent'] || '');
    if ((isBot(ua) || env.wd) && !env.test) return reply.code(204).send(); // dropped, not stored (§9)
    if (!env.ev.length) return reply.code(204).send();

    const t = now();
    const key = visitorKey(await salts(t), site.id, ip, ua);
    await processEnvelope(db, site, await store.config(site.id), env, { visitorKey: key, ua, now: t });
    return reply.code(204).send();
  });

  // ------------------------------------------------------------ I3 server requests (§6)
  app.post('/v1/r', async (req, reply) => {
    if (!limitServer(ipOf(req))) return tooMany(reply);
    const secret = bearer(req);
    const site = secret ? await store.siteBySecret(secret) : null;
    if (!site) return reply.code(401).send({ ok: false, error: 'bad secret' });
    const r = parseServerRequest(parseJson(req.body));
    const res = await processServerRequest(db, site, await store.config(site.id), r, now());
    return reply.code(res.duplicate ? 200 : 202).send({ ok: true, request_id: res.id, ...(res.duplicate ? { duplicate: true } : {}) });
  });

  // ------------------------------------------------------------ I4 Wix webhook (§7)
  app.post<{ Params: { token: string } }>('/v1/w/:token', async (req, reply) => {
    if (!limitServer(ipOf(req))) return tooMany(reply);
    const token = req.params.token;
    const site = /^wh_[0-9A-Za-z]{32}$/.test(token) ? await store.siteByWebhookToken(token) : null;
    if (!site) return reply.code(401).send({ ok: false, error: 'bad token' });
    const w = parseWebhook(parseJson(req.body)); // keeps form + submission_id only
    await processWebhook(db, site, await store.config(site.id), w, now());
    return reply.code(202).send({ ok: true });
  });

  // ------------------------------------------------------------ I5 plugin hello (§8)
  app.post('/v1/plugin/hello', async (req, reply) => {
    if (!limitServer(ipOf(req))) return tooMany(reply);
    const secret = bearer(req);
    const site = secret ? await store.siteBySecret(secret) : null;
    if (!site) return reply.code(401).send({ ok: false, error: 'bad secret' });
    const h = parseHello(parseJson(req.body));
    await processHello(db, site, h, now());
    const c = await store.config(site.id);
    return reply.send({ ok: true, site_id: site.id, config_version: c.config_version });
  });

  // ------------------------------------------------------------ test-only (§2)
  if (settings.env === 'test')
    app.get('/v1/_echo', async (req) => ({ ip_seen: ipOf(req), ua_seen: req.headers['user-agent'] ?? null, origin: req.headers.origin ?? null }));

  return Object.assign(app, { store });
}
