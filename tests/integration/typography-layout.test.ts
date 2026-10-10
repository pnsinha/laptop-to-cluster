import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { serveDist } from './support/serve-dist';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = resolve(root, 'site/dist');
const ABOUT = '/about/project/';
const BASELINE = '/guide/baseline-single-node-pattern/';

function routes(dir = dist): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routes(path);
    return name === 'index.html' ? [`/${relative(dist, dir)}/`.replace(/\/+/g, '/')] : [];
  });
}
const html = (route: string) => readFileSync(resolve(dist, `.${route}`, 'index.html'), 'utf8');
const h1Of = (markup: string) => /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(markup)?.[1] ?? '';

let server: Awaited<ReturnType<typeof serveDist>>;
let browser: Browser;
beforeAll(async () => {
  if (!existsSync(resolve(dist, 'index.html'))) throw new Error('site/dist is missing; run npm run build first');
  server = await serveDist(dist);
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => { await browser?.close(); await server?.close(); });

async function open(route: string, width: number): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(`${server.origin}${route}`);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

describe('built About page title', () => {
  it('wraps the hyphenated compound in the h1 and leaves the visible title unchanged', () => {
    const page = html(ABOUT);
    expect(page).toContain('<span class="h-compound">Laptop-to-Cluster</span>');
    expect(h1Of(page)).toBe('About the <span class="h-compound">Laptop-to-Cluster</span> Guide');
    expect(h1Of(page).replace(/<[^>]+>/g, '')).toBe('About the Laptop-to-Cluster Guide');
    expect(/<title>([^<]*)<\/title>/.exec(page)?.[1].startsWith('About the Laptop-to-Cluster Guide | ')).toBe(true);
  });

  it('wraps nothing but hyphenated words on any built page', () => {
    for (const route of routes()) {
      const title = h1Of(html(route));
      for (const [, inner] of title.matchAll(/<span class="h-compound">([\s\S]*?)<\/span>/g)) expect(inner, route).toMatch(/^[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)+$/u);
      expect(title.replace(/<span class="h-compound">([^<]*)<\/span>/g, '$1'), route).not.toMatch(/<(?!\/?span\b)/);
    }
  });
});

describe('titles in the browser', () => {
  it('keeps a compound on one line from 30rem up, and lets a 320 px phone break it without overflow', async () => {
    const pages = routes().filter((route) => /class="h-compound"/.test(h1Of(html(route))));
    expect(pages).toContain(ABOUT);
    expect(pages).toContain(BASELINE);
    const offenders: string[] = [];
    for (const width of [1280, 480, 390, 320]) {
      for (const route of pages) {
        const page = await open(route, width);
        const state = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          hyphens: getComputedStyle(document.querySelector('main h1')!).hyphens,
          compounds: [...document.querySelectorAll<HTMLElement>('main h1 .h-compound')].map((el) => ({ lines: el.getClientRects().length, white: getComputedStyle(el).whiteSpace })),
        }));
        if (state.overflow) offenders.push(`${route} @${width}: the page overflows horizontally`);
        if (state.hyphens !== 'none') offenders.push(`${route} @${width}: h1 hyphens is ${state.hyphens}`);
        for (const compound of state.compounds) {
          if (width >= 480 && (compound.white !== 'nowrap' || compound.lines !== 1)) offenders.push(`${route} @${width}: a compound is ${compound.white} on ${compound.lines} lines`);
          if (width < 480 && compound.white !== 'normal') offenders.push(`${route} @${width}: a compound is ${compound.white}, so it cannot break`);
        }
        await page.close();
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('quote blocks, reading leading and tables in the browser', () => {
  it('sets the quote upright at 0.9444 of the reading size, with no bold italic', async () => {
    const page = await open(BASELINE, 1280);
    const q = await page.evaluate(() => {
      const quote = document.querySelector('main blockquote')!;
      const reading = document.querySelector('main .module-content > p')!;
      const inner = getComputedStyle(quote.querySelector('strong')!);
      const own = getComputedStyle(quote);
      return {
        quoteSize: parseFloat(own.fontSize), readingSize: parseFloat(getComputedStyle(reading).fontSize),
        quoteStyle: own.fontStyle, strongStyle: inner.fontStyle, strongWeight: Number(inner.fontWeight),
        paragraphSize: parseFloat(getComputedStyle(quote.querySelector('p')!).fontSize),
        rule: own.borderInlineStartWidth,
      };
    });
    expect(q.quoteStyle).toBe('normal');
    expect(q.strongStyle).toBe('normal');
    expect(q.strongWeight).toBeGreaterThanOrEqual(600);
    expect(q.quoteSize / q.readingSize).toBeGreaterThan(0.9444 - 0.006);
    expect(q.quoteSize / q.readingSize).toBeLessThan(0.9444 + 0.006);
    expect(q.paragraphSize).toBe(q.quoteSize);
    expect(q.rule).not.toBe('0px');
    await page.close();
  });

  it('keeps the quote at 0.9444 of the reading size on every built page that has one', async () => {
    const pages = routes().filter((route) => html(route).includes('<blockquote'));
    expect(pages).toContain(BASELINE);
    expect(pages).toContain('/milestones/2/');
    const offenders: string[] = [];
    for (const width of [1280, 390]) {
      for (const route of pages) {
        const page = await open(route, width);
        const quotes = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('main blockquote')].map((quote) => {
          /* The reading size here, read from the token on a probe in the quote's own container. */
          const probe = document.createElement('span');
          probe.style.fontSize = 'var(--text-reading)';
          quote.parentElement!.append(probe);
          const reading = parseFloat(getComputedStyle(probe).fontSize);
          probe.remove();
          return { ratio: parseFloat(getComputedStyle(quote).fontSize) / reading, style: getComputedStyle(quote).fontStyle };
        }));
        for (const quote of quotes) if (Math.abs(quote.ratio - 0.9444) > 0.006 || quote.style !== 'normal') offenders.push(`${route} @${width}: ratio ${quote.ratio.toFixed(4)}, ${quote.style}`);
        await page.close();
      }
    }
    expect(offenders).toEqual([]);
  });

  it('sets reading text at 1.45 leading', async () => {
    const page = await open(BASELINE, 1280);
    const ratio = await page.evaluate(() => {
      const style = getComputedStyle(document.querySelector('main .module-content > p')!);
      return parseFloat(style.lineHeight) / parseFloat(style.fontSize);
    });
    expect(ratio).toBeGreaterThan(1.445);
    expect(ratio).toBeLessThan(1.455);
    await page.close();
  });

  it('draws a table with no frame and no header fill, one rule under the header row, and text on the column edges', async () => {
    const page = await open(BASELINE, 1280);
    const t = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--rule)';
      document.body.append(probe);
      const rule = getComputedStyle(probe).color;
      probe.remove();
      const region = document.querySelector<HTMLElement>('main .table-overflow')!;
      const first = region.querySelector<HTMLElement>('thead th:first-child')!;
      const last = region.querySelector<HTMLElement>('thead th:last-child')!;
      const cell = region.querySelector<HTMLElement>('tbody tr + tr td:nth-child(2)')!;
      const lastBodyCell = region.querySelector<HTMLElement>('tbody tr td:last-child')!;
      const region0 = region.getBoundingClientRect();
      const frame = getComputedStyle(region);
      const head = getComputedStyle(first);
      return {
        rule, frame: [frame.borderTopWidth, frame.borderRightWidth, frame.borderBottomWidth, frame.borderLeftWidth],
        fill: head.backgroundColor, headWidth: head.borderBottomWidth, headStyle: head.borderBottomStyle, headColor: head.borderBottomColor,
        headTopWidth: head.borderTopWidth, rowLine: [getComputedStyle(cell).borderTopWidth, getComputedStyle(cell).borderTopStyle, getComputedStyle(cell).borderTopColor],
        firstPad: head.paddingLeft, lastPad: getComputedStyle(last).paddingRight, lastBodyPad: getComputedStyle(lastBodyCell).paddingRight,
        innerPad: getComputedStyle(cell).paddingLeft,
        firstEdge: first.getBoundingClientRect().left - region0.left, lastEdge: region0.right - last.getBoundingClientRect().right,
        role: region.getAttribute('role'), tabindex: region.getAttribute('tabindex'),
      };
    });
    expect(t.frame).toEqual(['0px', '0px', '0px', '0px']);
    expect(t.fill).toBe('rgba(0, 0, 0, 0)');
    expect([t.headWidth, t.headStyle, t.headColor]).toEqual(['1px', 'solid', t.rule]);
    expect(t.headTopWidth).toBe('0px');
    expect(t.rowLine).toEqual(['1px', 'solid', t.rule]);
    expect(t.firstPad).toBe('0px');
    expect(t.lastPad).toBe('0px');
    expect(t.lastBodyPad).toBe('0px');
    expect(t.innerPad).not.toBe('0px');
    expect(Math.abs(t.firstEdge)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(t.lastEdge)).toBeLessThanOrEqual(0.5);
    expect([t.role, t.tabindex]).toEqual(['region', '0']);
    await page.close();
  });

  it('aligns a caption with the flush table text and keeps its vertical padding', async () => {
    const page = await open(BASELINE, 1280);
    const c = await page.evaluate(() => {
      const table = document.querySelector('main .table-overflow table')!;
      const caption = document.createElement('caption');
      caption.textContent = 'Caption';
      table.prepend(caption);
      const own = getComputedStyle(caption);
      const range = document.createRange();
      range.selectNodeContents(caption);
      return { left: own.paddingLeft, right: own.paddingRight, top: own.paddingTop, bottom: own.paddingBottom, edge: range.getBoundingClientRect().left - table.querySelector('thead th')!.getBoundingClientRect().left };
    });
    expect([c.left, c.right]).toEqual(['0px', '0px']);
    expect([c.top, c.bottom]).toEqual(['12px', '12px']);
    expect(Math.abs(c.edge)).toBeLessThanOrEqual(0.5);
    await page.close();
  });

  it('draws the header rule at 2 px in the darker border colour in print, as it does at 1 px on screen', async () => {
    const page = await open(BASELINE, 1280);
    const read = () => page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--border)';
      document.body.append(probe);
      const border = getComputedStyle(probe).color;
      probe.remove();
      const head = getComputedStyle(document.querySelector('main .table-overflow thead th')!);
      return { width: head.borderBottomWidth, style: head.borderBottomStyle, color: head.borderBottomColor, border };
    });
    const screen = await read();
    expect([screen.width, screen.style]).toEqual(['1px', 'solid']);
    await page.emulateMedia({ media: 'print' });
    const print = await read();
    expect([print.width, print.style]).toEqual(['2px', 'solid']);
    expect(print.color).toBe(print.border);
    await page.close();
  });

  it('keeps the table text on the column edge on the narrowest phone, with the scroll region still scrolling', async () => {
    const page = await open(BASELINE, 320);
    const m = await page.evaluate(() => {
      const region = document.querySelector<HTMLElement>('main .table-overflow')!;
      const instruction = region.querySelector<HTMLElement>('.table-overflow__instruction')!;
      const text = document.createRange();
      text.selectNodeContents(instruction);
      return {
        page: document.documentElement.scrollWidth <= document.documentElement.clientWidth, overflowX: getComputedStyle(region).overflowX, instruction: getComputedStyle(instruction).display,
        instructionEdge: text.getBoundingClientRect().left - region.querySelector('thead th')!.getBoundingClientRect().left,
      };
    });
    expect(m.page).toBe(true);
    expect(Math.abs(m.instructionEdge)).toBeLessThanOrEqual(0.5);
    expect(m.overflowX).toBe('auto');
    expect(m.instruction).not.toBe('none');
    await page.close();
  });
});

