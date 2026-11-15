#!/usr/bin/env node
/**
 * Integration tests for rate1-connector against Docker WordPress + Contact Form 7
 * and the contract mock collector. Run through wp-plugin/tests/run.sh, or:
 *
 *   node wp-plugin/tests/integration.mjs [--keep] [--reuse] [--skip-plugin-check]
 *
 *   --keep               leave the containers running afterwards
 *   --reuse              don't wipe the WordPress volume first
 *   --skip-plugin-check  skip the official Plugin Check run
 *
 * Needs: Docker, Node 18+, PHP (to build the zip). Ports: 8088 (WordPress), 4010 (mock collector).
 */
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(here, '..');
const repo = path.resolve(pluginRoot, '..');
const args = new Set(process.argv.slice(2));
const WP = 'http://localhost:8088';
const MOCK = 'http://127.0.0.1:4010';
const VERSION = '0.2.0';

// Test credentials for this run only (contract §1 formats).
const b62 = (n) => {
  const abc = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  return Array.from(crypto.randomBytes(n), (b) => abc[b % 62]).join('');
};
const KEY = 'pk_' + b62(24);
const SECRET = 'sk_' + b62(40);
const PV = 'Qm7Xk2Lp9Rt4Vb8N';
const VISITOR_UA = 'Mozilla/5.0 (R1-Test-Visitor) VisitorBrowser/1.0';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const SENSITIVE = ['Zed Uniquename', 'zed.unique@example.test', 'Uniquesubject', 'secret-message-4711', VISITOR_UA, 'R1-Test-Visitor'];

// ---------------------------------------------------------------- reporting
const results = [];
let group = '';
function section(name) {
  group = name;
  console.log(`\n# ${name}`);
}
function check(cond, msg, detail) {
  results.push({ group, msg, ok: !!cond });
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}${!cond && detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
  return !!cond;
}
const eq = (a, b, msg) => check(JSON.stringify(a) === JSON.stringify(b), msg, { expected: b, got: a });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- processes
function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0 && !opts.allowFail) {
    throw new Error(`${cmd} ${argv.join(' ')} exited ${r.status}\n${r.stdout}\n${r.stderr}`);
  }
  return r;
}
const composeArgs = ['compose', '-f', path.join(here, 'docker-compose.yml')];
const compose = (...a) => run('docker', [...composeArgs, ...a]);
function wp(...a) {
  const opts = typeof a[a.length - 1] === 'object' ? a.pop() : {};
  const r = run('docker', [...composeArgs, 'exec', '-T', 'cli', 'wp', ...a], opts);
  return opts.allowFail ? r : r.stdout.trim();
}
const wpEval = (php, opts) => wp('eval', php, ...(opts ? [opts] : []));
const opt = (name) => {
  const r = wp('option', 'get', name, '--format=json', { allowFail: true });
  return r.status === 0 ? JSON.parse(r.stdout) : undefined;
};

// ---------------------------------------------------------------- HTTP helpers
async function http(url, init = {}) {
  const t = Date.now();
  const res = await fetch(url, { redirect: 'manual', ...init });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, ms: Date.now() - t };
}
const mock = {
  reset: () => fetch(`${MOCK}/_reset`, { method: 'POST' }),
  fail: (plan) => fetch(`${MOCK}/_fail`, { method: 'POST', body: JSON.stringify({ endpoint: '/v1/r', ...plan }) }),
  calls: async (endpoint) => (await fetch(`${MOCK}/_calls?endpoint=${encodeURIComponent(endpoint)}`)).json(),
};
async function waitCalls(endpoint, n, timeout = 10000) {
  const until = Date.now() + timeout;
  let c = [];
  while (Date.now() < until) {
    c = await mock.calls(endpoint);
    if (c.length >= n) return c;
    await sleep(200);
  }
  return c;
}

function cookieHeader(userId) {
  const json = wpEval(
    `$exp = time() + 3600; $tok = WP_Session_Tokens::get_instance( ${userId} )->create( $exp );` +
      `echo wp_json_encode( array( LOGGED_IN_COOKIE => wp_generate_auth_cookie( ${userId}, $exp, 'logged_in', $tok ), AUTH_COOKIE => wp_generate_auth_cookie( ${userId}, $exp, 'auth', $tok ) ) );`
  );
  return Object.entries(JSON.parse(json))
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ');
}

