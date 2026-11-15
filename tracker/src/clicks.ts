import { normalisePath } from './path';

export interface ClickInfo {
  kind: 'call' | 'whatsapp' | 'email' | 'booking_cta';
  label?: string;
}

const bare = (h: string) => h.toLowerCase().replace(/^www\./, '');

/**
 * Click rules, Data contract v1 §4:
 * tel: → call; wa.me, api.whatsapp.com or whatsapp: → whatsapp; mailto: → email;
 * [data-r1-cta="booking"] or a same-site link to a config booking path → booking_cta.
 * A link's own scheme wins over a surrounding data-r1-cta.
 */
export function clickKind(t: Element | null, bookingPaths: string[], loc: Location): ClickInfo | null {
  if (!t || !t.closest) return null;
  const a = t.closest('a[href]');
  const cta = t.closest('[data-r1-cta="booking"]');
  let kind: ClickInfo['kind'] | '' = '';
  if (a) {
    const href = (a.getAttribute('href') || '').trim();
    const s = href.slice(0, 9).toLowerCase();
    if (!s.indexOf('tel:')) kind = 'call';
    else if (!s.indexOf('mailto:')) kind = 'email';
    else if (!s.indexOf('whatsapp:')) kind = 'whatsapp';
    else {
      try {
        const u = new URL(href, loc.href);
        const h = u.hostname.toLowerCase();
        if (h == 'wa.me' || h == 'api.whatsapp.com') kind = 'whatsapp';
        else if (/^https?:$/.test(u.protocol) && bare(h) == bare(loc.hostname)) {
          const p = normalisePath(u.pathname);
          for (const b of bookingPaths) {
            const n = normalisePath(b);
            if (p == n || (n != '/' && !p.indexOf(n + '/'))) kind = 'booking_cta';
          }
        }
      } catch {
        /* unparsable href */
      }
    }
  }
  if (!kind && cta) kind = 'booking_cta';
  if (!kind) return null;
  const el = (kind == 'booking_cta' && cta) || a!;
  const label = (el.textContent || '').replace(/\s+/g, ' ').trim() || el.getAttribute('aria-label') || el.getAttribute('title') || '';
  return label ? { kind, label: label.slice(0, 60) } : { kind };
}