describe('scroll cue for frameless tables', () => {
  /* Scroll shadows would need gradients, which the visual policy forbids (VISUAL-DEPENDENCY), so a region that can scroll shows its instruction instead. */
  it('shows the scroll instruction at 1280 px on a region that overflows, and hides it on one that fits', async () => {
    const page = await open('/start/', 1280);
    const regions = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('main .table-overflow')].map((region) => ({
      scrolls: region.scrollWidth > region.clientWidth + 1, shown: getComputedStyle(region.querySelector('.table-overflow__instruction')!).display !== 'none',
    })));
    expect(regions.some((region) => region.scrolls), 'a region that overflows at 1280').toBe(true);
    for (const region of regions) expect(region.shown, JSON.stringify(region)).toBe(region.scrolls);
    await page.close();
    const fits = await open(ABOUT, 1280);
    const about = await fits.evaluate(() => [...document.querySelectorAll<HTMLElement>('main .table-overflow')].map((region) => ({
      scrolls: region.scrollWidth > region.clientWidth + 1, shown: getComputedStyle(region.querySelector('.table-overflow__instruction')!).display !== 'none',
    })));
    expect(about.length).toBeGreaterThan(0);
    for (const region of about) expect(region.shown, JSON.stringify(region)).toBe(region.scrolls);
    await fits.close();
  });

  it('shows the instruction below 64rem on every region, as before', async () => {
    const page = await open(BASELINE, 820);
    const shown = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('main .table-overflow')].map((region) => getComputedStyle(region.querySelector('.table-overflow__instruction')!).display !== 'none'));
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every(Boolean)).toBe(true);
    await page.close();
  });

  it('shows no scroll instruction in print, where the regions do not scroll', async () => {
    const page = await open('/start/', 1280);
    await page.emulateMedia({ media: 'print' });
    /* A scroll-state query settles one frame after the region stops being a scroll container. */
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    const shown = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('main .table-overflow')].map((region) => ({ overflow: getComputedStyle(region).overflowX, shown: getComputedStyle(region.querySelector('.table-overflow__instruction')!).display !== 'none' })));
    for (const region of shown) expect(region, JSON.stringify(region)).toEqual({ overflow: 'visible', shown: false });
    await page.close();
  });
});