let formId;
async function submitCf7(extra = {}, { referer, drop = [] } = {}) {
  const fields = {
    _wpcf7: String(formId),
    _wpcf7_version: '6.0',
    _wpcf7_locale: 'en_US',
    _wpcf7_unit_tag: `wpcf7-f${formId}-o1`,
    _wpcf7_container_post: '0',
    'your-name': 'Zed Uniquename',
    'your-email': 'zed.unique@example.test',
    'your-subject': 'Uniquesubject',
    'your-message': 'secret-message-4711',
    r1_pv: PV,
    r1_path: '/back-pain',
    ...extra,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (!drop.includes(k)) fd.append(k, v);
  const headers = { 'User-Agent': VISITOR_UA, 'X-Forwarded-For': '203.0.113.77' };
  if (referer) headers.Referer = referer;
  const r = await http(`${WP}/wp-json/contact-form-7/v1/contact-forms/${formId}/feedback`, { method: 'POST', body: fd, headers });
  let json = null;
  try {
    json = JSON.parse(r.text);
  } catch {}
  return { ...r, json };
}

function leaks(record) {
  const s = JSON.stringify(record);
  return SENSITIVE.find((v) => s.includes(v)) || (s.includes('203.0.113.77') ? '203.0.113.77' : null);
}

const R_KEYS = ['v', 'rid', 'ts', 'pv', 'path', 'channel', 'source', 'form_id', 'spam', 'spam_reason'];
function checkRequest(c, want, label) {
  check(c.valid === true, `${label}: valid against server-request.schema.json`, c.errors);
  check(c.auth_ok === true, `${label}: Authorization Bearer sk_…`);
  eq(Object.keys(c.body), R_KEYS, `${label}: exactly the §6 keys`);
  for (const [k, v] of Object.entries(want)) eq(c.body[k], v, `${label}: ${k} = ${JSON.stringify(v)}`);
  check(new RegExp(`^cf7:${formId}:${UUID}$`).test(c.body.rid), `${label}: rid cf7:${formId}:<uuid4>`, c.body.rid);
  const leak = leaks(c);
  check(!leak, `${label}: no field values, visitor IP or visitor user agent in the request`, leak);
  check(!String(c.headers['user-agent']).includes('Mozilla'), `${label}: user agent is the plugin's`, c.headers['user-agent']);
}

/** Make every queued item due and run the queue cron event. */
function runQueueNow() {
  wpEval(
    `$q = get_option( 'rate1_connector_queue', array() ); foreach ( $q as &$i ) { $i['next_at'] = time() - 1; } update_option( 'rate1_connector_queue', $q, false );`
  );
  wp('cron', 'event', 'run', 'rate1_connector_process_queue');
}
const queue = () => opt('rate1_connector_queue') || [];
const dropped = () => Number(opt('rate1_connector_dropped') || 0);

// ================================================================ setup
let mockProc = null;
async function ensureMock() {
  try {
    if ((await fetch(`${MOCK}/healthz`)).ok) return console.log('mock collector already running on :4010');
  } catch {}
  const dir = path.join(repo, 'contract', 'mock-collector');
  mockProc = spawn(process.execPath, ['server.mjs'], { cwd: dir, env: { ...process.env, PORT: '4010' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    await sleep(100);
    try {
      if ((await fetch(`${MOCK}/healthz`)).ok) return console.log('mock collector started on :4010');
    } catch {}
  }
  throw new Error('mock collector did not start');
}

async function setup() {
  console.log('Building the zip…');
  run('php', [path.join(pluginRoot, 'build.php')], { stdio: 'inherit' });
  await ensureMock();
  if (!args.has('--reuse')) compose('down', '-v', '--remove-orphans');
  console.log('Starting WordPress (docker compose up)…');
  compose('up', '-d');
  for (let i = 0; i < 120; i++) {
    const r = run('docker', [...composeArgs, 'exec', '-T', 'cli', 'sh', '-c', 'test -f /var/www/html/wp-config.php && wp db check >/dev/null 2>&1'], { allowFail: true });
    if (r.status === 0) break;
    await sleep(1000);
  }
  if (wp('core', 'is-installed', { allowFail: true }).status !== 0) {
    wp('core', 'install', `--url=${WP}`, '--title=Rate1 Test', '--admin_user=admin', `--admin_password=${b62(24)}`, '--admin_email=admin@example.test', '--skip-email');
  }
  wp('rewrite', 'structure', '/%postname%/');
  if (wp('plugin', 'is-installed', 'contact-form-7', { allowFail: true }).status !== 0) wp('plugin', 'install', 'contact-form-7');
  wp('plugin', 'activate', 'contact-form-7');
  formId = Number(
    wpEval(
      `$f = WPCF7_ContactForm::get_template( array( 'title' => 'Contact' ) ); $f->save(); echo $f->id();`
    )
  );
  console.log(`WordPress ${wp('core', 'version')}, Contact Form 7 ${wp('plugin', 'get', 'contact-form-7', '--field=version')}, form id ${formId}`);
}

// ================================================================ tests
async function testActivation() {
  section('Install from the zip and activate (no keys yet)');
  wp('plugin', 'install', `/dist/rate1-connector-${VERSION}.zip`, '--force');
  await mock.reset();
  wp('plugin', 'activate', 'rate1-connector');
  const list = JSON.parse(wp('option', 'list', '--search=rate1_connector_*', '--fields=option_name,autoload', '--format=json'));
  const autoload = Object.fromEntries(list.map((o) => [o.option_name, o.autoload]));
  check(['no', 'off'].includes(autoload.rate1_connector_site_secret), 'site secret option created with autoload off', autoload);
  check(['no', 'off'].includes(autoload.rate1_connector_queue), 'queue option created with autoload off', autoload);
  check(['yes', 'on', 'auto-on', 'auto'].includes(autoload.rate1_connector_site_key), 'site key option autoloaded (read on every page)', autoload);
  eq(opt('rate1_connector_exclude_editors'), '1', 'internal-traffic exclusion on by default');
  eq((await mock.calls('/v1/plugin/hello')).length, 0, 'no hello without a site secret');
  eq(opt('rate1_connector_last_hello')?.error, 'no_secret', 'last hello records "no_secret"');
  const cron = JSON.parse(wp('cron', 'event', 'list', '--fields=hook', '--format=json')).map((e) => e.hook);
  check(cron.includes('rate1_connector_hello'), 'daily hello scheduled');
  const home = await http(`${WP}/`);
  check(!home.text.includes('/v1/r1.js'), 'no tag while no site key is saved');

  section('Keys pasted, re-activation sends the hello');
  wp('option', 'update', 'rate1_connector_site_key', KEY);
  wp('option', 'update', 'rate1_connector_site_secret', SECRET);
  const list2 = JSON.parse(wp('option', 'list', '--search=rate1_connector_site_secret', '--fields=option_name,autoload', '--format=json'));
  check(['no', 'off'].includes(list2[0].autoload), 'secret still autoload off after update');
  wp('plugin', 'deactivate', 'rate1-connector');
  const cron2 = JSON.parse(wp('cron', 'event', 'list', '--fields=hook', '--format=json')).map((e) => e.hook);
  check(!cron2.some((h) => h.startsWith('rate1_connector')), 'deactivation removes cron events');
  await mock.reset();
  wp('plugin', 'activate', 'rate1-connector');
  const hello = await waitCalls('/v1/plugin/hello', 1, 5000);
  eq(hello.length, 1, 'one hello on activation');
  if (hello[0]) {
    check(hello[0].valid, 'activation hello valid against plugin-hello.schema.json', hello[0].errors);
    check(hello[0].auth_ok, 'activation hello: Bearer site secret');
    eq(hello[0].body.head_hook_ok, true, 'activation hello: head_hook_ok true (homepage fetched after activation)');
  }
  eq(opt('rate1_connector_last_hello')?.trigger, 'activation', 'last hello stored (trigger activation)');
}

async function testTag() {
  section('Script tag');
  const home = await http(`${WP}/`);
  const tag = (home.text.match(/<script[^>]*\/v1\/r1\.js[^>]*><\/script>/) || [''])[0];
  check(tag, 'r1.js tag printed for a visitor', home.text.slice(0, 300));
  check(tag.includes(`src="http://host.docker.internal:4010/v1/r1.js"`), 'src = RATE1_CONNECTOR_COLLECT_URL/v1/r1.js, no ?ver=', tag);
  check(tag.includes(`data-site="${KEY}"`), 'data-site = site key', tag);
  check(/\sdefer[\s>]/.test(tag), 'defer attribute', tag);
  const headEnd = home.text.indexOf('</head>');
  check(headEnd > 0 && home.text.indexOf(tag) < headEnd, 'printed inside <head> (wp_head)');
  check(!home.text.includes(SECRET), 'site secret not in the page');
  check(!/set-cookie/i.test([...home.headers.keys()].join(',')), 'no cookies set');
  const post = await http(`${WP}/hello-world/`);
  check(post.text.includes(`data-site="${KEY}"`), 'tag on other front-end pages too (post)');

  const adminCookie = cookieHeader(1);
  const asAdmin = await http(`${WP}/`, { headers: { Cookie: adminCookie } });
  check(asAdmin.text.includes('wp-admin-bar') || asAdmin.text.includes('admin-bar'), 'admin request is logged in (admin bar present)');
  check(!asAdmin.text.includes('/v1/r1.js'), 'no tag for a logged-in administrator (internal traffic)');

  const subId = wp('user', 'create', 'sub', 'sub@example.test', '--role=subscriber', '--porcelain');
  const asSub = await http(`${WP}/`, { headers: { Cookie: cookieHeader(subId) } });
  check(asSub.text.includes(`data-site="${KEY}"`), 'tag for a logged-in subscriber (cannot edit posts)');

  wp('option', 'update', 'rate1_connector_exclude_editors', '0');
  const asAdmin2 = await http(`${WP}/`, { headers: { Cookie: adminCookie } });
  check(asAdmin2.text.includes(`data-site="${KEY}"`), 'setting off → tag for administrators too');
  wp('option', 'update', 'rate1_connector_exclude_editors', '1');
  return { adminCookie, subCookie: cookieHeader(subId) };
}

async function testSettings({ adminCookie, subCookie }) {
  section('Settings page and save');
  const page = await http(`${WP}/wp-admin/options-general.php?page=rate1-connector`, { headers: { Cookie: adminCookie } });
  eq(page.status, 200, 'Settings → Rate 1 loads for an administrator');
  check(page.text.includes(`value="${KEY}"`), 'site key shown');
  check(!page.text.includes(SECRET), 'site secret never printed into the HTML');
  check(/<input type="password" id="rate1_site_secret" name="rate1_site_secret"[^>]*value=""/.test(page.text), 'secret field rendered empty');
  check(page.text.includes('A secret is saved'), 'shows that a secret is saved');
  check(/name="action" value="rate1_connector_connect"/.test(page.text) && /name="rate1_connect_nonce" value="[0-9a-f]+"/.test(page.text) && page.text.includes('Reconnect to Rate 1'), '"Connect to Rate 1" form with its own nonce ("Reconnect" once keys are saved)');
  check(page.text.includes('Waiting for retry') && page.text.includes('Dropped after retries') && page.text.includes('Last hello'), 'status table: last hello, queue size, dropped count');
  const nonce = (page.text.match(/name="_wpnonce" value="([0-9a-f]+)"/) || [])[1];
  check(nonce, 'nonce field present');

  const save = (fields, cookie = adminCookie) =>
    http(`${WP}/wp-admin/admin-post.php`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ action: 'rate1_connector_save', _wpnonce: nonce, _wp_http_referer: '/wp-admin/options-general.php?page=rate1-connector', ...fields }).toString(),
    });

  await mock.reset();
  const r1 = await save({ rate1_site_key: KEY, rate1_site_secret: '', rate1_exclude_editors: '1' });
  eq(r1.status, 302, 'save redirects back');
  check(/rate1_saved=1/.test(r1.headers.get('location') || '') && !/rate1_errors/.test(r1.headers.get('location') || ''), 'redirect says saved, no errors', r1.headers.get('location'));
  eq(opt('rate1_connector_site_secret'), SECRET, 'empty secret field keeps the stored secret');
  const hello = await waitCalls('/v1/plugin/hello', 1, 3000);
  eq(hello.length, 1, 'settings save sends a hello');
  eq(opt('rate1_connector_last_hello')?.trigger, 'settings', 'last hello trigger = settings');
  const after = await http(`${WP}/wp-admin/options-general.php?page=rate1-connector&rate1_saved=1`, { headers: { Cookie: adminCookie } });
  check(after.text.includes('Settings saved.') && /Last hello<\/th>\s*<td>OK,/.test(after.text), 'page shows "Settings saved." and the hello result');

  const r2 = await save({ rate1_site_key: KEY, rate1_site_secret: 'sk_bad', rate1_exclude_editors: '1' });
  check(/rate1_errors=secret/.test(r2.headers.get('location') || ''), 'invalid secret rejected', r2.headers.get('location'));
  eq(opt('rate1_connector_site_secret'), SECRET, 'stored secret unchanged after an invalid one');
  const r3 = await save({ rate1_site_key: 'pk_nope', rate1_site_secret: '', rate1_exclude_editors: '1' });
  check(/rate1_errors=key/.test(r3.headers.get('location') || ''), 'invalid key rejected');
  eq(opt('rate1_connector_site_key'), KEY, 'stored key unchanged after an invalid one');

  const r4 = await save({ _wpnonce: 'bad', rate1_site_key: '', rate1_site_secret: '' });
  check(r4.status === 403 || r4.text.includes('link you followed has expired'), 'bad nonce rejected', r4.status);
  const r5 = await save({ rate1_site_key: '' }, subCookie);
  check(r5.status === 403 || /not allowed/i.test(r5.text), 'subscriber cannot save', r5.status);
  eq(opt('rate1_connector_site_key'), KEY, 'key unchanged by rejected requests');

  section('Connect to Rate 1: start and return (§8)');
  const connectNonce = (page.text.match(/name="rate1_connect_nonce" value="([0-9a-f]+)"/) || [])[1];
  const connect = (cookie = adminCookie) =>
    http(`${WP}/wp-admin/admin-post.php`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ action: 'rate1_connector_connect', rate1_connect_nonce: connectNonce, _wp_http_referer: '/wp-admin/options-general.php?page=rate1-connector' }).toString(),
    });
  const back = (query) => http(`${WP}/wp-admin/admin-post.php?action=rate1_connector_connected&${query}`, { headers: { Cookie: adminCookie } });
  const outcome = (r) => new URL(r.headers.get('location') || 'http://x/').searchParams.get('rate1_connect');

  const go = await connect();
  eq(go.status, 302, 'Connect redirects');
  const to = new URL(go.headers.get('location') || 'http://x/');
  eq(to.origin + to.pathname, 'https://app.bazed.live/connect/wordpress', 'to the dashboard connect page');
  eq(to.searchParams.get('home_url'), WP, 'with home_url');
  eq(to.searchParams.get('return_url'), `${WP}/wp-admin/admin-post.php?action=rate1_connector_connected`, 'with return_url');
  const state = to.searchParams.get('state') || '';
  check(/^[A-Za-z0-9]{32}$/.test(state), 'with a random 32-character state', state);

  eq(outcome(await back('state=wrong&code=' + 'C'.repeat(43))), 'expired', 'wrong state → expired (no exchange)');
  eq(outcome(await back(`state=${state}&code=` + 'C'.repeat(43))), 'expired', 'state is single-use: the wrong attempt used it up');

  const go2 = new URL((await connect()).headers.get('location') || 'http://x/');
  eq(outcome(await back(`state=${go2.searchParams.get('state')}&error=access_denied`)), 'cancelled', 'cancelled in the dashboard → cancelled');
  eq(opt('rate1_connector_site_key'), KEY, 'keys unchanged by cancelled and expired attempts');
  const shown = await http(`${WP}/wp-admin/options-general.php?page=rate1-connector&rate1_connect=cancelled`, { headers: { Cookie: adminCookie } });
  check(shown.text.includes('Connecting was cancelled'), 'settings page shows the outcome');

  const sub = await connect(subCookie);
  check(sub.status === 403 || /not allowed|link you followed has expired/i.test(sub.text), 'subscriber cannot start Connect', sub.status);
}

