import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASE, KEY, setup } from './helpers';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const B62 = /^[0-9A-Za-z]+$/;

describe('pageview on load', () => {
  it('sends one valid envelope via sendBeacon with the §4 fields', async () => {
    const t = await setup({ referrer: 'https://www.google.com/search?q=secret' });
    await t.flush();
    expect(t.sent).toHaveLength(1);
    const s = t.sent[0];
    expect(s.via).toBe('beacon');
    expect(s.url).toBe(BASE + '/v1/e');
    expect(s.body).toMatchObject({ v: 1, k: KEY, wd: false, test: false });
    const [pv] = s.body.ev;
    expect(pv).toMatchObject({
      type: 'pageview',
      path: '/Back-Pain',
      nav: 'load',
      ref: 'www.google.com',
      utm: { source: 'google', medium: 'cpc' },
      clid: ['gclid'],
      title: 'Back pain treatment',
      vw: 1024,
      load_ms: null,
    });
    expect(pv.pv).toMatch(B62);
    expect(pv.pv).toHaveLength(16);
    expect(pv.eid).toHaveLength(8);
    expect(JSON.stringify(s.body)).not.toContain('secret');
  });

  it('ref is null for same-site (www-insensitive) and empty referrers', async () => {
    const a = await setup({ referrer: 'https://www.site.example/other' });
    await a.flush();
    expect(a.ofType('pageview')[0].ref).toBeNull();
    vi.useRealTimers();
    const b = await setup();
    await b.flush();
    expect(b.ofType('pageview')[0].ref).toBeNull();
  });

  it('waits for the debounce before sending, so events batch', async () => {
    const t = await setup();
    await t.tick(500);
    expect(t.sent).toHaveLength(0);
    await t.tick(600);
    expect(t.sent).toHaveLength(1);
  });

  it('exposes window.r1 with step, formOk and consent', async () => {
    const t = await setup();
    expect(Object.keys(t.win.r1).sort()).toEqual(['consent', 'formOk', 'step']);
  });
});

describe('transport', () => {
  it('falls back to fetch keepalive/no-cors/omit when sendBeacon refuses or throws', async () => {
    for (const beacon of ['false', 'throws', 'missing'] as const) {
      const t = await setup({ beacon });
      await t.flush();
      const viaFetch = t.sent.filter((s) => s.via == 'fetch');
      expect(viaFetch, beacon).toHaveLength(1);
      expect(viaFetch[0].init).toMatchObject({ method: 'POST', keepalive: true, mode: 'no-cors', credentials: 'omit' });
      expect(typeof viaFetch[0].init!.body).toBe('string');
      vi.useRealTimers();
    }
  });

  it('splits batches at 25 events per envelope', async () => {
    const t = await setup({ body: '<a id="c" href="tel:1">Call</a>' });
    await t.flush();
    const a = t.doc.getElementById('c')!;
    for (let i = 0; i < 30; i++) t.click(a);
    await t.flush();
    const sizes = t.sent.map((s) => s.body.ev.length);
    expect(sizes).toEqual([1, 25, 5]);
    expect(t.ofType('click')).toHaveLength(30);
    expect(new Set(t.events().map((e) => e.eid)).size).toBe(31);
  });

  it('fetches config once per page load, not per route change', async () => {
    const t = await setup();
    t.win.history.pushState({}, '', '/a');
    t.win.history.pushState({}, '', '/b');
    await t.flush();
    const configCalls = t.fetchMock.mock.calls.filter((c) => String(c[0]).includes('/v1/config/'));
    expect(configCalls).toHaveLength(1);
    expect(configCalls[0][0]).toBe(BASE + '/v1/config/' + KEY);
    expect(configCalls[0][1]).toMatchObject({ credentials: 'omit' });
  });
});

describe('clicks', () => {
  it('sends call/email/whatsapp/booking clicks with the current pv; booking paths come from config', async () => {
    const t = await setup({
      body: `<a id="t" href="tel:+4930">Call us</a><a id="m" href="mailto:a@b.c">Mail</a>
             <a id="w" href="https://wa.me/4930">WA</a><a id="b" href="/termin/">Termin</a><a id="x" href="/x">x</a>`,
      config: { config_version: 2, spa: 'auto', sections: [], booking_paths: ['/termin'], forms_browser: [] },
    });
    for (const id of ['t', 'm', 'w', 'b', 'x']) t.click(t.doc.getElementById(id)!);
    await t.flush();
    const pv = t.ofType('pageview')[0].pv;
    expect(t.ofType('click').map((c) => [c.kind, c.label, c.pv, c.path])).toEqual([
      ['call', 'Call us', pv, '/Back-Pain'],
      ['email', 'Mail', pv, '/Back-Pain'],
      ['whatsapp', 'WA', pv, '/Back-Pain'],
      ['booking_cta', 'Termin', pv, '/Back-Pain'],
    ]);
  });

  it('uses defaults when the config request fails (no booking paths, still tracks)', async () => {
    const t = await setup({ body: '<a id="b" href="/termin">Termin</a><a id="t" href="tel:1">t</a>', configFails: true });
    t.click(t.doc.getElementById('b')!);
    t.click(t.doc.getElementById('t')!);
    await t.flush();
    expect(t.ofType('click').map((c) => c.kind)).toEqual(['call']);
    expect(t.consoleCalls()).toBe(0);
  });
});

