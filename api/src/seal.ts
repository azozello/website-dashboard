import crypto from 'node:crypto';

/**
 * Encryption for stored third-party tokens (Search Console refresh tokens): AES-256-GCM with
 * TOKEN_ENCRYPTION_KEY. `context` (the site id) is authenticated too, so a sealed token copied
 * to another site's row doesn't open. Format: "v1:" + base64(iv 12 | tag 16 | ciphertext).
 */

const PREFIX = 'v1:';

export function seal(key: Buffer, plain: string, context: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(context, 'utf8'));
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}

/** Throws when the key, the context or the data don't match. */
export function unseal(key: Buffer, sealed: string, context: string): string {
  if (!sealed.startsWith(PREFIX)) throw new Error('unknown sealed format');
  const raw = Buffer.from(sealed.slice(PREFIX.length), 'base64');
  if (raw.length < 29) throw new Error('sealed value too short');
  const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  d.setAAD(Buffer.from(context, 'utf8'));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}