async function testCf7() {
  section('Contact Form 7 submit → exactly one POST /v1/r');
  await mock.reset();
  const r = await submitCf7();
  eq(r.json?.status, 'mail_sent', 'CF7 accepted the submission (mail_sent)');
  let calls = await waitCalls('/v1/r', 1, 8000);
  await sleep(1500);
  calls = await mock.calls('/v1/r');
  eq(calls.length, 1, 'exactly one /v1/r call');
  if (calls[0]) {
    checkRequest(calls[0], { v: 1, pv: PV, path: '/back-pain', channel: 'form', source: 'cf7', form_id: String(formId), spam: false, spam_reason: null }, 'mail_sent');
    check(Math.abs(calls[0].body.ts - Date.now()) < 60000, 'ts = server Unix ms');
    eq(calls[0].failed_with, undefined, 'collector answered 202');
  }
  eq(queue().length, 0, 'nothing queued');

  section('CF7: invalid r1_pv, no r1_path → Referer path');
  await mock.reset();
  await submitCf7({ r1_pv: 'not-a-token' }, { drop: ['r1_path'], referer: `${WP}/Kontakt/?utm_source=x#top` });
  calls = await waitCalls('/v1/r', 1, 8000);
  if (check(calls.length === 1, 'one call')) {
    eq(calls[0].body.pv, null, 'invalid r1_pv → pv null');
    eq(calls[0].body.path, '/Kontakt', 'path from the normalised same-site Referer');
    check(calls[0].valid, 'valid', calls[0].errors);
  }
  await mock.reset();
  await submitCf7({}, { drop: ['r1_pv', 'r1_path'], referer: 'https://elsewhere.example/landing/' });
  calls = await waitCalls('/v1/r', 1, 8000);
  if (check(calls.length === 1, 'one call (no hidden fields, foreign Referer)')) {
    eq([calls[0].body.pv, calls[0].body.path], [null, null], 'pv and path null');
    check(calls[0].valid, 'valid', calls[0].errors);
  }

  section('CF7 spam verdicts');
  wp('option', 'update', 'disallowed_keys', 'casino-spamword');
  await mock.reset();
  const s1 = await submitCf7({ 'your-message': 'secret-message-4711 casino-spamword' });
  eq(s1.json?.status, 'spam', 'CF7 marks a disallowed word as spam');
  calls = await waitCalls('/v1/r', 1, 8000);
  if (check(calls.length === 1, 'spam submission reported once')) checkRequest(calls[0], { spam: true, spam_reason: 'plugin', pv: PV }, 'spam (disallowed list)');
  wp('option', 'update', 'disallowed_keys', '');

  await mock.reset();
  const s2 = await submitCf7({ 'hp-trap': 'filled-by-bot' });
  eq(s2.json?.status, 'spam', 'honeypot add-on (simulated) marks spam');
  calls = await waitCalls('/v1/r', 1, 8000);
  if (check(calls.length === 1, 'honeypot spam reported once')) checkRequest(calls[0], { spam: true, spam_reason: 'honeypot' }, 'spam (honeypot)');

  await mock.reset();
  const v = await submitCf7({ 'your-email': '' });
  eq(v.json?.status, 'validation_failed', 'missing required field → validation_failed');
  await sleep(2500);
  eq((await mock.calls('/v1/r')).length, 0, 'no call for a failed validation');
}