describe('hidden form fields (§3)', () => {
  it('adds r1_pv and r1_path to every form, including forms added later', async () => {
    const t = await setup({ body: '<form id="f1"><input name="email"></form>' });
    const f1 = t.doc.getElementById('f1') as HTMLFormElement;
    const pv = (f1.elements.namedItem('r1_pv') as HTMLInputElement).value;
    expect(pv).toHaveLength(16);
    expect((f1.elements.namedItem('r1_pv') as HTMLInputElement).type).toBe('hidden');
    expect((f1.elements.namedItem('r1_path') as HTMLInputElement).value).toBe('/Back-Pain');

    const f2 = t.doc.createElement('form');
    f2.id = 'f2';
    t.doc.body.appendChild(f2);
    await t.tick(150);
    expect((f2.elements.namedItem('r1_pv') as HTMLInputElement).value).toBe(pv);
    expect(f2.querySelectorAll('input[name=r1_pv]')).toHaveLength(1);
  });

  it('updates r1_pv and r1_path after in-page navigation and right before submit', async () => {
    const t = await setup({ body: '<form id="f"></form>' });
    const f = t.doc.getElementById('f') as HTMLFormElement;
    const before = (f.elements.namedItem('r1_pv') as HTMLInputElement).value;
    t.win.history.pushState({}, '', '/kontakt/');
    const after = (f.elements.namedItem('r1_pv') as HTMLInputElement).value;
    expect(after).not.toBe(before);
    expect((f.elements.namedItem('r1_path') as HTMLInputElement).value).toBe('/kontakt');

    (f.elements.namedItem('r1_pv') as HTMLInputElement).value = 'tampered';
    f.dispatchEvent(new t.win.Event('submit', { bubbles: true, cancelable: true }));
    expect((f.elements.namedItem('r1_pv') as HTMLInputElement).value).toBe(after);
    expect(f.querySelectorAll('input[name=r1_pv]')).toHaveLength(1);
  });
});

describe('single-page navigation', () => {
  it('closes the old page view with a final engage and starts a new pv with nav=spa', async () => {
    const t = await setup({ referrer: 'https://www.google.com/' });
    await t.tick(5000);
    t.win.history.pushState({}, '', '/preise/?tab=2');
    t.doc.title = 'Preise';
    await t.flush();
    const [pv1, eng, pv2] = t.events();
    expect(pv1).toMatchObject({ type: 'pageview', nav: 'load', path: '/Back-Pain' });
    expect(eng).toMatchObject({ type: 'engage', pv: pv1.pv, path: '/Back-Pain', final: true, active_ms: 5000 });
    expect(pv2).toMatchObject({ type: 'pageview', nav: 'spa', path: '/preise', ref: null, load_ms: null, title: 'Preise' });
    expect(pv2.pv).not.toBe(pv1.pv);
  });

  it('ignores replaceState/pushState that keep the same normalised path', async () => {
    const t = await setup();
    t.win.history.replaceState({}, '', '/Back-Pain/?page=2#x');
    t.win.history.pushState({}, '', '/Back-Pain');
    await t.flush();
    expect(t.ofType('pageview')).toHaveLength(1);
    expect(t.ofType('engage')).toHaveLength(0);
  });

  it('detects replaceState and popstate route changes', async () => {
    const t = await setup();
    t.win.history.replaceState({}, '', '/a');
    t.win.history.pushState({}, '', '/b');
    t.win.history.replaceState({}, '', '/a');
    t.win.dispatchEvent(new t.win.PopStateEvent('popstate'));
    t.win.history.replaceState({}, '', '/c');
    t.win.dispatchEvent(new t.win.PopStateEvent('popstate'));
    await t.flush();
    expect(t.ofType('pageview').map((p) => [p.nav, p.path])).toEqual([
      ['load', '/Back-Pain'],
      ['spa', '/a'],
      ['spa', '/b'],
      ['spa', '/a'],
      ['spa', '/c'],
    ]);
    expect(t.ofType('engage').every((e) => e.final)).toBe(true);
  });

  it('resets scroll, sections and active time for the new page view', async () => {
    const t = await setup({ body: '<div id="s" data-r1-section="prices"></div>' });
    t.rect(t.doc.getElementById('s')!, 100, 300);
    t.setScroll(2000, 4000);
    await t.tick(10_000);
    t.win.history.pushState({}, '', '/next');
    t.rect(t.doc.getElementById('s')!, 5000, 300); // below the fold on the new route
    t.setScroll(0, 4000);
    t.setHidden(true);
    await t.flush();
    const [first, second] = t.ofType('engage');
    expect(first).toMatchObject({ scroll: 69, sections: ['prices'], active_ms: 10_000, final: true });
    expect(second).toMatchObject({ scroll: 19, sections: [], active_ms: 0, final: false });
  });

  it('can be turned off by config spa="off"', async () => {
    const t = await setup({ config: { config_version: 1, spa: 'off', sections: [], booking_paths: [], forms_browser: [] } });
    t.win.history.pushState({}, '', '/elsewhere');
    await t.flush();
    expect(t.ofType('pageview')).toHaveLength(1);
  });
});

