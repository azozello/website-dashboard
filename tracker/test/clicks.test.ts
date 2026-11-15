import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { clickKind } from '../src/clicks';

const dom = new JSDOM(
  `<body>
  <a id="tel" href="tel:+49301234567"><span id="tel-inner">Call us</span></a>
  <a id="tel-upper" href="TEL:+49301234567">Phone</a>
  <a id="mail" href="mailto:info@praxis.example">Email us</a>
  <a id="wa" href="https://wa.me/49301234567">WhatsApp</a>
  <a id="wa-api" href="https://api.whatsapp.com/send?phone=49301234567">Chat</a>
  <a id="wa-scheme" href="whatsapp://send?phone=49301234567">Chat app</a>
  <a id="booking" href="/booking/">Book now</a>
  <a id="booking-sub" href="/booking/step-2">Continue</a>
  <a id="booking-abs" href="https://www.site.example/booking?x=1">Book</a>
  <a id="booking-other-host" href="https://other.example/booking">Book elsewhere</a>
  <a id="bookings-prefix" href="/bookings">Not booking</a>
  <button id="cta" data-r1-cta="booking">  Termin
     buchen </button>
  <div data-r1-cta="booking"><span id="cta-inner">Inner</span></div>
  <div data-r1-cta="booking"><a id="tel-in-cta" href="tel:123">Ring</a></div>
  <a id="icon" href="tel:123" aria-label="Call the practice"><svg></svg></a>
  <a id="long" href="mailto:x@y.z">${'L'.repeat(80)}</a>
  <a id="plain" href="/about">About</a>
  <a id="bad" href="http://[::1">Bad</a>
  <p id="text">text</p>
</body>`,
  { url: 'https://site.example/back-pain' },
);
const doc = dom.window.document;
const loc = dom.window.location;
const $ = (id: string) => doc.getElementById(id);
const kind = (id: string, booking: string[] = ['/booking']) => clickKind($(id), booking, loc);

describe('click rules (contract §4)', () => {
  it('tel: → call, including nested targets and any case', () => {
    expect(kind('tel')).toEqual({ kind: 'call', label: 'Call us' });
    expect(kind('tel-inner')).toEqual({ kind: 'call', label: 'Call us' });
    expect(kind('tel-upper')?.kind).toBe('call');
  });
  it('mailto: → email', () => expect(kind('mail')).toEqual({ kind: 'email', label: 'Email us' }));
  it('wa.me, api.whatsapp.com, whatsapp: → whatsapp', () => {
    expect(kind('wa')?.kind).toBe('whatsapp');
    expect(kind('wa-api')?.kind).toBe('whatsapp');
    expect(kind('wa-scheme')?.kind).toBe('whatsapp');
  });
  it('same-site links to a booking path → booking_cta (normalised, sub-paths, www-insensitive)', () => {
    expect(kind('booking')).toEqual({ kind: 'booking_cta', label: 'Book now' });
    expect(kind('booking-sub')?.kind).toBe('booking_cta');
    expect(kind('booking-abs')?.kind).toBe('booking_cta');
  });
  it('does not match other hosts, prefixes that are not path segments, or with no booking paths', () => {
    expect(kind('booking-other-host')).toBeNull();
    expect(kind('bookings-prefix')).toBeNull();
    expect(kind('booking', [])).toBeNull();
  });
  it('[data-r1-cta="booking"] → booking_cta with collapsed label', () => {
    expect(kind('cta')).toEqual({ kind: 'booking_cta', label: 'Termin buchen' });
    expect(kind('cta-inner')).toEqual({ kind: 'booking_cta', label: 'Inner' });
  });
  it("a link's own scheme wins over a surrounding data-r1-cta", () => expect(kind('tel-in-cta')?.kind).toBe('call'));
  it('falls back to aria-label; caps label at 60 chars', () => {
    expect(kind('icon')).toEqual({ kind: 'call', label: 'Call the practice' });
    expect(kind('long')?.label).toHaveLength(60);
  });
  it('ignores ordinary links, unparsable hrefs and non-links', () => {
    expect(kind('plain')).toBeNull();
    expect(kind('bad')).toBeNull();
    expect(kind('text')).toBeNull();
    expect(clickKind(null, [], loc)).toBeNull();
  });
});