async function testRetry() {
  section('Retry queue: 2 failures, then success, same rid');
  await mock.reset();
  await mock.fail({ count: 2, status: 503 });
  const d0 = dropped();
  await submitCf7();
  let calls = await waitCalls('/v1/r', 1, 8000);
  await sleep(500);
  eq(calls.length, 1, 'first attempt made');
  let q = queue();
  eq(q.length, 1, '503 → queued');
  eq(q[0]?.attempts, 1, 'attempts = 1');
  check(q[0] && q[0].next_at - Date.now() / 1000 > 50, 'next attempt about 60 s later', q[0]?.next_at);
  const cron = JSON.parse(wp('cron', 'event', 'list', '--fields=hook', '--format=json')).map((e) => e.hook);
  check(cron.includes('rate1_connector_process_queue'), 'queue cron event scheduled');
  runQueueNow();
  q = queue();
  eq([q.length, q[0]?.attempts], [1, 2], 'retry 1 failed → attempts 2');
  runQueueNow();
  calls = await mock.calls('/v1/r');
  eq(calls.length, 3, '3 attempts in total');
  eq(new Set(calls.map((c) => c.body.rid)).size, 1, 'same rid on every attempt');
  eq(new Set(calls.map((c) => JSON.stringify(c.body))).size, 1, 'identical body on every attempt');
  eq(calls.map((c) => c.failed_with ?? 202), [503, 503, 202], 'collector: 503, 503, 202');
  eq(queue().length, 0, 'queue empty after success');
  eq(dropped(), d0, 'nothing dropped');

  section('Retry queue: gives up after 3 retries');
  await mock.reset();
  await mock.fail({ count: 10, status: 503 });
  await submitCf7();
  await waitCalls('/v1/r', 1, 8000);
  await sleep(500);
  runQueueNow();
  runQueueNow();
  runQueueNow();
  calls = await mock.calls('/v1/r');
  eq(calls.length, 4, '1 attempt + 3 retries');
  eq(queue().length, 0, 'removed from the queue');
  eq(dropped(), d0 + 1, 'dropped counter +1');

  section('Permanent error (400) is not retried');
  await mock.reset();
  await mock.fail({ count: 1, status: 400 });
  await submitCf7();
  await waitCalls('/v1/r', 1, 8000);
  await sleep(500);
  eq(queue().length, 0, 'not queued');
  eq(dropped(), d0 + 2, 'counted as dropped');

  section('Slow collector never slows the visitor');
  await mock.reset();
  const base = await submitCf7();
  await waitCalls('/v1/r', 1, 8000); // let the baseline call land before resetting the mock
  await mock.reset();
  await mock.fail({ count: 1, status: 503, delay_ms: 8000 });
  const slow = await submitCf7();
  eq(slow.json?.status, 'mail_sent', 'submission accepted');
  check(slow.ms < base.ms + 1500, `visitor response ${slow.ms} ms with an 8 s collector (baseline ${base.ms} ms)`);
  await sleep(4500);
  q = queue();
  eq([q.length, q[0]?.attempts], [1, 1], 'timed out after 3 s → queued');
  runQueueNow();
  eq(queue().length, 0, 'retry succeeded');
  calls = await mock.calls('/v1/r');
  eq(new Set(calls.map((c) => c.body.rid)).size, 1, 'same rid');

  section('Hosts without fastcgi_finish_request: queue + WP-Cron right away');
  wp('option', 'update', 'rate1_test_no_finish', '1');
  wp('cron', 'event', 'run', '--due-now', { allowFail: true });
  wpEval(`delete_transient( 'doing_cron' );`);
  await mock.reset();
  const nf = await submitCf7();
  eq(nf.json?.status, 'mail_sent', 'submission accepted');
  calls = await waitCalls('/v1/r', 1, 15000);
  eq(calls.length, 1, 'sent by the WP-Cron loopback request (spawn_cron)');
  if (calls[0]) check(calls[0].valid, 'valid', calls[0].errors);
  await sleep(500);
  eq(queue().length, 0, 'queue empty');
  wp('option', 'delete', 'rate1_test_no_finish');
}