describe('engage', () => {
  it('sends on hidden (final=false) and pagehide (final=true); no resend when nothing changed', async () => {
    const t = await setup();
    await t.tick(3000);
    expect(t.sent).toHaveLength(1); // the pageview
    t.setHidden(true);
    expect(t.sent).toHaveLength(2); // forced flush on hide, no timer wait
    t.setHidden(false);
    t.setHidden(true); // nothing changed in between
    t.pagehide();
    t.setHidden(true);
    await t.flush();
    const eng = t.ofType('engage');
    expect(eng.map((e) => [e.final, e.active_ms])).toEqual([
      [false, 3000],
      [true, 3000],
    ]);
  });

  it('the final engage stays the last one when pagehide fires before visibilitychange (Chrome navigation)', async () => {
    const t = await setup();
    await t.tick(2000);
    t.pagehide();
    await t.tick(5);
    t.setHidden(true);
    await t.flush();
    expect(t.ofType('engage').map((e) => e.final)).toEqual([true]);
  });

  it('resumes after a back/forward-cache restore of the same page view', async () => {
    const t = await setup();
    await t.tick(2000);
    t.pagehide();
    t.setHidden(true);
    t.setHidden(false);
    const ev = new t.win.PageTransitionEvent('pageshow', { persisted: true });
    t.win.dispatchEvent(ev);
    t.interact();
    await t.tick(3000);
    t.setHidden(true);
    t.pagehide();
    const eng = t.ofType('engage');
    expect(eng.map((e) => [e.final, e.active_ms])).toEqual([
      [true, 2000],
      [false, 5000],
      [true, 5000],
    ]);
    expect(new Set(eng.map((e) => e.pv)).size).toBe(1);
  });

  it('sends again if engagement continues after the tab returns', async () => {
    const t = await setup();
    await t.tick(2000);
    t.setHidden(true);
    await t.tick(60_000);
    t.setHidden(false);
    t.interact();
    await t.tick(4000);
    t.setHidden(true);
    const eng = t.ofType('engage');
    expect(eng.map((e) => e.active_ms)).toEqual([2000, 6000]);
  });

  it('active time stops 30 s after the last interaction', async () => {
    const t = await setup();
    await t.tick(20_000);
    t.interact();
    await t.tick(100_000);
    t.pagehide();
    expect(t.ofType('engage')[0].active_ms).toBe(50_000);
  });

  it('scroll is not read from the early (short) layout before it settles', async () => {
    const t = await setup(); // jsdom starts with scrollHeight 0, i.e. "100 %"
    Object.defineProperty(t.doc.documentElement, 'scrollHeight', { configurable: true, get: () => 7680 });
    await t.tick(1500);
    t.pagehide();
    expect(t.ofType('engage')[0].scroll).toBe(10);
  });

  it('scroll is the highest % reached', async () => {
    const t = await setup();
    t.setScroll(0, 3072); // 768/3072 = 25 %
    t.setScroll(2304, 3072); // bottom = 100 %
    t.setScroll(500, 3072);
    await t.tick(300);
    t.pagehide();
    expect(t.ofType('engage')[0].scroll).toBe(100);
  });
});

