import { describe, expect, it } from 'vitest';
import { normalisePath } from '../src/path';
import { readJson } from './helpers';

const { cases } = readJson<{ cases: [string, string][] }>('../../contract/v1/path-normalisation.json');

describe('normalisePath (contract §1, shared vectors)', () => {
  it.each(cases)('%j → %j', (input, expected) => {
    expect(normalisePath(input)).toBe(expected);
  });

  it('truncates to 512 characters', () => {
    expect(normalisePath('/' + 'a'.repeat(600))).toHaveLength(512);
  });

  it('is a pure function (no state between calls)', () => {
    expect(normalisePath('/x/')).toBe('/x');
    expect(normalisePath('/x/')).toBe('/x');
  });
});
