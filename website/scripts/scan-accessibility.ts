/* Check 3, accessibility: axe (WCAG 2.2 AA rules) on every built page, once in the light theme and
   once in the dark one. Usage: tsx scripts/scan-accessibility.ts [website-root]; build first. */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize, relative, resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const root = resolve(process.argv[2] ?? '.');
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/index.html is missing: run npm run build first');

const filesUnder = (directory: string): string[] => readdirSync(directory).flatMap((name) => {
  const path = join(directory, name);
  return statSync(path).isDirectory() ? filesUnder(path) : [path];
});
/* dist/about/project/index.html -> /about/project/; dist/404.html -> /404.html */
const paths = filesUnder(dist).filter((file) => file.endsWith('.html')).map((file) => `/${relative(dist, file).replaceAll('\\', '/').replace(/index\.html$/, '')}`).sort();

const mime = new Map([['.html', 'text/html'], ['.css', 'text/css'], ['.js', 'text/javascript'], ['.svg', 'image/svg+xml'], ['.woff2', 'font/woff2']]);
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  let file = join(dist, normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, ''));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(dist) || !existsSync(file)) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.setHeader('Content-Type', mime.get(extname(file)) ?? 'application/octet-stream');
  createReadStream(file).pipe(response);
});
await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('the page server did not start');
const origin = `http://127.0.0.1:${address.port}`;

const failures: string[] = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const colorScheme of ['light', 'dark'] as const) {
    const context = await browser.newContext({ colorScheme });
    const page = await context.newPage();
    for (const path of paths) {
      const response = await page.goto(new URL(path, origin).href, { waitUntil: 'networkidle' });
      if (!response?.ok()) {
        failures.push(`${path} (${colorScheme}): HTTP ${response?.status()}`);
        continue;
      }
      const theme = await page.evaluate(() => document.documentElement.dataset.theme);
      if (theme !== colorScheme) failures.push(`${path} (${colorScheme}): the page rendered the ${theme} theme`);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      for (const violation of results.violations) {
        for (const node of violation.nodes) failures.push(`${path} (${colorScheme}) ${node.target.join(' ')}: [${violation.id}] ${violation.help}`);
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(failures.map((failure) => `ERROR: ${failure}`).join('\n'));
  process.exit(1);
}
console.log(`axe found no violations on ${paths.length} built pages, in the light and the dark theme.`);