async function testHello() {
  section('Daily hello (WP-Cron)');
  await mock.reset();
  wp('cron', 'event', 'run', 'rate1_connector_hello');
  let h = await mock.calls('/v1/plugin/hello');
  eq(h.length, 1, 'one hello');
  const b = h[0]?.body || {};
  check(h[0]?.valid, 'valid against plugin-hello.schema.json', h[0]?.errors);
  check(h[0]?.auth_ok, 'Bearer site secret');
  eq([b.v, b.platform, b.plugin_version], [1, 'wordpress', VERSION], 'v, platform, plugin_version');
  eq(b.wp_version, wp('core', 'version'), 'wp_version');
  check(/^\d+\.\d+$/.test(b.php_version), 'php_version major.minor', b.php_version);
  eq(b.home_url, WP, 'home_url');
  eq(b.theme, wp('option', 'get', 'stylesheet'), 'theme = active theme slug');
  eq([b.head_hook_ok, b.head_hook_error], [true, null], 'head_hook_ok true (homepage fetched on the server)');
  check((b.forms || []).some((f) => f.source === 'cf7' && f.id === String(formId) && f.title === 'Contact'), 'forms lists the CF7 form', b.forms);
  eq([b.cache, b.consent], [[], []], 'no cache or consent plugins');
  check(!JSON.stringify(b).includes(SECRET), 'secret not in the body');

  section('Hello: tag missing on the homepage');
  wp('option', 'update', 'rate1_test_strip_tag', '1');
  await mock.reset();
  wp('cron', 'event', 'run', 'rate1_connector_hello');
  h = await mock.calls('/v1/plugin/hello');
  eq([h[0]?.body.head_hook_ok, h[0]?.body.head_hook_error], [false, 'tag_missing'], 'head_hook_ok false, head_hook_error tag_missing');
  wp('option', 'delete', 'rate1_test_strip_tag');

  section('Hello: WP Rocket (stub) and Borlabs Cookie (stub) detected');
  run('docker', [...composeArgs, 'exec', '-T', 'cli', 'sh', '-c', 'cp -r /fixtures/plugins/wp-rocket /fixtures/plugins/borlabs-cookie /var/www/html/wp-content/plugins/']);
  wp('plugin', 'activate', 'wp-rocket', 'borlabs-cookie');
  await mock.reset();
  wp('cron', 'event', 'run', 'rate1_connector_hello');
  h = await mock.calls('/v1/plugin/hello');
  check(h[0]?.valid, 'valid', h[0]?.errors);
  eq(h[0]?.body.cache, [{ plugin: 'wp-rocket', delay_js: true, r1_excluded: true }], 'cache: wp-rocket, delay_js from get_rocket_option, r1_excluded via its filters');
  eq(h[0]?.body.consent, [{ plugin: 'borlabs-cookie', r1_category: 'unknown' }], 'consent: borlabs-cookie, r1_category unknown');
  const excl = JSON.parse(wpEval(`echo wp_json_encode( array( apply_filters( 'rocket_delay_js_exclusions', array() ), apply_filters( 'rocket_exclude_defer_js', array() ), apply_filters( 'rocket_minify_excluded_external_js', array() ) ) );`));
  eq(excl, [['host.docker.internal:4010/v1/r1.js'], ['host.docker.internal:4010/v1/r1.js'], ['host.docker.internal:4010/v1/r1.js']], 'WP Rocket exclusion filters return the r1.js host+path');
  wp('plugin', 'deactivate', 'wp-rocket', 'borlabs-cookie');
  wp('plugin', 'delete', 'wp-rocket', 'borlabs-cookie');

  section('Hello + page output: real Autoptimize and LiteSpeed Cache');
  wp('plugin', 'install', 'autoptimize', 'litespeed-cache');
  wp('plugin', 'activate', 'autoptimize');
  for (const [k, v] of [['autoptimize_js', 'on'], ['autoptimize_js_aggregate', 'on'], ['autoptimize_js_defer_not_aggregate', ''], ['autoptimize_js_include_inline', 'on']]) wp('option', 'update', k, v);
  wpEval(`if ( class_exists( 'autoptimizeCache' ) ) { autoptimizeCache::clearall(); }`, { allowFail: true });
  let home = await http(`${WP}/?ao=${Date.now()}`);
  let tag = (home.text.match(/<script[^>]*\/v1\/r1\.js[^>]*>/) || [''])[0];
  check(tag.includes(`src="http://host.docker.internal:4010/v1/r1.js"`) && tag.includes(`data-site="${KEY}"`), 'Autoptimize (JS aggregation on): r1.js tag untouched', tag);
  check(/autoptimize_[0-9a-f]+\.(js|php)/.test(home.text), 'Autoptimize is really aggregating other scripts');
  wp('option', 'update', 'autoptimize_js_aggregate', '');
  wp('option', 'update', 'autoptimize_js_defer_not_aggregate', 'on');
  home = await http(`${WP}/?ao2=${Date.now()}`);
  tag = (home.text.match(/<script[^>]*\/v1\/r1\.js[^>]*>/) || [''])[0];
  check(tag && (tag.match(/\sdefer(?=[\s>])/g) || []).length === 1 && tag.includes(`data-site="${KEY}"`), 'Autoptimize (defer, no aggregation): tag kept, single defer', tag);
  // LiteSpeed Cache optimises pages only on a LiteSpeed server; nginx.conf passes
  // X-LSCACHE=on so it believes it is on one. Delay mode only (no combining) first.
  wp('plugin', 'activate', 'litespeed-cache');
  wp('litespeed-option', 'set', 'optm-js_defer', '2');
  wp('litespeed-option', 'set', 'optm-js_comb', '0');
  wp('litespeed-option', 'set', 'optm-js_comb_ext_inl', '0');
  await mock.reset();
  wp('cron', 'event', 'run', 'rate1_connector_hello');
  h = await mock.calls('/v1/plugin/hello');
  check(h[0]?.valid, 'valid', h[0]?.errors);
  const cache = Object.fromEntries((h[0]?.body.cache || []).map((c) => [c.plugin, c]));
  eq(cache.autoptimize, { plugin: 'autoptimize', delay_js: false, r1_excluded: true }, 'cache: autoptimize excluded');
  eq(cache['litespeed-cache'], { plugin: 'litespeed-cache', delay_js: true, r1_excluded: true }, 'cache: litespeed-cache, delay_js true (optm-js_defer = 2), excluded');
  eq(h[0]?.body.head_hook_ok, true, 'head_hook_ok still true with both active');
  wp('plugin', 'deactivate', 'autoptimize');

  const r1Tag = (html) => (html.match(/<script[^>]*\/v1\/r1\.js[^>]*>/) || [''])[0];
  const lsDelayed = (html) => (html.match(/<script[^>]*>/g) || []).some((t) => t.includes('litespeed/javascript') && t.includes('contact-form-7'));
  home = await http(`${WP}/`);
  tag = r1Tag(home.text);
  check(lsDelayed(home.text), 'LiteSpeed delay mode really runs (CF7 scripts become type="litespeed/javascript")');
  check(tag.includes(`src="http://host.docker.internal:4010/v1/r1.js"`) && !/litespeed\/javascript/.test(tag) && tag.includes(`data-site="${KEY}"`), 'LiteSpeed delay mode: r1.js not delayed', tag);

  // Negative control: without our exclusion filters LiteSpeed delays r1.js.
  wp('option', 'update', 'rate1_test_no_exclusions', '1');
  home = await http(`${WP}/`);
  tag = r1Tag(home.text);
  check(/type="litespeed\/javascript"/.test(tag) && /data-src="http:\/\/host\.docker\.internal:4010\/v1\/r1\.js"/.test(tag), 'control: with our exclusion filters removed, LiteSpeed delays r1.js', tag);
  await mock.reset();
  wp('cron', 'event', 'run', 'rate1_connector_hello');
  h = await mock.calls('/v1/plugin/hello');
  eq((h[0]?.body.cache || []).map((c) => `${c.plugin}:${c.r1_excluded}`), ['litespeed-cache:false'], 'control: hello then reports r1_excluded false');
  wp('option', 'delete', 'rate1_test_no_exclusions');

  // Combine JS incl. external scripts: r1.js must stay a separate, untouched tag.
  wp('litespeed-option', 'set', 'optm-js_comb', '1');
  wp('litespeed-option', 'set', 'optm-js_comb_ext_inl', '1');
  home = await http(`${WP}/`);
  tag = r1Tag(home.text);
  check(/\/wp-content\/litespeed\/js\/[0-9a-f]+\.js/.test(home.text), 'LiteSpeed combine mode really runs (combined bundle in the page)');
  check(tag.includes(`src="http://host.docker.internal:4010/v1/r1.js"`) && tag.includes(`data-site="${KEY}"`) && !/litespeed\/javascript/.test(tag), 'LiteSpeed combine + delay: r1.js kept as its own tag, not delayed', tag);

  wp('plugin', 'deactivate', 'litespeed-cache');
  wp('plugin', 'uninstall', 'autoptimize', 'litespeed-cache', { allowFail: true });
}

