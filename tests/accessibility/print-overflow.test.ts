import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { checkPrintOverflow } from './browser-checks';

/* The built pages that hold long code lines or a height-capped excerpt: the Translate module, the start page, the scheduler concept module and Module 2, plus the pages whose print layout must not change (home crosswalk, cheat sheet). */
const PAGES = [
  '/guide/compose-to-hpc-translation/',
  '/start/',
  '/guide/scheduler-as-orchestrator/',
  '/guide/baseline-single-node-pattern/',
  '/',
  '/about/cheat-sheet/',
];
const dist = join(fileURLToPath(new URL('../..', import.meta.url)), 'site/dist');
const mime = new Map([['.html', 'text/html'], ['.css', 'text/css'], ['.js', 'text/javascript'], ['.json', 'application/json'], ['.svg', 'image/svg+xml'], ['.woff2', 'font/woff2']]);

let browser: Browser;
let close: () => Promise<void>;
let origin = '';
beforeAll(async () => {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    let file = join(dist, normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, ''));
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file) || !file.startsWith(dist)) { response.writeHead(404).end('Not found'); return; }
    response.setHeader('Content-Type', mime.get(extname(file)) ?? 'application/octet-stream');
    createReadStream(file).pipe(response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('static server did not start');
  origin = `http://127.0.0.1:${address.port}`;
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); await close?.(); });

describe('built pages lose no code on paper', () => {
  for (const path of PAGES) {
    it(`${path} shows every code line in print at 740 px`, async () => {
      expect(await checkPrintOverflow(browser, origin, path)).toEqual([]);
    }, 60_000);
  }
});