describe('sections', () => {
  it('counts data-r1-section and path-scoped config selectors when 40 % of the element or viewport is visible', async () => {
    const t = await setup({
      body: `<div id="a" data-r1-section="headline"></div><div id="b" data-r1-section="faq"></div>
             <section id="p" class="prices"></section><section id="tall" class="team"></section><div id="o" class="other"></div>`,
      config: {
        config_version: 1,
        spa: 'auto',
        booking_paths: [],
        forms_browser: [],
        sections: [
          { path: '/Back-Pain', selector: '.prices', name: 'prices' },
          { selector: '.team', name: 'team' },
          { path: '/other-page', selector: '.other', name: 'other' },
          { path: '/Back-Pain', selector: '!!bad', name: 'broken' },
        ],
      },
    });
    const $ = (id: string) => t.doc.getElementById(id)!;
    t.rect($('a'), 0, 200); // fully visible
    t.rect($('b'), 700, 200); // 68 of 200 px = 34 %: not yet
    t.rect($('p'), 600, 100); // 100 % visible
    t.rect($('tall'), 400, 5000); // 368 px = 48 % of the viewport
    t.rect($('o'), 0, 100); // visible but scoped to another path
    t.setScroll(0, 9000);
    await t.tick(300);
    t.rect($('b'), 600, 200); // now 84 %
    t.setScroll(100, 9000);
    await t.tick(300);
    t.pagehide();
    expect(t.ofType('engage')[0].sections).toEqual(['headline', 'prices', 'team', 'faq']);
  });

  it('caps sections at 20 and names at 60 chars', async () => {
    const body = Array.from({ length: 25 }, (_, i) => `<div data-r1-section="s${i}${i == 0 ? 'x'.repeat(80) : ''}"></div>`).join('');
    const t = await setup({ body });
    t.doc.querySelectorAll('[data-r1-section]').forEach((e) => t.rect(e, 10, 10));
    t.setScroll(0, 100);
    await t.tick(300);
    t.pagehide();
    const s = t.ofType('engage')[0].sections;
    expect(s).toHaveLength(20);
    expect(s[0]).toHaveLength(60);
  });
});

describe('consent (data-consent="required")', () => {
  it('sends only page views until r1.consent(true), and stops again on consent(false)', async () => {
    const t = await setup({ consent: true, body: '<a id="t" href="tel:1">Call</a>' });
    t.click(t.doc.getElementById('t')!);
    t.win.r1.step('booking', 'main', 1);
    t.win.r1.formOk('contact');
    t.setHidden(true);
    t.setHidden(false);
    await t.flush();
    expect(t.events().map((e) => e.type)).toEqual(['pageview']);

    t.win.r1.consent(true);
    t.click(t.doc.getElementById('t')!);
    t.win.r1.step('booking', 'main', 1);
    await t.flush();
    expect(t.events().map((e) => e.type)).toEqual(['pageview', 'click', 'step']);

    t.win.r1.consent(false);
    t.click(t.doc.getElementById('t')!);
    t.win.history.pushState({}, '', '/next');
    t.pagehide();
    await t.flush();
    expect(t.events().map((e) => e.type)).toEqual(['pageview', 'click', 'step', 'pageview']);
  });
});

describe('JS API', () => {
  it('step validates flow, flow id and step 1–20; optional name capped at 60', async () => {
    const t = await setup();
    t.win.r1.step('booking', 'online-booking', 1, 'Pick a time');
    t.win.r1.step('calculator', 'price-calc', '3');
    t.win.r1.step('quiz', 'x', 1);
    t.win.r1.step('booking', '', 1);
    t.win.r1.step('booking', 'x', 21);
    t.win.r1.step('booking', 'x', 1.5);
    t.win.r1.step('booking', 'x'.repeat(80), 2, 'n'.repeat(80));
    await t.flush();
    const steps = t.ofType('step');
    expect(steps.map((s) => [s.flow, s.flow_id.length, s.step, s.name?.length ?? null])).toEqual([
      ['booking', 14, 1, 11],
      ['calculator', 10, 3, null],
      ['booking', 60, 2, 60],
    ]);
  });

  it('formOk sends form_ok with the form id', async () => {
    const t = await setup();
    t.win.r1.formOk('contact');
    t.win.r1.formOk('');
    await t.flush();
    expect(t.ofType('form_ok').map((e) => e.form)).toEqual(['contact']);
  });
});

