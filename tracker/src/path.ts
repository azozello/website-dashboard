/**
 * Path normalisation, Data contract v1 §1. Shared test vectors:
 * contract/v1/path-normalisation.json (ingest and the WP plugin run the same).
 *
 * Take the pathname (drop scheme+host, query, fragment); percent-decode, but
 * leave the path undecoded if any escape is malformed or not valid UTF-8;
 * strip trailing slashes except for "/"; keep case; max 512 chars.
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
  return (p[0] == '/' ? p : '/' + p).slice(0, 512);
}
