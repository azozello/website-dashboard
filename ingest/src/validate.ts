/**
 * Receiver-side validation. Lenient where the contract says so (§1: ignore
 * unknown fields; §4: drop unknown event types, truncate strings to their
 * limits), strict on identifiers and types: a 400 names the first bad field.
 */
import { trunc } from './util.js';

export class Invalid extends Error {
  constructor(public field: string) {
    super('invalid ' + field);
  }
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);
const PV = /^[0-9A-Za-z]{16}$/;
const EID = /^[0-9A-Za-z]{8}$/;
export const SITE_KEY = /^pk_[0-9A-Za-z]{24}$/;

function str(o: Record<string, unknown>, k: string, field: string, max: number, opts: { optional?: boolean; nullable?: boolean; min?: number } = {}) {
  const v = o[k];
  if (v === undefined && opts.optional) return undefined;
  if (v === null && opts.nullable) return null;
  if (typeof v !== 'string' || v.length < (opts.min ?? 0)) throw new Invalid(field);
  return trunc(v, max);
}
function oneOf<T extends string>(o: Record<string, unknown>, k: string, field: string, allowed: readonly T[]): T {
  const v = o[k];
  if (typeof v !== 'string' || !allowed.includes(v as T)) throw new Invalid(field);
  return v as T;
}
function int(o: Record<string, unknown>, k: string, field: string, min: number, max: number, opts: { nullable?: boolean; clamp?: boolean } = {}) {
  const v = o[k];
  if (v === null && opts.nullable) return null;
  if (!isInt(v)) throw new Invalid(field);
  if (v < min || v > max) {
    if (!opts.clamp) throw new Invalid(field);
    return Math.min(max, Math.max(min, v));
  }
  return v;
}
function path(o: Record<string, unknown>, k: string, field: string, nullable = false) {
  const v = o[k];
  if ((v === null || v === undefined) && nullable) return null;
  if (typeof v !== 'string' || v[0] !== '/') throw new Invalid(field);
  return trunc(v, 512);
}

// ---------------------------------------------------------------- §4 events
export interface Base {
  eid: string;
  pv: string;
  path: string;
  ts: number;
}
export type Event =
  | (Base & {
      type: 'pageview';
      nav: 'load' | 'spa';
      ref: string | null;
      utm: Record<string, string>;
      clid: string[];
      title: string | null;
      vw: number | null;
      load_ms: number | null;
    })
  | (Base & { type: 'engage'; active_ms: number; scroll: number; sections: string[]; final: boolean })
  | (Base & { type: 'click'; kind: 'call' | 'whatsapp' | 'email' | 'booking_cta'; label: string | null })
  | (Base & { type: 'step'; flow: 'booking' | 'calculator'; flow_id: string; step: number; name: string | null })
  | (Base & { type: 'form_ok'; form: string });

export interface Envelope {
  k: string;
  wd: boolean;
  test: boolean;
  ev: Event[];
}

const TYPES = ['pageview', 'engage', 'click', 'step', 'form_ok'] as const;
const DAY_MS = 86_400_000;

export function parseEnvelope(raw: unknown): Envelope {
  if (!isObj(raw)) throw new Invalid('body');
  if (raw.v !== 1) throw new Invalid('v');
  if (typeof raw.k !== 'string' || !SITE_KEY.test(raw.k)) throw new Invalid('k');
  if (typeof raw.wd !== 'boolean') throw new Invalid('wd');
  if (typeof raw.test !== 'boolean') throw new Invalid('test');
  if (!Array.isArray(raw.ev) || raw.ev.length < 1 || raw.ev.length > 25) throw new Invalid('ev');
  const ev: Event[] = [];
  raw.ev.forEach((e: unknown, i: number) => {
    const f = (k: string) => `ev[${i}].${k}`;
    if (!isObj(e)) throw new Invalid(`ev[${i}]`);
    if (typeof e.type !== 'string' || !(TYPES as readonly string[]).includes(e.type)) return; // unknown type: drop
    if (typeof e.eid !== 'string' || !EID.test(e.eid)) throw new Invalid(f('eid'));
    if (typeof e.pv !== 'string' || !PV.test(e.pv)) throw new Invalid(f('pv'));
    const base: Base = { eid: e.eid, pv: e.pv, path: path(e, 'path', f('path'))!, ts: int(e, 'ts', f('ts'), 0, Number.MAX_SAFE_INTEGER) as number };
    switch (e.type as (typeof TYPES)[number]) {
      case 'pageview': {
        const utm: Record<string, string> = {};
        if (e.utm !== undefined && !isObj(e.utm)) throw new Invalid(f('utm'));
        for (const k of ['source', 'medium', 'campaign', 'term', 'content'])
          if (isObj(e.utm) && typeof e.utm[k] === 'string' && e.utm[k]) utm[k] = trunc(e.utm[k] as string, 100);
        let ref = str(e, 'ref', f('ref'), 255, { nullable: true, optional: true }) ?? null;
        if (ref) ref = ref.replace(/^[a-z][a-z\d+.-]*:\/\//i, '').split(/[/?#]/)[0] || null; // host only, whatever we got
        ev.push({
          type: 'pageview',
          ...base,
          nav: oneOf(e, 'nav', f('nav'), ['load', 'spa'] as const),
          ref,
          utm,
          clid: Array.isArray(e.clid) ? ['gclid', 'fbclid', 'msclkid'].filter((c) => (e.clid as unknown[]).includes(c)) : [],
          title: str(e, 'title', f('title'), 200, { optional: true, nullable: true }) ?? null,
          vw: e.vw === undefined ? null : int(e, 'vw', f('vw'), 0, 100_000, { nullable: true }),
          load_ms: e.load_ms === undefined ? null : int(e, 'load_ms', f('load_ms'), 0, 10 * 60_000, { nullable: true, clamp: true }),
        });
        break;
      }
      case 'engage': {
        if (!Array.isArray(e.sections)) throw new Invalid(f('sections'));
        const sections = [...new Set(e.sections.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => trunc(s.trim(), 60)))].slice(0, 20);
        if (typeof e.final !== 'boolean') throw new Invalid(f('final'));
        ev.push({
          type: 'engage',
          ...base,
          active_ms: int(e, 'active_ms', f('active_ms'), 0, DAY_MS, { clamp: true })!,
          scroll: int(e, 'scroll', f('scroll'), 0, 100, { clamp: true })!,
          sections,
          final: e.final,
        });
        break;
      }
      case 'click':
        ev.push({
          type: 'click',
          ...base,
          kind: oneOf(e, 'kind', f('kind'), ['call', 'whatsapp', 'email', 'booking_cta'] as const),
          label: str(e, 'label', f('label'), 60, { optional: true, nullable: true }) || null,
        });
        break;
      case 'step':
        ev.push({
          type: 'step',
          ...base,
          flow: oneOf(e, 'flow', f('flow'), ['booking', 'calculator'] as const),
          flow_id: str(e, 'flow_id', f('flow_id'), 60, { min: 1 })!,
          step: int(e, 'step', f('step'), 1, 20)!,
          name: str(e, 'name', f('name'), 60, { optional: true, nullable: true }) || null,
        });
        break;
      case 'form_ok':
        ev.push({ type: 'form_ok', ...base, form: str(e, 'form', f('form'), 100, { min: 1 })! });
        break;
    }
  });
  return { k: raw.k, wd: raw.wd, test: raw.test, ev };
}

