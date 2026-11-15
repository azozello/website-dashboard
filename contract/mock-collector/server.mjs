#!/usr/bin/env node
/**
 * Mock collector for W2 tests (r1.js Playwright tests, WordPress plugin tests).
 *
 * Implements the collector side of Data contract v1 just enough to receive,
 * validate and record every payload against the strict JSON Schemas in
 * contract/v1/. It stores nothing on disk.
 *
 *   PORT=4010 R1_JS=../../tracker/dist/r1.js node server.mjs
 *
 * Test control endpoints (not part of the contract):
 *   GET  /_calls[?endpoint=/v1/r]  → recorded calls, oldest first
 *   POST /_reset                   → forget calls, configs and failure plans
 *   POST /_fail   {"endpoint":"/v1/r","count":2,"status":503,"delay_ms":0}
 *                                  → the next `count` calls to that endpoint fail
 *   POST /_config {"key":"pk_…","config":{…}} → config served for that key
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaDir = path.resolve(here, '../v1');
const PORT = Number(process.env.PORT || 4010);
const HOST = process.env.HOST || '0.0.0.0';
const R1_JS = path.resolve(process.env.R1_JS || path.join(here, '../../tracker/dist/r1.js'));

const ajv = new Ajv2020({ allErrors: true, strict: false });
for (const f of fs.readdirSync(schemaDir).filter((f) => f.endsWith('.schema.json'))) {
  ajv.addSchema(JSON.parse(fs.readFileSync(path.join(schemaDir, f), 'utf8')), f);
}
const validators = {
  '/v1/e': ajv.getSchema('event-envelope.schema.json'),
  '/v1/r': ajv.getSchema('server-request.schema.json'),
  '/v1/w': ajv.getSchema('wix-webhook.schema.json'),
  '/v1/plugin/hello': ajv.getSchema('plugin-hello.schema.json'),
};

const DEFAULT_CONFIG = { v: 1, config_version: 0, spa: 'auto', sections: [], booking_paths: [], forms_browser: [] };

let calls = [];
let configs = {};
let failPlans = {};

function reset() {
  calls = [];
  configs = {};
  failPlans = {};
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function send(res, status, body, headers = {}) {
  const isJson = body !== undefined && typeof body !== 'string';
  res.writeHead(status, {
    ...(isJson ? { 'Content-Type': 'application/json' } : {}),
    ...headers,
  });
  res.end(body === undefined ? undefined : isJson ? JSON.stringify(body) : body);
}

function endpointOf(pathname) {
  if (pathname.startsWith('/v1/w/')) return '/v1/w';
  return pathname;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  const origin = req.headers.origin;
  try {
    // ---- test control ----
    if (p === '/_calls') {
      const ep = url.searchParams.get('endpoint');
      return send(res, 200, ep ? calls.filter((c) => c.endpoint === ep) : calls, { 'Access-Control-Allow-Origin': '*' });
    }
    if (p === '/_reset' && req.method === 'POST') {
      reset();
      return send(res, 200, { ok: true });
    }
    if (p === '/_fail' && req.method === 'POST') {
      const plan = JSON.parse((await readBody(req)) || '{}');
      failPlans[plan.endpoint] = { count: plan.count ?? 1, status: plan.status ?? 503, delay_ms: plan.delay_ms ?? 0 };
      return send(res, 200, { ok: true });
    }
    if (p === '/_config' && req.method === 'POST') {
      const { key, config } = JSON.parse(await readBody(req));
      configs[key] = config;
      return send(res, 200, { ok: true });
    }

    // ---- contract endpoints ----
    if (p === '/healthz') return send(res, 200, { ok: true, version: 'mock' });

    if (req.method === 'GET' && (p === '/v1/r1.js' || /^\/v1\/r1\.[\w.-]+\.js$/.test(p))) {
      if (!fs.existsSync(R1_JS)) return send(res, 404, 'r1.js not built');
      return send(res, 200, fs.readFileSync(R1_JS, 'utf8'), {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      });
    }

    const cfg = p.match(/^\/v1\/config\/([^/]+)$/);
    if (req.method === 'GET' && cfg) {
      const key = decodeURIComponent(cfg[1]);
      const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=300' };
      calls.push({ endpoint: '/v1/config', method: 'GET', key, at: Date.now() });
      if (failPlans['/v1/config']?.count > 0) {
        failPlans['/v1/config'].count--;
        return send(res, failPlans['/v1/config'].status, { ok: false }, headers);
      }
      return send(res, 200, configs[key] || DEFAULT_CONFIG, headers);
    }

    if (req.method === 'OPTIONS') {
      return send(res, 204, undefined, {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
      });
    }

    const endpoint = endpointOf(p);
    const validate = validators[endpoint];
    if (req.method === 'POST' && validate) {
      const raw = await readBody(req);
      let body = null;
      let parseError = null;
      try {
        body = JSON.parse(raw);
      } catch (e) {
        parseError = String(e);
      }
      const valid = !parseError && validate(body);
      const record = {
        endpoint,
        method: 'POST',
        path: endpoint === '/v1/w' ? '/v1/w/{token}' : p,
        token: endpoint === '/v1/w' ? p.slice('/v1/w/'.length) : undefined,
        at: Date.now(),
        headers: {
          'content-type': req.headers['content-type'] || null,
          origin: origin || null,
          referer: req.headers.referer || null,
          authorization: req.headers.authorization ? req.headers.authorization.replace(/^(Bearer sk_).*$/, '$1…') : null,
          'user-agent': req.headers['user-agent'] || null,
        },
        auth_ok: endpoint === '/v1/e' || endpoint === '/v1/w' ? null : /^Bearer sk_[0-9A-Za-z]{40}$/.test(req.headers.authorization || ''),
        raw_length: Buffer.byteLength(raw),
        body,
        valid: !!valid,
        errors: parseError ? [parseError] : valid ? [] : validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}${e.params ? ' ' + JSON.stringify(e.params) : ''}`),
      };
      calls.push(record);

      const cors = endpoint === '/v1/e' && origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
      const plan = failPlans[endpoint];
      if (plan && plan.count > 0) {
        plan.count--;
        record.failed_with = plan.status;
        if (plan.delay_ms) await new Promise((r) => setTimeout(r, plan.delay_ms));
        return send(res, plan.status, { ok: false, error: 'injected failure' }, cors);
      }
      if (record.auth_ok === false) return send(res, 401, { ok: false, error: 'bad secret' });
      if (!valid) return send(res, 400, { ok: false, error: 'invalid', field: record.errors[0] }, cors);

      switch (endpoint) {
        case '/v1/e':
          return send(res, 204, undefined, cors);
        case '/v1/r': {
          const dup = calls.filter((c) => c.endpoint === '/v1/r' && c.valid && !c.failed_with && c.body.rid === body.rid).length > 1;
          return send(res, dup ? 200 : 202, { ok: true, request_id: `req_${body.rid}` });
        }
        case '/v1/w':
          return send(res, 202, { ok: true });
        case '/v1/plugin/hello':
          return send(res, 200, { ok: true, site_id: 'mock-site', config_version: 0 });
      }
    }
    return send(res, 404, { ok: false, error: 'not found' });
  } catch (e) {
    return send(res, 500, { ok: false, error: String(e) });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`mock collector on http://${HOST}:${PORT} (r1.js from ${R1_JS})\n`);
});
