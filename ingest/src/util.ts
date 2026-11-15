import crypto from 'node:crypto';

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Unbiased random base62 string. */
export function base62(n: number): string {
  let s = '';
  while (s.length < n) {
    for (const b of crypto.randomBytes(n * 2)) {
      if (b < 248 && s.length < n) s += B62[b % 62]; // 248 = 4 * 62: no modulo bias
    }
  }
  return s;
}

export const sha256hex = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex');

/** §1 ids. */
export const newSiteKey = () => 'pk_' + base62(24);
export const newSiteSecret = () => 'sk_' + base62(40);
export const newWebhookToken = () => 'wh_' + base62(32);

/**
 * Path normalisation, Data contract v1 §1 (same rule and vectors as r1.js:
 * contract/v1/path-normalisation.json). Ingest applies it to raw URLs and
 * rule paths only: paths arriving in events/requests are already normalised
 * by the sender, and normalising twice is not idempotent ("/100%25").
 */
export function normalisePath(input: string): string {
  let p = (input || '').replace(/^[a-z][a-z\d+.-]*:\/\/[^/?#]*/i, '').split(/[?#]/)[0];
  if (!/%(?![\da-f]{2})/i.test(p)) {
    try {
      p = decodeURIComponent(p);
    } catch {
      /* invalid UTF-8: keep undecoded */
    }
  }
  p = p.replace(/\/+$/, '');
  return (p[0] === '/' ? p : '/' + p).slice(0, 512);
}

/** Truncate to a max number of UTF-16 code units without splitting a surrogate pair. */
export function trunc(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}