// ---------------------------------------------------------------- §6 server request
export interface ServerRequest {
  rid: string;
  ts: number;
  pv: string | null;
  path: string | null;
  channel: 'form' | 'booking' | 'calculator';
  source: 'cf7' | 'elementor' | 'wpforms' | 'gravity' | 'custom';
  form_id: string;
  spam: boolean;
  spam_reason: 'honeypot' | 'plugin' | 'too_fast' | null;
}

export function parseServerRequest(raw: unknown): ServerRequest {
  if (!isObj(raw)) throw new Invalid('body');
  if (raw.v !== 1) throw new Invalid('v');
  if (typeof raw.rid !== 'string' || !raw.rid || raw.rid.length > 120) throw new Invalid('rid');
  if (raw.pv !== null && raw.pv !== undefined && (typeof raw.pv !== 'string' || !PV.test(raw.pv))) throw new Invalid('pv');
  if (typeof raw.spam !== 'boolean') throw new Invalid('spam');
  const sr = raw.spam_reason ?? null;
  if (sr !== null && !['honeypot', 'plugin', 'too_fast'].includes(sr as string)) throw new Invalid('spam_reason');
  return {
    rid: raw.rid,
    ts: int(raw, 'ts', 'ts', 0, Number.MAX_SAFE_INTEGER)!,
    pv: (raw.pv as string | null | undefined) ?? null,
    path: path(raw, 'path', 'path', true),
    channel: oneOf(raw, 'channel', 'channel', ['form', 'booking', 'calculator'] as const),
    source: oneOf(raw, 'source', 'source', ['cf7', 'elementor', 'wpforms', 'gravity', 'custom'] as const),
    form_id: str(raw, 'form_id', 'form_id', 100, { min: 1 })!,
    spam: raw.spam,
    spam_reason: sr as ServerRequest['spam_reason'],
  };
}

// ---------------------------------------------------------------- §7 Wix webhook
/** Keeps only `form` and `submission_id`; everything else is discarded unread. */
export function parseWebhook(raw: unknown): { form: string; submission_id: string | null } {
  if (!isObj(raw)) throw new Invalid('body');
  const form = raw.form;
  if ((typeof form !== 'string' && typeof form !== 'number') || String(form).trim() === '') throw new Invalid('form');
  const sid = raw.submission_id;
  const submission_id = (typeof sid === 'string' || typeof sid === 'number') && String(sid).trim() !== '' ? trunc(String(sid).trim(), 120) : null;
  return { form: trunc(String(form).trim(), 100), submission_id };
}

// ---------------------------------------------------------------- §8 hello
export function parseHello(raw: unknown): { platform: string; plugin_version: string | null; env: Record<string, unknown> } {
  if (!isObj(raw)) throw new Invalid('body');
  if (raw.v !== 1) throw new Invalid('v');
  if (typeof raw.platform !== 'string' || !raw.platform) throw new Invalid('platform');
  if (raw.plugin_version !== undefined && typeof raw.plugin_version !== 'string') throw new Invalid('plugin_version');
  return { platform: trunc(raw.platform, 40), plugin_version: raw.plugin_version ? trunc(raw.plugin_version, 40) : null, env: raw };
}
