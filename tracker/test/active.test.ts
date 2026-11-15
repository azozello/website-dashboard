import { describe, expect, it } from 'vitest';
import { activeTimer, IDLE_MS } from '../src/active';

function clock() {
  let t = 1_000_000;
  return { now: () => t, go: (ms: number) => (t += ms) };
}

describe('active time (tab visible and an interaction in the last 30 s)', () => {
  it('counts the 30 s after page start, then stops without interaction', () => {
    const c = clock();
    const a = activeTimer(c.now);
    a.reset(true);
    c.go(10_000);
    expect(a.ms()).toBe(10_000);
    c.go(60_000);
    expect(a.ms()).toBe(IDLE_MS);
  });

  it('extends with interactions', () => {
    const c = clock();
    const a = activeTimer(c.now);
    a.reset(true);
    c.go(20_000);
    a.poke();
    c.go(20_000);
    a.poke();
    c.go(50_000); // only 30 s of this counts
    expect(a.ms()).toBe(20_000 + 20_000 + 30_000);
  });

  it('does not count while hidden, and resumes the idle window after return', () => {
    const c = clock();
    const a = activeTimer(c.now);
    a.reset(true);
    c.go(5_000);
    a.vis(false);
    c.go(100_000);
    expect(a.ms()).toBe(5_000);
    a.vis(true);
    c.go(10_000); // last interaction was 105 s ago: idle
    expect(a.ms()).toBe(5_000);
    a.poke();
    c.go(10_000);
    expect(a.ms()).toBe(15_000);
  });

  it('a page view that starts hidden counts nothing until visible and interacted with', () => {
    const c = clock();
    const a = activeTimer(c.now);
    a.reset(false);
    c.go(5_000);
    expect(a.ms()).toBe(0);
    a.vis(true);
    c.go(5_000); // still within 30 s of page start
    expect(a.ms()).toBe(5_000);
  });

  it('reset starts from zero', () => {
    const c = clock();
    const a = activeTimer(c.now);
    a.reset(true);
    c.go(10_000);
    a.reset(true);
    expect(a.ms()).toBe(0);
  });
});
