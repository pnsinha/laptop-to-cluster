import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ACKNOWLEDGMENT_TEXT } from '../../site/src/content/acknowledgment';
import { serveDist } from './support/serve-dist';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = resolve(root, 'site/dist');
const css = readFileSync(resolve(root, 'site/src/styles/enhancements.css'), 'utf8');
const ROUTE = '/about/cheat-sheet/';
const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
let server: Awaited<ReturnType<typeof serveDist>>;
let browser: Browser;

beforeAll(async () => {
  if (!existsSync(resolve(dist, 'index.html'))) throw new Error('site/dist is missing; run npm run build first');
  server = await serveDist(dist);
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => { await browser?.close(); await server?.close(); });

async function printed(route: string, stress = false) {
  const page = await browser.newPage();
  page.setDefaultTimeout(5_000);
  await page.goto(`${server.origin}${route}`);
  await page.emulateMedia({ media: 'print' });
  /* Stress: 0.15 in more margin on every side than the stylesheet asks for. */
  if (stress) await page.addStyleTag({ content: '@page cheat { margin: 0.5in }' });
  return page;
}

describe('cheat sheet: print stylesheet source', () => {
  it('scopes the page margin and the chrome rules to the cheat sheet only', () => {
    expect(css).toMatch(/@page cheat \{ margin: 0\.35in; \}/);
    expect(css).toContain('html:has(.cheat-sheet) { page: cheat; }');
    expect(css).not.toMatch(/@page\s*\{/);
    expect(css).not.toMatch(/transition|animation|@keyframes/i);
  });
});

describe('cheat sheet: print output', () => {
  it('fits on one Letter page and one A4 page, with the stress margin too', async () => {
    for (const stress of [false, true]) {
      const page = await printed(ROUTE, stress);
      for (const format of ['Letter', 'A4'] as const) {
        const pdf = await page.pdf({ format, printBackground: true });
        expect(pageCount(pdf), `${format}${stress ? ' (stress margin)' : ''}`).toBe(1);
      }
      await page.close();
    }
  });

  it('hides the site chrome and keeps only the title, the sheet and the acknowledgment', async () => {
    const page = await printed(ROUTE);
    const visible = await page.evaluate(() => ['.skip', '.site-header', '.breadcrumbs', '.section-nav', '.sources-scope', '.table-overflow__instruction', '.site-footer nav', '.site-footer .release', '.content-header .lede']
      .filter((selector) => [...document.querySelectorAll<HTMLElement>(selector)].some((el) => getComputedStyle(el).display !== 'none')));
    expect(visible).toEqual([]);
    const shown = await page.evaluate(() => ['h1', '.cheat-sheet table', '.cheat-sheet pre', '.site-footer .acknowledgment']
      .map((selector) => [selector, document.querySelector<HTMLElement>(selector)!.offsetHeight > 0]));
    expect(shown.every(([, ok]) => ok), JSON.stringify(shown)).toBe(true);
    await page.close();
  });

  it('prints the verbatim acknowledgment and disclaimer', async () => {
    const page = await printed(ROUTE);
    const text = await page.locator('.site-footer .acknowledgment').innerText();
    expect(normalize(text)).toBe(normalize(ACKNOWLEDGMENT_TEXT));
    await page.close();
  });

  it('keeps the print type above the floors: body 8.5 pt, tables and code 8 pt, acknowledgment 7 pt', async () => {
    const page = await printed(ROUTE);
    const sizes = await page.evaluate(() => {
      const px = (selector: string) => parseFloat(getComputedStyle(document.querySelector(selector)!).fontSize);
      return { body: px('.cheat-sheet p'), cell: px('.cheat-sheet td'), code: px('.cheat-sheet pre'), ack: px('.site-footer .acknowledgment') };
    });
    const pt = (value: number) => Math.round(value * 0.75 * 100) / 100;
    expect(pt(sizes.body)).toBeGreaterThanOrEqual(8.5);
    expect(pt(sizes.cell)).toBeGreaterThanOrEqual(8);
    expect(pt(sizes.code)).toBeGreaterThanOrEqual(8);
    expect(pt(sizes.ack)).toBeGreaterThanOrEqual(7);
    await page.close();
  });

  it('leaves other pages printing as before', async () => {
    const page = await printed('/about/project/');
    const display = await page.evaluate(() => getComputedStyle(document.querySelector('.site-header')!).display);
    expect(display).not.toBe('none');
    await page.close();
  });
});

describe('cheat sheet: screen', () => {
  it('does not overflow the page at 320 px; the tables scroll in their own regions', async () => {
    const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
    page.setDefaultTimeout(5_000);
    await page.goto(`${server.origin}${ROUTE}`);
    const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, view: document.documentElement.clientWidth }));
    expect(widths.page).toBeLessThanOrEqual(widths.view);
    expect(await page.locator('.cheat-sheet .table-overflow[tabindex="0"]').count()).toBe(2);
    await page.close();
  });
});
