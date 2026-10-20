import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { serveDist } from './support/serve-dist';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = resolve(root, 'site/dist');

/* Pages with their own wide composition: the home grid and the print-first cheat sheet. */
const OWN_LAYOUT = new Set(['/', '/about/cheat-sheet/']);

function routes(dir = dist): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routes(path);
    return name === 'index.html' ? [`/${relative(dist, dir)}/`.replace(/\/+/g, '/')] : [];
  });
}

let server: Awaited<ReturnType<typeof serveDist>>;
let browser: Browser;

beforeAll(async () => {
  if (!existsSync(resolve(dist, 'index.html'))) throw new Error('site/dist is missing; run npm run build first');
  server = await serveDist(dist);
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => { await browser?.close(); await server?.close(); });

describe('one reading column on content pages', () => {
  it('keeps prose, tables and record grids inside the column that starts at the page title', async () => {
    const pages = routes().filter((route) => !OWN_LAYOUT.has(route));
    expect(pages.length).toBeGreaterThan(15);
    const offenders: string[] = [];
    for (const width of [1280, 820]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      for (const route of pages) {
        await page.goto(`${server.origin}${route}`);
        const found = await page.evaluate(() => {
          const title = document.querySelector('main h1');
          if (!title) return ['no h1'];
          const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
          const left = title.getBoundingClientRect().left;
          const right = left + 40 * rem;
          /* Figures that need width may run past the column: timelines, diagrams, code, the crosswalk. */
          const exempt = '.timeline, .diagram, .technical-figure, pre, .crosswalk, .resource-grid, nav, .table-overflow table';
          const blocks = [...document.querySelectorAll<HTMLElement>('main :is(p, ul, ol, dl, h2, h3, h4, blockquote, .table-overflow, .record-grid, details, .notice)')]
            .filter((element) => !element.closest(exempt) && element.getClientRects().length > 0);
          return blocks.flatMap((element) => {
            const box = element.getBoundingClientRect();
            const name = `${element.tagName.toLowerCase()}${element.classList[0] ? `.${element.classList[0]}` : ''}`;
            const issues: string[] = [];
            if (box.right > right + 1) issues.push(`${name} ends at ${Math.round(box.right)} past the column edge ${Math.round(right)}`);
            if (element.matches('blockquote, .table-overflow, .record-grid') && Math.abs(box.left - left) > 1) issues.push(`${name} starts at ${Math.round(box.left)}, not at the column edge ${Math.round(left)}`);
            return issues;
          });
        });
        offenders.push(...found.map((issue) => `${route} @${width}: ${issue}`));
      }
      await page.close();
    }
    expect(offenders).toEqual([]);
  });

  it('centres the reading column in the page frame on content pages, and no page scrolls sideways', async () => {
    const all = routes();
    const offenders: string[] = [];
    for (const width of [1024, 1100, 1180, 1280, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      for (const route of all) {
        await page.goto(`${server.origin}${route}`);
        const found = await page.evaluate(() => {
          const issues: string[] = [];
          const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
          if (overflow > 0) issues.push(`scrolls sideways by ${overflow}px`);
          const main = document.querySelector('main');
          const title = document.querySelector('main h1');
          if (main && title) {
            const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
            const frame = main.getBoundingClientRect();
            const left = title.getBoundingClientRect().left - frame.left;
            const right = frame.right - (title.getBoundingClientRect().left + 40 * rem);
            if (Math.abs(left - right) > 3) issues.push(`column is off centre: ${Math.round(left)}px left, ${Math.round(right)}px right`);
          }
          return issues;
        });
        const ownLayout = OWN_LAYOUT.has(route);
        offenders.push(...found.filter((issue) => !ownLayout || issue.startsWith('scrolls')).map((issue) => `${route} @${width}: ${issue}`));
      }
      await page.close();
    }
    expect(offenders).toEqual([]);
  });
});