async function testUninstall() {
  section('Uninstall removes options, cron events and the queue');
  await mock.reset();
  await mock.fail({ count: 5, status: 503 });
  await submitCf7();
  await waitCalls('/v1/r', 1, 8000);
  await sleep(500);
  check(queue().length === 1, 'an item is waiting in the retry queue');
  wp('plugin', 'deactivate', 'rate1-connector');
  wp('cron', 'event', 'schedule', 'rate1_connector_process_queue', '+1 hour');
  wp('cron', 'event', 'schedule', 'rate1_connector_hello', '+1 hour');
  wp('plugin', 'uninstall', 'rate1-connector');
  const left = JSON.parse(wp('option', 'list', '--search=rate1_connector_*', '--format=json'));
  eq(left.map((o) => o.option_name), [], 'no rate1_connector_* options left');
  const cron = JSON.parse(wp('cron', 'event', 'list', '--fields=hook', '--format=json')).map((e) => e.hook);
  check(!cron.some((h) => h.startsWith('rate1_connector')), 'no rate1_connector cron events left', cron);
  eq(wp('plugin', 'is-installed', 'rate1-connector', { allowFail: true }).status, 1, 'plugin files deleted');
  const home = await http(`${WP}/`);
  check(!home.text.includes('/v1/r1.js'), 'tag gone');
}

