import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { device, isBot, sourceChannel } from '../src/classify.js';
import { makeClientIp } from '../src/clientip.js';
import { Invalid, parseEnvelope, parseServerRequest, parseWebhook } from '../src/validate.js';
import { base62, normalisePath, trunc } from '../src/util.js';
import { UA_DESKTOP, UA_IPHONE } from './helpers.js';

const vectors = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../contract/v1/path-normalisation.json'), 'utf8')).cases as [string, string][];

describe('path normalisation (shared vectors)', () => {
  it.each(vectors)('%j → %j', (i, o) => expect(normalisePath(i)).toBe(o));
});

describe('ids', () => {
  it('base62 of the requested length', () => {
    for (const n of [8, 16, 24, 40]) expect(base62(n)).toMatch(new RegExp(`^[0-9A-Za-z]{${n}}$`));
  });
  it('trunc never splits a surrogate pair', () => expect(trunc('ab😀', 3)).toBe('ab'));
});

describe('source channel (§9, first match wins)', () => {
  const sc = (utm: Record<string, string>, clid: string[], ref: string | null) => sourceChannel(utm, clid, ref);
  it.each([
    [{}, ['gclid'], 'www.google.com', 'google_ads', 'www.google.com'],
    [{ source: 'google', medium: 'cpc' }, [], null, 'google_ads', 'google'],
    [{ source: 'Google', medium: 'PPC' }, [], null, 'google_ads', 'Google'],
    [{ source: 'google', medium: 'organic' }, [], null, 'campaign', 'google'],
    [{ source: 'newsletter' }, [], 'www.google.de', 'campaign', 'newsletter'],
    [{}, [], 'www.google.co.uk', 'google_organic', 'www.google.co.uk'],
    [{}, [], 'google.de', 'google_organic', 'google.de'],
    [{}, [], 'www.bing.com', 'other_search', 'www.bing.com'],
    [{}, [], 'duckduckgo.com', 'other_search', 'duckduckgo.com'],
    [{}, [], 'www.ecosia.org', 'other_search', 'www.ecosia.org'],
    [{}, [], 'de.search.yahoo.com', 'other_search', 'de.search.yahoo.com'],
    [{}, [], 'l.facebook.com', 'social', 'l.facebook.com'],
    [{}, [], 't.co', 'social', 't.co'],
    [{}, [], 'www.linkedin.com', 'social', 'www.linkedin.com'],
    [{}, [], 'm.youtube.com', 'social', 'm.youtube.com'],
    [{}, [], 'jameda.de', 'referral', 'jameda.de'],
    [{}, [], 'notgoogle.com', 'referral', 'notgoogle.com'],
    [{}, ['fbclid'], null, 'direct', null],
  ] as const)('%j %j %j → %s', (utm, clid, ref, channel, detail) => expect(sc(utm as never, [...clid], ref)).toEqual({ channel, detail }));
});

