import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';

const root = resolve(process.argv[2] ?? '.');
const dist = join(root, 'site/dist');
const representative = ['/', '/resources/', '/guide/scheduler-as-orchestrator/', '/guide/baseline-single-node-pattern/', '/start/', '/diagnostics/', '/releases/v0-1-0/'];
const changed = (process.env.CHANGED_PUBLIC_PATHS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
const paths = [...new Set([...representative, ...changed])];
const mime = new Map([['.html', 'text/html'], ['.css', 'text/css'], ['.js', 'text/javascript'], ['.json', 'application/json'], ['.xml', 'application/xml']]);

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const safe = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^\//, '');
  let file = join(dist, safe);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file) || !file.startsWith(dist)) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.setHeader('Content-Type', mime.get(extname(file)) ?? 'application/octet-stream');
  createReadStream(file).pipe(response);
});
await new Promise<void>((resolveReady) => server.listen(0, '127.0.0.1', resolveReady));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Accessibility server did not start');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const failures: string[] = [];
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  for (const path of paths) {
    const response = await page.goto(new URL(path, origin).href, { waitUntil: 'networkidle' });
    if (!response?.ok()) {
      failures.push(`${path}:page [A11Y-PAGE] expected HTTP 200, received ${response?.status()}`);
      continue;
    }
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    for (const violation of results.violations) {
      for (const node of violation.nodes) failures.push(`${path}:${node.target.join(' ')} [AXE-${violation.id}] ${violation.help}`);
    }
    await page.keyboard.press('Tab');
    const firstFocus = await page.locator(':focus').getAttribute('href');
    if (firstFocus !== '#main') failures.push(`${path}:keyboard [A11Y-KEYBOARD] first focus must be the skip link`);
    await page.keyboard.press('Enter');
    const focusedId = await page.locator(':focus').getAttribute('id');
    if (focusedId !== 'main') failures.push(`${path}:keyboard [A11Y-KEYBOARD] skip link must focus the main landmark`);
  }
  await page.goto(`${origin}/resources/`);
  const controls = page.locator('button, summary, input, select, textarea, [tabindex]:not([tabindex="-1"])');
  for (let index = 0; index < await controls.count(); index += 1) {
    const control = controls.nth(index);
    if (!(await control.isVisible())) continue;
    await control.focus();
    if (!(await control.evaluate((element) => element === document.activeElement))) failures.push(`/resources/:control-${index} [A11Y-KEYBOARD] interactive control is not focusable`);
  }
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.error(failures.map((failure) => `ERROR: ${failure}`).join('\n'));
  process.exit(1);
}
console.log(`axe-core WCAG 2.2 AA and keyboard scans passed for ${paths.length} built pages.`);
