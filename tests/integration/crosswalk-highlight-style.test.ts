import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CONCEPTS, type ConceptKey } from '../../site/src/content/contracts';
import { serveDist } from './support/serve-dist';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = resolve(root, 'site/dist');
const css = readFileSync(resolve(root, 'site/src/styles/enhancements.css'), 'utf8');
const globalCss = readFileSync(resolve(root, 'site/src/styles/global.css'), 'utf8');

describe('enhancements.css: source rules', () => {
  it('has no transition, animation or keyframes', () => {
    expect(css).not.toMatch(/transition|animation|@keyframes/i);
  });

  it('is imported exactly once by global.css, ahead of every rule', () => {
    expect(globalCss.match(/@import\s+['"]\.\/enhancements\.css['"]/g)).toHaveLength(1);
    const firstRule = globalCss.search(/^[^@\s/][^\n]*\{/m);
    expect(globalCss.indexOf('./enhancements.css')).toBeLessThan(firstRule);
  });

  it('draws every colour from the token file, except in the print block', () => {
    const screenOnly = css.split('@media print')[0];
    expect(screenOnly).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    for (const { key } of CONCEPTS) expect(css, key).toContain(`var(--c-${key})`);
  });

  it('lands in the single emitted stylesheet', () => {
    const sheets = readdirSync(join(dist, '_astro')).filter((name) => name.endsWith('.css'));
    expect(sheets).toHaveLength(1);
    const built = readFileSync(join(dist, '_astro', sheets[0]), 'utf8');
    expect(built).toContain('[data-concepts~=gate]'); /* minifier drops the quotes */
    expect(built).toContain('crosswalk__clear');
  });
});

let server: Awaited<ReturnType<typeof serveDist>>;
let browser: Browser;
beforeAll(async () => {
  if (!existsSync(resolve(dist, 'index.html'))) throw new Error('site/dist is missing; run npm run build first');
  server = await serveDist(dist);
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => { await browser?.close(); await server?.close(); });

async function home(options: { scheme?: 'light' | 'dark'; width?: number } = {}): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: options.width ?? 1280, height: 900 }, colorScheme: options.scheme ?? 'light' });
  page.setDefaultTimeout(3_000);
  await page.goto(`${server.origin}/`);
  return page;
}
const select = async (page: Page, key: ConceptKey) => {
  await page.locator(`.crosswalk__term[data-concept="${key}"] button`).focus();
  await page.keyboard.press('Enter');
};
/* Lean variant (R13): the selected lines are found by their computed outline, not by a class. */
const evaluateIn = <T,>(page: Page, fn: string) => page.evaluate(`(${fn})()` as never) as Promise<T>;
const parse = (value: string): [number, number, number] => {
  const match = value.match(/rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/);
  if (!match) throw new Error(`unsupported colour ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};
const luminance = ([r, g, b]: [number, number, number]) => {
  const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(parse(a)), luminance(parse(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('crosswalk highlight: computed styles in a real browser', () => {
  it('outlines and tints the selected lines and leaves the others alone', async () => {
    const page = await home();
    await select(page, 'gate');
    const styles = await page.evaluate(() => {
      const pick = (el: Element) => { const s = getComputedStyle(el); return { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, background: s.backgroundColor }; };
      const lines = [...document.querySelectorAll('.crosswalk__line')];
      const selected = lines.find((line) => getComputedStyle(line).outlineStyle !== 'none')!;
      const other = lines.find((line) => getComputedStyle(line).outlineStyle === 'none')!;
      return { selected: pick(selected), other: pick(other) };
    });
    expect(styles.selected.outlineStyle).toBe('solid');
    expect(styles.selected.outlineWidth).toBe('2px');
    expect(styles.other.outlineStyle).toBe('none');
    expect(styles.selected.background).not.toBe(styles.other.background);
    await page.close();
  });

  for (const scheme of ['light', 'dark'] as const) {
    it(`keeps the outline at least 3:1 against the line and the pane for every concept (${scheme})`, async () => {
      const page = await home({ scheme });
      for (const { key } of CONCEPTS) {
        await select(page, key);
        const colours = await page.evaluate(() => {
          const effective = (el: Element) => {
            for (let node: Element | null = el; node; node = node.parentElement) {
              const value = getComputedStyle(node).backgroundColor;
              if (!/rgba\([^)]*,\s*0\)$|transparent/.test(value)) return value;
            }
            return 'rgb(255, 255, 255)';
          };
          const line = [...document.querySelectorAll('.crosswalk__line')].find((l) => getComputedStyle(l).outlineStyle !== 'none')!;
          return { outline: getComputedStyle(line).outlineColor, line: effective(line), pane: effective(line.closest('pre')!) };
        });
        expect(contrast(colours.outline, colours.line), `${key} vs line`).toBeGreaterThanOrEqual(3);
        expect(contrast(colours.outline, colours.pane), `${key} vs pane`).toBeGreaterThanOrEqual(3);
      }
      await page.close();
    });
  }

  it('draws a focus ring of at least 2 px on the term buttons and on Show all', async () => {
    const page = await home();
    await page.locator('.crosswalk__term[data-concept="step"] button').focus();
    await page.keyboard.press('Tab');
    const term = await page.evaluate(() => { const s = getComputedStyle(document.activeElement!); return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), offset: parseFloat(s.outlineOffset) }; });
    expect(term.style).not.toBe('none');
    expect(term.width).toBeGreaterThanOrEqual(2);
    expect(term.offset).toBeGreaterThanOrEqual(2);
    await page.keyboard.press('Enter');
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('Tab');
    const clear = await page.evaluate(() => { const s = getComputedStyle(document.activeElement!); return { text: document.activeElement!.textContent, style: s.outlineStyle, width: parseFloat(s.outlineWidth) }; });
    expect(clear.text).toBe('Show all');
    expect(clear.style).not.toBe('none');
    expect(clear.width).toBeGreaterThanOrEqual(2);
    await page.close();
  });

  it('sizes the controls for reading and touch', async () => {
    const page = await home();
    await select(page, 'net');
    const sizes = await page.evaluate(() => [...document.querySelectorAll('.crosswalk button')].map((button) => {
      const box = button.getBoundingClientRect();
      return { label: button.textContent, height: box.height, font: parseFloat(getComputedStyle(button).fontSize) };
    }));
    expect(sizes).toHaveLength(5);
    for (const { label, height, font } of sizes) {
      expect(height, label!).toBeGreaterThanOrEqual(32);
      expect(font, label!).toBeGreaterThanOrEqual(15);
    }
    const statusFont = await page.locator('.crosswalk__status').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(statusFont).toBeGreaterThanOrEqual(14);
    await page.close();
  });

  it('does not transition or animate anything', async () => {
    const page = await home();
    await select(page, 'step');
    const motion = await page.evaluate(() => [...document.querySelectorAll('.crosswalk button, .crosswalk__line, .crosswalk__status')].map((el) => {
      const s = getComputedStyle(el);
      return { transition: s.transitionDuration.split(',').every((d) => parseFloat(d) === 0), animation: s.animationName === 'none' };
    }));
    expect(motion.length).toBeGreaterThan(5);
    expect(motion.every(({ transition, animation }) => transition && animation)).toBe(true);
    await page.close();
  });

  it('keeps a solid outline on selected lines in forced-colours mode', async () => {
    const page = await home();
    await page.emulateMedia({ forcedColors: 'active' });
    await select(page, 'scratch');
    const outline = await page.evaluate(() => {
      const line = [...document.querySelectorAll('.crosswalk__line')].find((l) => getComputedStyle(l).outlineStyle !== 'none')!;
      const s = getComputedStyle(line);
      return { style: s.outlineStyle, width: s.outlineWidth };
    });
    expect(outline).toEqual({ style: 'solid', width: '2px' });
    await page.close();
  });

  it('hides the status line and Show all in print, and still shows the legend and the outlined lines', async () => {
    const page = await home();
    await select(page, 'gate');
    await page.emulateMedia({ media: 'print' });
    const printed = await page.evaluate(() => ({
      status: getComputedStyle(document.querySelector('.crosswalk__status')!).display,
      clear: getComputedStyle(document.querySelector('.crosswalk__clear')!).display,
      legend: [...document.querySelectorAll('.crosswalk__term dt')].every((dt) => (dt as HTMLElement).offsetHeight > 0),
      outline: getComputedStyle([...document.querySelectorAll('.crosswalk__line')].find((l) => getComputedStyle(l).outlineStyle !== 'none')!).outlineStyle,
    }));
    expect(printed).toEqual({ status: 'none', clear: 'none', legend: true, outline: 'solid' });
    await page.close();
  });

  it('does not overflow the page at 320 px with a term selected', async () => {
    const page = await home({ width: 320 });
    await select(page, 'net');
    const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, view: document.documentElement.clientWidth }));
    expect(widths.page).toBeLessThanOrEqual(widths.view);
    await page.close();
  });
});
