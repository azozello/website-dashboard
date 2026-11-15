import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import Ajv2020 from 'ajv/dist/2020.js';
import { vi, expect } from 'vitest';
import { init, type Config } from '../src/tracker';

export const KEY = 'pk_3fK9sQ2LmV7xYp1aB8cD4eFg';
export const BASE = 'https://collect.test';
const schemaDir = path.resolve(__dirname, '../../contract/v1');

const ajv = new Ajv2020({ allErrors: true, strict: false });
for (const f of fs.readdirSync(schemaDir).filter((f) => f.endsWith('.schema.json')))
  ajv.addSchema(JSON.parse(fs.readFileSync(path.join(schemaDir, f), 'utf8')), f);
export const validateEnvelope = ajv.getSchema('event-envelope.schema.json')!;

export function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, rel), 'utf8')) as T;
}

export interface Opts {
  url?: string;
  body?: string;
  referrer?: string;
  consent?: boolean;
  config?: Config | null;
  configFails?: boolean;
  beacon?: 'ok' | 'false' | 'throws' | 'missing';
  scriptSrc?: string;
  key?: string;
}

export interface Sent {
  via: 'beacon' | 'fetch';
  url: string;
  init?: RequestInit;
  body: { v: number; k: string; wd: boolean; test: boolean; ev: Record<string, any>[] };
}

/**
 * Builds a fresh jsdom page with the r1.js tag, stubs transport, and starts the
 * tracker with fake timers. Every envelope sent is checked against the strict
 * contract schema.
 */
export async function setup(o: Opts = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><head><title>Back pain treatment</title>
<script defer src="${o.scriptSrc ?? BASE + '/v1/r1.js'}" data-site="${o.key ?? KEY}"${o.consent ? ' data-consent="required"' : ''}></script>
</head><body>${o.body ?? ''}</body></html>`,
    { url: o.url ?? 'https://site.example/Back-Pain/?utm_source=google&utm_medium=cpc&gclid=abc#top', referrer: o.referrer, pretendToBeVisual: true },
  );
  const win = dom.window as unknown as Window & typeof globalThis & { r1?: any };
  const doc = win.document;
  if (doc.readyState != 'complete') await new Promise((r) => win.addEventListener('load', r));

  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-11-15T10:00:00Z'));

  const sent: Sent[] = [];
  const record = (via: Sent['via'], url: string, body: string, init?: RequestInit) => {
    const parsed = JSON.parse(body);
    const ok = validateEnvelope(parsed);
    expect(ok, JSON.stringify(validateEnvelope.errors)).toBe(true);
    sent.push({ via, url, init, body: parsed });
  };
  const nav = win.navigator as any;
  if (o.beacon != 'missing')
    nav.sendBeacon = vi.fn((url: string, body: string) => {
      if (o.beacon == 'throws') throw new Error('beacon boom');
      if (o.beacon == 'false') return false;
      expect(typeof body).toBe('string');
      record('beacon', url, body);
      return true;
    });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/v1/config/')) {
      if (o.configFails) throw new TypeError('network');
      return { ok: true, status: 200, json: async () => o.config ?? { v: 1, config_version: 0, spa: 'auto', sections: [], booking_paths: [], forms_browser: [] } };
    }
    record('fetch', url, init!.body as string, init);
    return { ok: true, status: 204 };
  });
  (win as any).fetch = fetchMock;

  const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m));
  const winConsole = (win as any).console;
  const winConsoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(winConsole, m));

  // jsdom can't navigate; stop link clicks after r1.js (capture phase) saw them.
  doc.addEventListener('click', (e) => e.preventDefault());

  init(win, doc.querySelector('script[data-site]'));
  await vi.advanceTimersByTimeAsync(0); // config promise

  const events = () => sent.flatMap((s) => s.body.ev);
  const ofType = (t: string) => events().filter((e) => e.type == t);
  return {
    dom,
    win,
    doc,
    sent,
    fetchMock,
    events,
    ofType,
    /** Advance time; flush timers and microtasks. */
    tick: (ms: number) => vi.advanceTimersByTimeAsync(ms),
    /** Time passes and the queue flush timer fires. */
    flush: () => vi.advanceTimersByTimeAsync(1100),
    setHidden(h: boolean) {
      Object.defineProperty(doc, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
      doc.dispatchEvent(new win.Event('visibilitychange'));
    },
    pagehide: () => win.dispatchEvent(new win.Event('pagehide')),
    interact: () => win.dispatchEvent(new win.Event('pointerdown')),
    click(el: Element) {
      el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    },
    setScroll(scrollY: number, height: number) {
      Object.defineProperty(doc.documentElement, 'scrollHeight', { configurable: true, get: () => height });
      Object.defineProperty(win, 'scrollY', { configurable: true, get: () => scrollY });
      win.dispatchEvent(new win.Event('scroll'));
    },
    rect(el: Element, top: number, height: number) {
      (el as any).getBoundingClientRect = () => ({ top, bottom: top + height, height, left: 0, right: 800, width: 800, x: 0, y: top, toJSON() {} });
    },
    consoleCalls: () => [...consoleSpies, ...winConsoleSpies].reduce((n, s) => n + s.mock.calls.length, 0),
  };
}
