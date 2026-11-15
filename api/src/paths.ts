/**
 * Path normalisation, Data contract v1 §1 (same rule and code as ingest/src/util.ts and r1.js).
 * The dashboard is a "source" for paths a person types (booking paths, section and thank-you
 * pages), so it normalises them once, before storing.
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
