/**
 * r1.js core. Data contract v1 §3 (what a site adds), §4 (events), §5 (config).
 *
 * No cookies, no Web Storage, no IndexedDB. The only identifier is the page
 * token `pv`, new on every page load and every in-page route change.
 * Never throws into the host page; logs only in debug mode (?r1_debug=1).
 */
import { activeTimer } from './active';
import { clickKind } from './clicks';
import { normalisePath } from './path';

interface Section {
  path?: string;
  selector: string;
  name: string;
}
interface FormRule {
  form: string;
  selector: string;
  success_selector: string;
}
export interface Config {
  config_version?: number;
  spa?: string;
  sections?: Section[];
  booking_paths?: string[];
  forms_browser?: FormRule[];
}
type Ev = { type: string; [k: string]: unknown };
type Win = Window & typeof globalThis & { r1?: unknown };

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const MAX_EV = 25;
const FLUSH_MS = 1000;
const DEFAULT_BASE = 'https://collect.bazed.live';

export function init(win: Win, script: HTMLScriptElement | null): void {
  const doc = win.document;
  const loc = win.location;
  const key = script && script.getAttribute('data-site');
  if (!key || !/^pk_[\dA-Za-z]{24}$/.test(key) || (win.r1 as { formOk?: unknown } | undefined)?.formOk) return;

  let base = DEFAULT_BASE;
  try {
    base = new URL(script!.src).origin;
  } catch {
    /* inline or odd src: keep default */
  }
  const debug = /[?&]r1_debug=1(&|$)/.test(loc.search);
  const log = debug ? panel(doc) : 0;
  let granted = script!.getAttribute('data-consent') != 'required';
  let cfg: Config = {};

  const safe =
    <A extends unknown[]>(f: (...a: A) => void) =>
    (...a: A) => {
      try {
        f(...a);
      } catch (e) {
        log && log('error ' + e);
      }
    };
  const rnd = (n: number) => {
    const c = win.crypto;
    const b = c && c.getRandomValues ? c.getRandomValues(new Uint8Array(n)) : 0;
    let s = '';
    for (let i = 0; i < n; i++) s += B62[(b ? b[i] : (Math.random() * 256) | 0) % 62];
    return s;
  };
  const hidden = () => doc.visibilityState == 'hidden';

  // ---- page view state ----
  let pv = '';
  let path = '';
  let maxScroll = 0;
  let seen: string[] = [];
  let sig = '';
  let closed = false;
  let els: [Element, string][] = [];
  const timer = activeTimer();
  const t0 = Date.now();

  // ---- queue + transport ----
  let q: Ev[] = [];
  let flushT: ReturnType<typeof setTimeout> | 0 = 0;

  const emit = (type: string, extra?: object) => {
    if (!granted && type != 'pageview') return;
    q.push({ type, eid: rnd(8), pv, path, ts: Date.now(), ...extra });
    if (q.length >= MAX_EV) flush(1);
    else if (!flushT) flushT = setTimeout(safe(flush), FLUSH_MS);
  };

  /** Fill fields of the current page view's pageview that settle after it starts. */
  const fill = () => {
    for (const e of q)
      if (e.type == 'pageview' && e.pv == pv) {
        e.title = doc.title.slice(0, 200);
        if (e.nav == 'load' && e.load_ms == null) e.load_ms = loadMs();
      }
  };

  const loadMs = () => {
    const n = win.performance?.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
    return n && n.loadEventEnd > 0 ? Math.round(n.loadEventEnd) : null;
  };

  function flush(force?: unknown) {
    clearTimeout(flushT as ReturnType<typeof setTimeout>);
    flushT = 0;
    if (!q.length) return;
    // Hold the first pageview until the load event (for load_ms), at most 10 s.
    if (!force && doc.readyState != 'complete' && Date.now() - t0 < 1e4 && q.some((e) => e.nav == 'load')) {
      flushT = setTimeout(safe(flush), FLUSH_MS);
      return;
    }
    fill();
    while (q.length) send(q.splice(0, MAX_EV));
  }

  const send = (ev: Ev[]) => {
    const url = base + '/v1/e';
    const body = JSON.stringify({ v: 1, k: key, wd: !!win.navigator.webdriver, test: debug, ev });
    if (log) {
      for (const e of ev) log('→ ' + JSON.stringify(e));
      win.fetch(url, { method: 'POST', body, keepalive: true, credentials: 'omit' }).then(
        (r) => log('← ' + r.status + ' (' + ev.length + ' ev)'),
        () => log('← network error'),
      );
      return;
    }
    const n = win.navigator;
    try {
      if (n.sendBeacon && n.sendBeacon(url, body)) return;
    } catch {
      /* fall through */
    }
    try {
      win.fetch(url, { method: 'POST', body, keepalive: true, mode: 'no-cors', credentials: 'omit' }).catch(() => 0);
    } catch {
      /* give up silently */
    }
  };

  // ---- measurement ----
  const collect = () => {
    els = [];
    doc.querySelectorAll('[data-r1-section]').forEach((e) => els.push([e, e.getAttribute('data-r1-section')!]));
    for (const s of cfg.sections || [])
      if (!s.path || normalisePath(s.path) == path)
        try {
          doc.querySelectorAll(s.selector).forEach((e) => els.push([e, s.name]));
        } catch {
          /* bad selector from config */
        }
  };

  /**
   * Sections seen (visible tab only); with `all`, also the scroll %. Scroll is
   * measured only once the layout has settled (load event, scroll, resize,
   * engage), so an early, short layout can't overstate it.
   */
  const scrollNow = () => {
    const de = doc.documentElement;
    const vh = win.innerHeight;
    const h = Math.max(de.scrollHeight, doc.body ? doc.body.scrollHeight : 0);
    const pct = h <= vh ? 100 : Math.min(100, Math.round(((win.scrollY || de.scrollTop || 0) + vh) * 100 / h));
    if (pct > maxScroll) maxScroll = pct;
  };
  const measure = (all?: unknown) => {
    const vh = win.innerHeight;
    if (all) scrollNow();
    if (hidden()) return;
    for (const [el, raw] of els) {
      const name = (raw || '').trim().slice(0, 60);
      if (!name || seen.length >= 20 || seen.indexOf(name) >= 0) continue;
      const r = el.getBoundingClientRect();
      const v = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (v > 0 && r.right > 0 && r.left < win.innerWidth && (v >= 0.4 * r.height || v >= 0.4 * vh)) seen.push(name);
    }
  };

  let measureT: ReturnType<typeof setTimeout> | 0 = 0;
  const soon = () => {
    if (!measureT)
      measureT = setTimeout(
        safe(() => {
          measureT = 0;
          measure(1);
        }),
        200,
      );
  };

  /**
   * Sends engage when something changed since the last one. After a final
   * engage the page view is closed (Chrome fires pagehide before
   * visibilitychange on navigation): nothing more unless it comes back from
   * the back/forward cache.
   */
  const engage = (final: boolean) => {
    if (!granted || closed) return;
    measure(1);
    const active_ms = timer.ms();
    const s = active_ms + '|' + maxScroll + '|' + seen.length;
    if (s == sig && !final) return;
    sig = s;
    closed = final;
    emit('engage', { active_ms, scroll: maxScroll, sections: seen.slice(), final });
  };

  // ---- forms: hidden fields (§3) ----
  const field = (f: HTMLFormElement, name: string, value: string) => {
    let i = f.querySelector('input[name="' + name + '"]') as HTMLInputElement | null;
    if (!i) {
      i = doc.createElement('input');
      i.type = 'hidden';
      i.name = name;
      f.appendChild(i);
    }
    if (i.value != value) i.value = value;
  };
  const tagForms = (f?: HTMLFormElement) =>
    (f ? [f] : doc.querySelectorAll('form')).forEach((f) => {
      field(f, 'r1_pv', pv);
      field(f, 'r1_path', path);
    });

  // ---- forms_browser: watch for the success element after a submit (§5) ----
  const watching: Record<string, ReturnType<typeof setInterval> | 0> = {};
  const visibleMatches = (sel: string) => {
    const out: Element[] = [];
    try {
      doc.querySelectorAll(sel).forEach((e) => {
        const h = e as HTMLElement;
        if (h.offsetWidth || h.offsetHeight || e.getClientRects().length) out.push(e);
      });
    } catch {
      /* bad selector */
    }
    return out;
  };
  const watch = (r: FormRule) => {
    if (watching[r.form]) return;
    const before = visibleMatches(r.success_selector);
    let n = 0;
    watching[r.form] = setInterval(
      safe(() => {
        const hit = visibleMatches(r.success_selector).some((e) => before.indexOf(e) < 0);
        if (hit || ++n >= 60) {
          clearInterval(watching[r.form] as ReturnType<typeof setInterval>);
          watching[r.form] = 0;
          if (hit) emit('form_ok', { form: ('' + r.form).slice(0, 100) });
        }
      }),
      250,
    );
  };
  const matchRules = (el: Element) => {
    for (const r of cfg.forms_browser || [])
      try {
        if (el.closest(r.selector)) watch(r);
      } catch {
        /* bad selector */
      }
  };

  // ---- page views ----
  const refHost = () => {
    try {
      const h = new URL(doc.referrer).hostname;
      const bare = (x: string) => x.toLowerCase().replace(/^www\./, '');
      return h && bare(h) != bare(loc.hostname) ? h.slice(0, 255) : null;
    } catch {
      return null;
    }
  };

  const startView = (nav: 'load' | 'spa') => {
    pv = rnd(16);
    path = normalisePath(loc.pathname);
    maxScroll = 0;
    seen = [];
    sig = '';
    closed = false;
    timer.reset(!hidden());
    tagForms();
    collect();
    const sp = new URLSearchParams(loc.search);
    const utm: Record<string, string> = {};
    for (const k of ['source', 'medium', 'campaign', 'term', 'content']) {
      const v = sp.get('utm_' + k);
      if (v) utm[k] = v.slice(0, 100);
    }
    log && log('pv ' + pv + ' ' + path + ' (' + nav + ')');
    emit('pageview', {
      nav,
      ref: nav == 'load' ? refHost() : null,
      utm,
      clid: ['gclid', 'fbclid', 'msclkid'].filter((c) => sp.has(c)),
      title: doc.title.slice(0, 200),
      vw: win.innerWidth | 0,
      load_ms: null,
    });
    // No synchronous reading: right after pushState the old route's DOM is
    // still on screen. First reading once the layout has settled: the load
    // event for a real load, 1 s later for an in-page route change (DOM
    // mutations and scrolling also trigger readings).
    if (nav == 'spa' || doc.readyState == 'complete') setTimeout(safe(soonMeasure), 1000);
  };
  const soonMeasure = () => measure(1);

  const route = safe(() => {
    if (cfg.spa == 'off') return;
    if (normalisePath(loc.pathname) == path) return;
    fill();
    engage(true);
    startView('spa');
  });

  // ---- public API (§3) ----
  win.r1 = {
    step: safe((flow: string, flowId: string, step: number | string, name?: string) => {
      const n = +step;
      if ((flow == 'booking' || flow == 'calculator') && flowId && n >= 1 && n <= 20 && n % 1 == 0) {
        const e: Record<string, unknown> = { flow, flow_id: ('' + flowId).slice(0, 60), step: n };
        if (name) e.name = ('' + name).slice(0, 60);
        emit('step', e);
      } else log && log('step ignored: invalid arguments');
    }),
    formOk: safe((form: string) => {
      if (form) emit('form_ok', { form: ('' + form).slice(0, 100) });
    }),
    consent: safe((yes: boolean) => {
      granted = !!yes;
      log && log('consent ' + granted);
    }),
  };

  // ---- go ----
  const go = safe(() => {
    startView('load');

    try {
      win
        .fetch(base + '/v1/config/' + key, { credentials: 'omit' })
        .then((r) => (r.ok ? r.json() : null))
        .then(
          safe((c: Config | null) => {
            if (c && typeof c == 'object') {
              cfg = c;
              collect();
              measure();
            }
            log && log('config ' + (c ? 'v' + c.config_version : 'unavailable, using defaults'));
          }),
          () => log && log('config failed, using defaults'),
        );
    } catch {
      /* no fetch: defaults */
    }

    const poke = safe((e: Event) => {
      timer.poke();
      if (e.type == 'scroll') {
        scrollNow(); // cheap; catches a fast fling to the bottom and back
        soon(); // sections, throttled
      }
    });
    for (const t of ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', 'wheel'])
      win.addEventListener(t, poke, { capture: true, passive: true });
    win.addEventListener('resize', soon, { passive: true });
    win.addEventListener('load', soon);

    doc.addEventListener(
      'visibilitychange',
      safe(() => {
        const h = hidden();
        timer.vis(!h);
        if (h) {
          engage(false);
          flush(1);
        } else measure(1);
      }),
    );
    win.addEventListener(
      'pagehide',
      safe(() => {
        engage(true);
        timer.vis(false);
        flush(1);
      }),
    );
    // Back/forward cache restore: same page view, engagement continues.
    win.addEventListener(
      'pageshow',
      safe((e: PageTransitionEvent) => {
        if (e.persisted) {
          closed = false;
          timer.vis(!hidden());
        }
      }),
    );

    doc.addEventListener(
      'click',
      safe((e: Event) => {
        const t = e.target as Element;
        const c = clickKind(t, cfg.booking_paths || [], loc);
        if (c) emit('click', c);
        const b = t && t.closest && t.closest('button,[type=submit]');
        if (b) matchRules(b);
      }),
      true,
    );
    doc.addEventListener(
      'submit',
      safe((e: Event) => {
        const f = e.target as HTMLFormElement;
        if (f && f.tagName == 'FORM') {
          tagForms(f);
          matchRules(f);
        }
      }),
      true,
    );

    let moT: ReturnType<typeof setTimeout> | 0 = 0;
    new win.MutationObserver(() => {
      if (!moT)
        moT = setTimeout(
          safe(() => {
            moT = 0;
            tagForms();
            collect();
            measure();
          }),
          100,
        );
    }).observe(doc.documentElement, { childList: true, subtree: true });

    win.addEventListener('popstate', route);
    const h = win.history;
    for (const m of ['pushState', 'replaceState'] as const) {
      const orig = h[m];
      try {
        if (typeof orig == 'function')
          h[m] = function (this: History, ...a: Parameters<History['pushState']>) {
            const r = orig.apply(this, a);
            route();
            return r;
          };
      } catch {
        /* frozen history: popstate only */
      }
    }
  });

  if ((doc as Document & { prerendering?: boolean }).prerendering) doc.addEventListener('prerenderingchange', go, { once: true });
  else go();
}

/** Debug panel (?r1_debug=1 only). */
function panel(doc: Document): (s: string) => void {
  const d = doc.createElement('div');
  d.setAttribute('data-r1-debug', '');
  d.style.cssText =
    'position:fixed;right:8px;bottom:8px;z-index:2147483647;width:340px;max-height:45vh;overflow:auto;background:rgba(17,17,17,.92);color:#d6f5d6;font:11px/1.45 ui-monospace,Menlo,Consolas,monospace;padding:6px 8px;border-radius:6px;white-space:pre-wrap;word-break:break-all';
  d.textContent = 'r1 debug (test=true)';
  (doc.body || doc.documentElement).appendChild(d);
  return (s) => {
    const l = doc.createElement('div');
    l.textContent = s;
    d.appendChild(l);
    d.scrollTop = d.scrollHeight;
  };
}
