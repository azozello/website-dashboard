/** Idle window: time counts only within 30 s of the last interaction (§4 active_ms). */
export const IDLE_MS = 30000;

export interface ActiveTimer {
  /** Start a new page view. The start of a page view counts as an interaction. */
  reset(visible: boolean): void;
  /** An interaction happened now. */
  poke(): void;
  /** The tab became visible (true) or hidden (false). */
  vis(visible: boolean): void;
  /** Cumulative active ms for this page view. */
  ms(): number;
}

/**
 * Active time = tab visible AND an interaction in the last 30 s.
 * Accrues lazily: every call settles the time since the previous call.
 */
export function activeTimer(now: () => number = Date.now): ActiveTimer {
  let total = 0;
  let mark = 0;
  let last = 0;
  let on = true;
  const adv = () => {
    const t = now();
    if (on) {
      const end = Math.min(t, last + IDLE_MS);
      if (end > mark) total += end - mark;
    }
    mark = t;
  };
  return {
    reset(visible) {
      total = 0;
      mark = last = now();
      on = visible;
    },
    poke() {
      adv();
      last = mark;
    },
    vis(visible) {
      adv();
      on = visible;
    },
    ms() {
      adv();
      return total;
    },
  };
}
