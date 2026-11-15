/**
 * fixtures/v1 (contract §13): every valid fixture passes the strict sender
 * schema and is accepted by ingest; every invalid one is rejected by both, and
 * ingest names the expected field.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { Invalid, parseEnvelope, parseHello, parseServerRequest, parseWebhook } from '../src/validate.js';

const root = path.resolve(__dirname, '../..');
const ajv = new Ajv2020({ allErrors: true, strict: false });
for (const f of fs.readdirSync(path.join(root, 'contract/v1')).filter((f) => f.endsWith('.schema.json')))
  ajv.addSchema(JSON.parse(fs.readFileSync(path.join(root, 'contract/v1', f), 'utf8')), f);

interface Case {
  name: string;
  body: unknown;
  field?: string;
  stored?: unknown;
}
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(root, 'fixtures/v1', f), 'utf8')) as { valid: Case[]; invalid?: Case[]; sender_violations?: Case[] };
const fieldOf = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof Invalid) return e.field;
    throw e;
  }
};

const suites: [string, string, (b: unknown) => unknown][] = [
  ['events.json', 'event-envelope.schema.json', parseEnvelope],
  ['server-requests.json', 'server-request.schema.json', parseServerRequest],
  ['wix-webhooks.json', 'wix-webhook.schema.json', parseWebhook],
  ['plugin-hello.json', 'plugin-hello.schema.json', parseHello],
];

describe.each(suites)('fixtures/v1/%s', (file, schema, parse) => {
  const fx = load(file);
  const validate = ajv.getSchema(schema)!;
  it.each(fx.valid.map((c) => [c.name, c] as const))('valid: %s', (_n, c) => {
    expect(validate(c.body), JSON.stringify(validate.errors)).toBe(true);
    expect(fieldOf(() => parse(c.body))).toBeNull();
    if (c.stored) expect(parse(c.body)).toEqual(c.stored);
  });
  it.each((fx.invalid ?? []).map((c) => [c.name, c] as const))('invalid: %s', (_n, c) => {
    expect(validate(c.body)).toBe(false);
    expect(fieldOf(() => parse(c.body))).toBe(c.field);
  });
  it.each((fx.sender_violations ?? []).map((c) => [c.name, c] as const))('sender violation: %s', (_n, c) => {
    expect(validate(c.body)).toBe(false); // the strict schema catches the sender
    const parsed = parse(c.body); // ingest stays lenient and drops the extras
    if (c.stored) expect(parsed).toEqual(c.stored);
    expect(JSON.stringify(parsed)).not.toMatch(/max@example\.com|1234567|Rückenschmerzen/);
  });
});

it('site-config fixtures match the config schema', () => {
  const validate = ajv.getSchema('site-config.schema.json')!;
  for (const c of load('site-config.json').valid) expect(validate(c.body), c.name).toBe(true);
});