describe('device and bots', () => {
  it('device from UA, viewport only as fallback', () => {
    expect(device(UA_DESKTOP, 400)).toBe('desktop');
    expect(device(UA_IPHONE)).toBe('mobile');
    expect(device('Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/140 Safari/537.36')).toBe('tablet');
    expect(device('Mozilla/5.0 (Linux; Android 14; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36')).toBe('mobile');
    expect(device('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('tablet');
    expect(device('SomethingUnknown/1.0', 390)).toBe('mobile');
    expect(device('SomethingUnknown/1.0', 800)).toBe('tablet');
    expect(device('SomethingUnknown/1.0', 1440)).toBe('desktop');
  });
  it('bots', () => {
    for (const ua of ['Googlebot/2.1 (+http://www.google.com/bot.html)', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'facebookexternalhit/1.1', 'curl/8.5.0', 'python-requests/2.32', 'Mozilla/5.0 HeadlessChrome/140', 'Chrome-Lighthouse', ''])
      expect(isBot(ua), ua).toBe(true);
    for (const ua of [UA_DESKTOP, UA_IPHONE]) expect(isBot(ua)).toBe(false);
  });
});

describe('client IP (§2)', () => {
  const ip = makeClientIp(['10.0.0.0/8', '::1/128'], 'x-forwarded-for');
  it('trusts the header only from a trusted proxy, and takes the rightmost untrusted hop', () => {
    expect(ip('10.1.2.3', { 'x-forwarded-for': '1.1.1.1, 203.0.113.9' })).toBe('203.0.113.9');
    expect(ip('10.1.2.3', { 'x-forwarded-for': '203.0.113.9, 10.0.0.5' })).toBe('203.0.113.9');
    expect(ip('198.51.100.2', { 'x-forwarded-for': '203.0.113.9' })).toBe('198.51.100.2');
    expect(ip('::ffff:10.0.0.1', { 'x-forwarded-for': '2001:db8::1' })).toBe('2001:db8::1');
    expect(ip('10.0.0.1', {})).toBe('10.0.0.1');
    expect(ip('10.0.0.1', { 'x-forwarded-for': 'garbage' })).toBe('10.0.0.1');
  });
  it('CF-Connecting-IP style single-value header', () => {
    const cf = makeClientIp(['172.16.0.0/12'], 'cf-connecting-ip');
    expect(cf('172.18.0.4', { 'cf-connecting-ip': '203.0.113.50' })).toBe('203.0.113.50');
  });
});

describe('validation', () => {
  const base = { eid: 'a1B2c3D4', pv: 'Qm7Xk2Lp9Rt4Vb8N', path: '/x', ts: 1 };
  const env = (ev: unknown[]) => ({ v: 1, k: 'pk_3fK9sQ2LmV7xYp1aB8cD4eFg', wd: false, test: false, ev });
  const field = (f: () => unknown) => {
    try {
      f();
    } catch (e) {
      return (e as Invalid).field;
    }
    return null;
  };
  it('names the bad field', () => {
    expect(field(() => parseEnvelope({ ...env([]), v: 2 }))).toBe('v');
    expect(field(() => parseEnvelope({ ...env([]), k: 'pk_x' }))).toBe('k');
    expect(field(() => parseEnvelope(env([])))).toBe('ev');
    expect(field(() => parseEnvelope(env(Array(26).fill({ ...base, type: 'click', kind: 'call' }))))).toBe('ev');
    expect(field(() => parseEnvelope(env([{ ...base, type: 'click', kind: 'fax' }])))).toBe('ev[0].kind');
    expect(field(() => parseEnvelope(env([{ type: 'click', kind: 'call' }, { ...base, pv: 'short', type: 'click', kind: 'call' }])))).toBe('ev[0].eid');
    expect(field(() => parseEnvelope(env([{ ...base, path: 'no-slash', type: 'form_ok', form: 'x' }])))).toBe('ev[0].path');
  });
  it('drops unknown event types, truncates strings, keeps the referrer host only', () => {
    const r = parseEnvelope(
      env([
        { ...base, type: 'heartbeat' },
        { ...base, type: 'pageview', nav: 'load', ref: 'https://www.google.com/search?q=secret', utm: { source: 'x'.repeat(150), foo: 'bar' }, clid: ['gclid', 'evil'], title: 't'.repeat(300), vw: 390, load_ms: null, extra: 'ignored' },
      ]),
    );
    expect(r.ev).toHaveLength(1);
    const pv = r.ev[0] as Extract<(typeof r.ev)[0], { type: 'pageview' }>;
    expect(pv.ref).toBe('www.google.com');
    expect(pv.utm).toEqual({ source: 'x'.repeat(100) });
    expect(pv.clid).toEqual(['gclid']);
    expect(pv.title).toHaveLength(200);
    expect(pv).not.toHaveProperty('extra');
  });
  it('server request: strict ids, unknown fields ignored', () => {
    const ok = { v: 1, rid: 'r1', ts: 1, pv: null, path: null, channel: 'form', source: 'cf7', form_id: '12', spam: false, spam_reason: null, email: 'a@b.c' };
    expect(parseServerRequest(ok)).not.toHaveProperty('email');
    expect(field(() => parseServerRequest({ ...ok, pv: 'x' }))).toBe('pv');
    expect(field(() => parseServerRequest({ ...ok, rid: 'r'.repeat(121) }))).toBe('rid');
    expect(field(() => parseServerRequest({ ...ok, source: 'typeform' }))).toBe('source');
    expect(field(() => parseServerRequest({ ...ok, spam_reason: 'akismet' }))).toBe('spam_reason');
  });
  it('webhook keeps only form and submission_id', () => {
    expect(parseWebhook({ form: 'Kontakt', submission_id: 'abc', email: 'max@example.com', phone: '0170' })).toEqual({ form: 'Kontakt', submission_id: 'abc' });
    expect(parseWebhook({ form: 'Kontakt' })).toEqual({ form: 'Kontakt', submission_id: null });
    expect(field(() => parseWebhook({ email: 'x' }))).toBe('form');
  });
});
