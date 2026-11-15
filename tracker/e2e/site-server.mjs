// Static server for the e2e test sites. /spa/* falls back to spa.html (like a
// Wix site served with "Load code once"). Any {{COLLECT}} / {{KEY_*}} token in
// HTML is replaced so pages point at the mock collector.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'site');
const PORT = Number(process.env.SITE_PORT || 4021);
const COLLECT = process.env.COLLECT_URL || 'http://127.0.0.1:4020';
export const KEYS = {
  KEY_PLAIN: 'pk_E2ePlainSite000000000001',
  KEY_SPA: 'pk_E2eWixLikeSpa00000000002',
  KEY_CONSENT: 'pk_E2eConsentSite0000000003',
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    if (p === '/' || p === '') p = '/index.html';
    if (p === '/spa' || p.startsWith('/spa/')) p = '/spa.html';
    const file = path.join(root, path.normalize(p));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('not found');
    }
    let body = fs.readFileSync(file);
    const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'application/javascript' : 'application/octet-stream';
    if (file.endsWith('.html')) {
      let html = body.toString('utf8').replaceAll('{{COLLECT}}', COLLECT);
      for (const [k, v] of Object.entries(KEYS)) html = html.replaceAll(`{{${k}}}`, v);
      body = Buffer.from(html);
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  })
  .listen(PORT, () => process.stdout.write(`test site on http://localhost:${PORT}\n`));