async function testPluginCheck() {
  section('Plugin Check (official plugin, WP-CLI)');
  wp('plugin', 'install', `/dist/rate1-connector-${VERSION}.zip`, '--force');
  if (wp('plugin', 'is-installed', 'plugin-check', { allowFail: true }).status !== 0) wp('plugin', 'install', 'plugin-check');
  wp('plugin', 'activate', 'plugin-check');
  // All checks incl. experimental and runtime ones (cli.php), low-severity findings included.
  const r = wp(
    'plugin',
    'check',
    'rate1-connector',
    '--format=json',
    '--include-experimental',
    '--include-low-severity-errors',
    '--include-low-severity-warnings',
    '--require=./wp-content/plugins/plugin-check/cli.php',
    { allowFail: true }
  );
  const out = r.stdout + r.stderr;
  fs.writeFileSync(path.join(here, 'plugin-check-output.txt'), out);
  const items = [];
  for (const m of out.matchAll(/^\[.*\]$/gm)) {
    try {
      items.push(...JSON.parse(m[0]));
    } catch {}
  }
  const errors = items.filter((i) => i.type === 'ERROR');
  const warnings = items.filter((i) => i.type === 'WARNING');
  check(/Checks complete|No errors found|\[/.test(out) || out.trim() === '', 'Plugin Check ran', out.slice(0, 500));
  eq(errors.map((e) => `${e.code}: ${e.message}`), [], `Plugin Check: no errors (${warnings.length} warnings, see tests/plugin-check-output.txt)`);
  for (const w of warnings) console.log(`       warning ${w.code}: ${String(w.message).slice(0, 160)}`);
  wp('plugin', 'deactivate', 'plugin-check');
}

// ================================================================ main
let exitCode = 0;
try {
  await setup();
  await testActivation();
  const cookies = await testTag();
  await testSettings(cookies);
  await testCf7();
  await testRetry();
  await testHello();
  await testUninstall();
  if (!args.has('--skip-plugin-check')) await testPluginCheck();
} catch (e) {
  console.error('\nRUNNER ERROR:', e.stack || e);
  results.push({ group: 'runner', msg: String(e.message || e), ok: false });
} finally {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  for (const f of failed) console.log(`  FAIL [${f.group}] ${f.msg}`);
  fs.writeFileSync(path.join(here, 'integration-results.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  exitCode = failed.length ? 1 : 0;
  if (!args.has('--keep')) {
    console.log('\nStopping containers (docker compose down -v)…');
    compose('down', '-v', '--remove-orphans');
  }
  if (mockProc) mockProc.kill();
}
process.exit(exitCode);
