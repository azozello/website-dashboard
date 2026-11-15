// Bundles src/index.ts into one minified IIFE (dist/r1.js + dist/r1.<version>.js)
// and enforces the 5 KB gzip budget.
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import fs from 'node:fs';

const BUDGET = 5 * 1024;
const { version } = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const out = new URL('./dist/', import.meta.url);

await build({
  entryPoints: [new URL('./src/index.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  legalComments: 'none',
  outfile: new URL('r1.js', out).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  logLevel: 'warning',
});

const file = new URL('r1.js', out);
const code = fs.readFileSync(file);
fs.copyFileSync(file, new URL(`r1.${version}.js`, out));
const gz = gzipSync(code, { level: 9 }).length;
console.log(`r1.js v${version}: ${code.length} B minified, ${gz} B gzipped (budget ${BUDGET} B, ${BUDGET - gz} B left)`);
if (gz >= BUDGET) {
  console.error('r1.js is over the 5 KB gzip budget');
  process.exit(1);
}