describe('forms_browser rules', () => {
  it('sends form_ok when the success element appears after a submit', async () => {
    const t = await setup({
      body: '<form class="wixform"><button type="submit">Send</button></form><div class="form-success" style="display:none">Thanks</div>',
      config: { config_version: 1, spa: 'auto', sections: [], booking_paths: [], forms_browser: [{ form: 'contact', selector: 'form.wixform', success_selector: '.form-success' }] },
    });
    const f = t.doc.querySelector('form')!;
    const ok = t.doc.querySelector('.form-success') as HTMLElement;
    let shown = false;
    ok.getClientRects = () => (shown ? ([{}] as unknown as DOMRectList) : ([] as unknown as DOMRectList));
    f.dispatchEvent(new t.win.Event('submit', { bubbles: true, cancelable: true }));
    t.click(t.doc.querySelector('button')!); // same watch, not a second one
    await t.tick(1000);
    expect(t.ofType('form_ok')).toHaveLength(0);
    shown = true;
    await t.tick(300);
    await t.flush();
    expect(t.ofType('form_ok').map((e) => e.form)).toEqual(['contact']);
  });

  it('gives up after 15 s without a success element', async () => {
    const t = await setup({
      body: '<form class="f"></form><div class="ok"></div>',
      config: { config_version: 1, spa: 'auto', sections: [], booking_paths: [], forms_browser: [{ form: 'contact', selector: '.f', success_selector: '.ok' }] },
    });
    t.doc.querySelector('form')!.dispatchEvent(new t.win.Event('submit', { bubbles: true }));
    await t.tick(16_000);
    (t.doc.querySelector('.ok') as HTMLElement).getClientRects = () => [{}] as unknown as DOMRectList;
    await t.tick(1000);
    await t.flush();
    expect(t.ofType('form_ok')).toHaveLength(0);
  });
});

describe('debug mode (?r1_debug=1)', () => {
  it('sets test=true, uses a CORS fetch, shows pv, events and HTTP status in a panel', async () => {
    const t = await setup({ url: 'https://site.example/back-pain?r1_debug=1' });
    await t.flush();
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].via).toBe('fetch');
    expect(t.sent[0].body.test).toBe(true);
    expect(t.sent[0].init!.mode).toBeUndefined(); // default "cors"
    const panel = t.doc.querySelector('[data-r1-debug]')!;
    const text = panel.textContent!;
    expect(text).toContain('pv ' + t.ofType('pageview')[0].pv);
    expect(text).toContain('→ {"type":"pageview"');
    expect(text).toContain('← 204');
    expect((t.win.navigator as any).sendBeacon).not.toHaveBeenCalled();
  });
});

describe('robustness and privacy', () => {
  it('does nothing without a valid site key, and only initialises once', async () => {
    const t = await setup({ key: 'pk_short' });
    await t.flush();
    expect(t.win.r1).toBeUndefined();
    expect(t.sent).toHaveLength(0);
  });

  it('never throws into the page and never logs outside debug mode', async () => {
    const t = await setup({
      beacon: 'throws',
      body: '<form></form><a id="t" href="tel:1">x</a>',
      config: { config_version: 1, spa: 'auto', sections: [{ selector: ':::', name: 'x' }], booking_paths: ['%%%'], forms_browser: [{ form: 'f', selector: ':::', success_selector: ':::' }] },
    });
    (t.win as any).fetch = () => {
      throw new Error('fetch boom');
    };
    expect(() => {
      t.click(t.doc.getElementById('t')!);
      t.doc.querySelector('form')!.dispatchEvent(new t.win.Event('submit', { bubbles: true }));
      t.win.history.pushState({}, '', '/x');
      t.win.r1.step();
      t.win.r1.formOk(undefined);
      t.setHidden(true);
      t.pagehide();
    }).not.toThrow();
    await t.flush();
    expect(t.consoleCalls()).toBe(0);
  });

  it('uses no cookies or Web Storage', async () => {
    const t = await setup({ body: '<a id="t" href="tel:1">x</a>' });
    const ls = vi.spyOn(t.win.Storage.prototype, 'setItem');
    t.click(t.doc.getElementById('t')!);
    t.win.history.pushState({}, '', '/x');
    t.pagehide();
    await t.flush();
    expect(t.doc.cookie).toBe('');
    expect(t.win.localStorage.length).toBe(0);
    expect(t.win.sessionStorage.length).toBe(0);
    expect(ls).not.toHaveBeenCalled();
  });

  it('every pv and eid is base62 with the right length, and pv changes per page view', async () => {
    const t = await setup();
    t.win.history.pushState({}, '', '/2');
    t.win.history.pushState({}, '', '/3');
    t.pagehide();
    await t.flush();
    const pvs = new Set(t.events().map((e) => e.pv));
    expect(pvs.size).toBe(3);
    for (const e of t.events()) {
      expect(e.pv).toMatch(/^[0-9A-Za-z]{16}$/);
      expect(e.eid).toMatch(/^[0-9A-Za-z]{8}$/);
    }
  });
});
