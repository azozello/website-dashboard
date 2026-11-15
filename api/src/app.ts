import Fastify, { LogController, type FastifyInstance } from 'fastify';
import { createAuth, type Auth } from './auth.ts';
import type { Settings } from './config.ts';
import { createPool, type Db } from './db.ts';
import { createMailer, type Mailer } from './mail.ts';
import { registerChecks } from './checks.ts';
import { registerRoutes } from './routes.ts';
import { registerSiteConfig } from './site-config.ts';
import { createGuards } from './tenant.ts';

export interface App {
  app: FastifyInstance;
  auth: Auth;
  db: Db;
  mailer: Mailer;
}

export async function buildApp(settings: Settings, opts: { logger?: boolean } = {}): Promise<App> {
  const db = createPool(settings.databaseUrl);
  const mailer = createMailer(settings.smtpUrl, settings.mailFrom);
  const auth = createAuth(settings, db, mailer);

  const app = Fastify({
    logger: opts.logger ?? true,
    // No per-request lines (client IPs, paths carrying tokens); errors are still logged.
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 64 * 1024,
  });
  app.decorateRequest('principal', null);
  app.decorateRequest('tenant', null);
  app.addHook('onClose', async () => db.end());

  // Better Auth speaks the Fetch API. In its own scope, pass the raw body through
  // untouched instead of letting Fastify parse it.
  await app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
    scope.route({
      method: ['GET', 'POST'],
      url: '/api/auth/*',
      async handler(req, reply) {
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (v === undefined) continue;
          for (const one of Array.isArray(v) ? v : [v]) headers.append(k, one);
        }
        const body = req.body instanceof Buffer && req.body.length ? new Uint8Array(req.body) : undefined;
        // Absolute URL from our own base URL, not the Host header.
        const res = await auth.handler(new Request(new URL(req.url, settings.appBaseUrl), { method: req.method, headers, body }));

        reply.status(res.status);
        res.headers.forEach((value, key) => {
          if (key !== 'set-cookie') reply.header(key, value);
        });
        const cookies = res.headers.getSetCookie();
        if (cookies.length) reply.header('set-cookie', cookies);
        return reply.send(res.body ? Buffer.from(await res.arrayBuffer()) : null);
      },
    });
  });

  app.get('/healthz', async () => ({ ok: true, version: settings.version }));
  const guards = createGuards(auth, db);
  registerRoutes(app, db, guards, settings);
  registerSiteConfig(app, db, guards);
  registerChecks(app, db, guards, settings);

  return { app, auth, db, mailer };
}
