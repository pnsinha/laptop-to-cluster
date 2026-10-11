import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { serveDist } from './support/serve-dist';

vi.setConfig({ testTimeout: 180_000, hookTimeout: 60_000 });

const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = resolve(root, 'site/dist');

/* The owner's type ramp (Oct 10): reading text never above 16 px, the lede at 18 px, the page heading at most 32 px. */
const BODY_MAX = 16;
const LEDE_MAX = 18;
const H1_MAX = 32;
const WIDTHS = [390, 820, 1280];
/* A long paragraph, list item or table cell is reading text; short labels and captions are not tested here. */
const LONG_TEXT = 60;

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

describe('the type ramp: reading text at most 16 px, page headings at most 32 px', () => {
  it('has no reading paragraph, list item or table cell above 16 px (the lede may be 18 px) and no h1 above 32 px, on every route at 390, 820 and 1280 px', async () => {
    const pages = routes();
    expect(pages.length).toBeGreaterThan(15);
    const offenders: string[] = [];
    for (const width of WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      for (const route of pages) {
        await page.goto(`${server.origin}${route}`);
        const found = await page.evaluate(({ bodyMax, ledeMax, h1Max, longText }) => {
          const issues: string[] = [];
          const size = (element: Element) => Number.parseFloat(getComputedStyle(element).fontSize);
          const label = (element: Element) => `${element.tagName.toLowerCase()}${element.classList[0] ? `.${element.classList[0]}` : ''}`;
          for (const element of document.querySelectorAll<HTMLElement>('main p, main li, main td')) {
            if (element.getClientRects().length === 0) continue;
            if ((element.textContent ?? '').trim().length < longText) continue;
            const max = element.closest('.lede') ? ledeMax : bodyMax;
            if (size(element) > max + 0.01) issues.push(`${label(element)} is ${size(element).toFixed(2)}px, above ${max}px: "${(element.textContent ?? '').trim().slice(0, 40)}"`);
          }
          const headings = [...document.querySelectorAll<HTMLElement>('h1')];
          if (headings.length === 0) issues.push('no h1');
          for (const heading of headings) if (size(heading) > h1Max + 0.01) issues.push(`h1 is ${size(heading).toFixed(2)}px, above ${h1Max}px`);
          return issues;
        }, { bodyMax: BODY_MAX, ledeMax: LEDE_MAX, h1Max: H1_MAX, longText: LONG_TEXT });
        offenders.push(...found.map((issue) => `${route} @${width}: ${issue}`));
      }
      await page.close();
    }
    expect(offenders).toEqual([]);
  });

  it('steps evenly at 1280 px: body 16, lede 18, h3 20, h2 24, h1 32, on a content page and on the home page', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const sizes = async (route: string) => {
      await page.goto(`${server.origin}${route}`);
      return page.evaluate(() => {
        const size = (selector: string) => {
          const element = document.querySelector(selector);
          return element ? Number.parseFloat(getComputedStyle(element).fontSize) : null;
        };
        return {
          h1: size('main h1'), h2: size('main h2'), h3: size('main h3'), lede: size('main .lede'),
          body: size('main p:not(.lede):not([class])') ?? size('main p'),
        };
      });
    };
    const content = await sizes('/guide/baseline-single-node-pattern/');
    expect(content).toEqual({ h1: 32, h2: 24, h3: 20, lede: 18, body: 16 });
    const home = await sizes('/');
    expect(home.h1).toBe(32);
    expect(home.lede).toBe(18);
    expect(home.h2).toBe(24);
    await page.close();
  });

  it('sets interface labels at 15 px and running text at 16 px at 1280 px', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const sizesOf = async (route: string, selectors: string[]) => {
      await page.goto(`${server.origin}${route}`);
      return page.evaluate((list) => Object.fromEntries(list.map((selector) => {
        const element = document.querySelector(selector);
        return [selector, element ? Number.parseFloat(getComputedStyle(element).fontSize) : null];
      })), selectors);
    };
    const home = await sizesOf('/', ['.site-nav__link', '.skip', '.action--primary', '.hero__secondary-link', '.door__link', '.door__summary', '.footer-links a', '.door__who', '.concept__side', '.hero .lede']);
    expect(home).toEqual({
      '.site-nav__link': 15, '.skip': 15, '.action--primary': 15, '.hero__secondary-link': 15, '.door__link': 15, '.footer-links a': 15,
      /* Already at the 14 px floor: unchanged. */
      '.door__who': 14, '.concept__side': 14,
      '.door__summary': 16,
      '.hero .lede': 18,
    });
    const module = await sizesOf('/guide/baseline-single-node-pattern/', ['.breadcrumbs a', '.breadcrumbs [aria-current="page"]', 'main th', 'main td', '.module-pager a span:not(.module-pager__direction)', '.module-pager__direction', 'main summary', '.module-content > p', '.module-content > ul > li']);
    expect(module).toEqual({
      '.breadcrumbs a': 15, '.breadcrumbs [aria-current="page"]': 14, 'main th': 15, 'main td': 16,
      '.module-pager a span:not(.module-pager__direction)': 15, '.module-pager__direction': 14, 'main summary': 15,
      '.module-content > p': 16, '.module-content > ul > li': 16,
    });
    const about = await sizesOf('/about/project/', ['.section-nav__link', 'main th', 'main td']);
    expect(about).toEqual({ '.section-nav__link': 15, 'main th': 15, 'main td': 16 });
    await page.close();
  });

  it('keeps every visible text element at 14 px or more, at 390 and 1280 px, outside diagrams', async () => {
    const offenders: string[] = [];
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      for (const route of routes()) {
        await page.goto(`${server.origin}${route}`);
        const found = await page.evaluate(() => [...document.body.querySelectorAll<HTMLElement>('*')].flatMap((element) => {
          if (element.closest('svg, .vh, .skip') || element.getClientRects().length === 0) return [];
          const own = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '');
          const size = Number.parseFloat(getComputedStyle(element).fontSize);
          return own && size < 13.99 ? [`${element.tagName.toLowerCase()}${element.classList[0] ? `.${element.classList[0]}` : ''} is ${size}px`] : [];
        }));
        offenders.push(...found.map((issue) => `${route} @${width}: ${issue}`));
      }
      await page.close();
    }
    expect(offenders).toEqual([]);
  });

  it('never makes a heading level smaller than the one below it, at any tested width', async () => {
    const offenders: string[] = [];
    for (const width of WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      for (const route of ['/', '/guide/tour/', '/guide/baseline-single-node-pattern/', '/about/project/']) {
        await page.goto(`${server.origin}${route}`);
        const s = await page.evaluate(() => {
          const size = (selector: string) => {
            const element = document.querySelector(selector);
            return element ? Number.parseFloat(getComputedStyle(element).fontSize) : null;
          };
          return { h1: size('main h1'), h2: size('main h2'), h3: size('main h3'), body: size('main p:not(.lede)') };
        });
        const chain: Array<[string, number | null]> = [['h1', s.h1], ['h2', s.h2], ['h3', s.h3], ['body', s.body]];
        for (let i = 0; i < chain.length - 1; i++) {
          const [upper, upperSize] = chain[i];
          const [lower, lowerSize] = chain[i + 1];
          if (upperSize !== null && lowerSize !== null && upperSize <= lowerSize) offenders.push(`${route} @${width}: ${upper} ${upperSize}px is not above ${lower} ${lowerSize}px`);
        }
      }
      await page.close();
    }
    expect(offenders).toEqual([]);
  });
});
