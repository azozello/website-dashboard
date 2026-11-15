import crypto from 'node:crypto';

// Same generators and hash as ingest/src/util.ts (contract §1): ingest verifies
// site secrets and webhook tokens against these SHA-256 hex hashes.

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

export const sha256hex = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const newSiteKey = () => 'pk_' + base62(24);
export const newSiteSecret = () => 'sk_' + base62(40);
export const newWebhookToken = () => 'wh_' + base62(32);

/** "https://www.example.com/x" → "https://www.example.com"; null when not an http(s) URL. */
export function toOrigin(input: string): string | null {
  try {
    const u = new URL(input.trim());
    return /^https?:$/.test(u.protocol) ? u.origin : null;
  } catch {
    return null;
  }
}