describe('two-column footer', () => {
  const measure = (page: Page) => page.evaluate(() => {
    const box = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }; };
    /* An empty inline-block sits on the baseline of the line it starts, so its bottom edge is that line's baseline. */
    const baseline = (element: Element) => {
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;inline-size:0;block-size:0';
      element.insertBefore(probe, element.firstChild);
      const y = probe.getBoundingClientRect().bottom;
      probe.remove();
      return y;
    };
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return {
      rem, nav: box('.site-footer nav'), release: box('.site-footer .release'), ack: box('.site-footer .acknowledgment'), footer: box('.site-footer'),
      navBaseline: baseline(document.querySelector('.site-footer nav a')!), ackBaseline: baseline(document.querySelector('.site-footer .acknowledgment')!),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  it('puts the acknowledgment in a 40rem column beside the links at 1280 px, starting on the same line', async () => {
    const page = await open(ABOUT, 1280);
    const m = await measure(page);
    expect(Math.abs(m.ack.width - 40 * m.rem)).toBeLessThanOrEqual(1);
    expect(m.ack.left).toBeGreaterThanOrEqual(m.nav.right + 2 * m.rem - 1);
    expect(m.release.right).toBeLessThanOrEqual(m.ack.left);
    expect(Math.abs(m.navBaseline - m.ackBaseline)).toBeLessThanOrEqual(1);
    expect(m.ack.top).toBeLessThan(m.nav.bottom);
    expect(m.ack.right).toBeLessThanOrEqual(m.footer.right);
    expect(m.overflow).toBe(false);
    await page.close();
  });

  it('stacks at 820 px, with the acknowledgment under the release line at the prose measure', async () => {
    const page = await open(ABOUT, 820);
    const m = await measure(page);
    expect(m.ack.top).toBeGreaterThanOrEqual(m.release.bottom);
    expect(Math.abs(m.ack.left - m.nav.left)).toBeLessThanOrEqual(1);
    expect(m.ack.width).toBeLessThanOrEqual(42 * m.rem + 1);
    expect(m.overflow).toBe(false);
    await page.close();
  });

  it('stacks on phones with no horizontal overflow', async () => {
    for (const width of [390, 320]) {
      const page = await open(ABOUT, width);
      const m = await measure(page);
      expect(m.ack.top, `@${width}`).toBeGreaterThanOrEqual(m.release.bottom);
      expect(m.overflow, `@${width}`).toBe(false);
      await page.close();
    }
  });

  it('switches at 64rem: stacked at 1023 px, side by side at 1024 px', async () => {
    const stacked = await open(ABOUT, 1023);
    const a = await measure(stacked);
    expect(a.ack.top).toBeGreaterThanOrEqual(a.release.bottom);
    await stacked.close();
    const split = await open(ABOUT, 1024);
    const b = await measure(split);
    expect(b.ack.left).toBeGreaterThan(b.nav.right);
    await split.close();
  });
});
