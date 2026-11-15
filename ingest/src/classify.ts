/** §9 processing rules that depend only on request data. */

export type Device = 'mobile' | 'tablet' | 'desktop';

/** Device from the user agent; viewport width only when the UA says nothing. */
export function device(ua: string, vw?: number | null): Device {
  if (/iPad|Tablet|PlayBook|Silk|Kindle|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone|Opera Mini|IEMobile|BlackBerry/i.test(ua)) return 'mobile';
  if (/Windows NT|Macintosh|X11|CrOS|Linux/i.test(ua)) return 'desktop';
  if (vw && vw > 0) return vw < 768 ? 'mobile' : vw < 1024 ? 'tablet' : 'desktop';
  return 'desktop';
}

const BOT =
  /bot\b|bot\/|crawl|spider|slurp|mediapartners|bingpreview|facebookexternalhit|facebookcatalog|embedly|quora link preview|outbrain|pinterest|vkshare|w3c_validator|whatsapp|telegram|skype|discord|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|python|curl\/|wget|httpclient|java\/|go-http-client|okhttp|axios|node-fetch|undici|phantomjs|selenium|puppeteer|playwright|scrapy|preview|monitor/i;

/** Known bots and non-browser clients. An empty user agent counts as a bot. */
export function isBot(ua: string): boolean {
  return !ua || BOT.test(ua);
}

export interface Source {
  channel: 'google_ads' | 'campaign' | 'google_organic' | 'other_search' | 'social' | 'referral' | 'direct';
  detail: string | null;
}

const host = (h: string) => h.toLowerCase().replace(/\.$/, '');
const ends = (h: string, d: string) => h === d || h.endsWith('.' + d);

/** §9 source channel from the visit's first page view; the first matching rule wins. */
export function sourceChannel(utm: Record<string, string | undefined>, clid: string[], ref: string | null): Source {
  const src = (utm.source || '').trim();
  const med = (utm.medium || '').trim().toLowerCase();
  const r = ref ? host(ref) : '';
  if (clid.includes('gclid') || (src.toLowerCase() === 'google' && ['cpc', 'ppc', 'paid'].includes(med)))
    return { channel: 'google_ads', detail: src || r || null };
  if (src) return { channel: 'campaign', detail: src };
  if (!r) return { channel: 'direct', detail: null };
  if (/(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(r)) return { channel: 'google_organic', detail: r };
  if (['bing.com', 'duckduckgo.com', 'ecosia.org'].some((d) => ends(r, d)) || /(^|\.)yahoo\.[a-z]{2,3}(\.[a-z]{2})?$/.test(r))
    return { channel: 'other_search', detail: r };
  if (
    ['facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'linkedin.com', 'lnkd.in', 'x.com', 'twitter.com', 't.co', 'tiktok.com', 'youtube.com', 'youtu.be'].some((d) =>
      ends(r, d),
    )
  )
    return { channel: 'social', detail: r };
  return { channel: 'referral', detail: r };
}
