import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CONCEPTS, type ConceptKey } from '../../site/src/content/contracts';
import { serveDist } from './support/serve-dist';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = resolve(root, 'site/dist');
const labelOf = (key: ConceptKey) => CONCEPTS.find((concept) => concept.key === key)!.label;
let server: Awaited<ReturnType<typeof serveDist>>;
let browser: Browser;

beforeAll(async () => {
  if (!existsSync(resolve(dist, 'index.html'))) throw new Error('site/dist is missing; run npm run build first');
  server = await serveDist(dist);
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => { await browser?.close(); await server?.close(); });

const errors = new WeakMap<Page, string[]>();
async function home(): Promise<Page> {
  const page = await browser.newPage();
  page.setDefaultTimeout(3_000);
  const seen: string[] = [];
  errors.set(page, seen);
  page.on('pageerror', (error) => seen.push(String(error)));
  await page.goto(`${server.origin}/`);
  return page;
}
const termButton = (page: Page, key: ConceptKey) => page.locator(`.crosswalk__term[data-concept="${key}"] button`);
/* Lean variant (R13): the script sets data-selected on the section and CSS lights the
   matching lines, so "lit" is read from the computed outline, not from a class. */
const snapshot = (page: Page) => page.evaluate(() => {
  const section = document.querySelector<HTMLElement>('.crosswalk')!;
  return {
    pressed: [...section.querySelectorAll('dt button')].map((button) => button.getAttribute('aria-pressed')),
    selected: section.dataset.selected ?? null,
    lit: [...section.querySelectorAll<HTMLElement>('.crosswalk__line')]
      .filter((line) => getComputedStyle(line).outlineStyle !== 'none')
      .map((line) => ({
        concepts: line.dataset.concepts ?? '',
        pane: line.closest('.crosswalk__pane')!.getAttribute('data-pane'),
      })),
    status: section.querySelector('[role="status"]')!.textContent,
    showAllHidden: section.querySelector<HTMLElement>('.crosswalk__clear')!.hidden,
    focused: document.activeElement?.textContent?.trim() ?? '',
  };
});
const panesOf = (page: Page, key: ConceptKey) => page.locator(`.crosswalk__line[data-concepts~="${key}"]`).evaluateAll(
  (lines) => [...new Set(lines.map((line) => line.closest('.crosswalk__pane')!.getAttribute('data-pane')))],
);

describe('crosswalk highlight: behaviour in a real browser', () => {
  it('turns each legend term into a named toggle button and injects the hint', async () => {
    const page = await home();
    expect(await page.locator('.crosswalk dt button').count()).toBe(4);
    for (const { key, label } of CONCEPTS) {
      const byName = page.getByRole('button', { name: label, exact: true });
      expect(await byName.count(), label).toBe(1);
      expect(await byName.getAttribute('aria-pressed'), label).toBe('false');
      expect(await page.locator(`.crosswalk__term[data-concept="${key}"] dd`).count(), label).toBe(1);
    }
    expect(await page.locator('.crosswalk dt button .crosswalk__mark[aria-hidden="true"]').count()).toBe(4);
    const state = await snapshot(page);
    expect(state.status).toMatch(/^Select a term/);
    expect(state.showAllHidden).toBe(true);
    expect(errors.get(page)).toEqual([]);
    await page.close();
  });

  it('selects with Enter, marks the term and announces it; matching lines stay in both panes', async () => {
    const page = await home();
    await termButton(page, 'gate').focus();
    await page.keyboard.press('Enter');
    const state = await snapshot(page);
    const expected = await page.locator('.crosswalk__line[data-concepts~="gate"]').count();
    expect(expected).toBeGreaterThan(1);
    expect(state.pressed).toEqual(CONCEPTS.map(({ key }) => (key === 'gate' ? 'true' : 'false')));
    expect(state.selected).toBe('gate');
    expect(state.status).toBe(`Showing: ${labelOf('gate')}`);
    expect(state.showAllHidden).toBe(false);
    expect(await panesOf(page, 'gate')).toEqual(expect.arrayContaining(['compose', 'sbatch']));
    expect(errors.get(page)).toEqual([]);
    await page.close();
  });

  it('switches terms with Space and keeps only one term pressed', async () => {
    const page = await home();
    await termButton(page, 'step').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    expect((await snapshot(page)).focused).toContain(labelOf('gate'));
    await page.keyboard.press('Space');
    const state = await snapshot(page);
    expect(state.pressed).toEqual(CONCEPTS.map(({ key }) => (key === 'gate' ? 'true' : 'false')));
    expect(state.status).toBe(`Showing: ${labelOf('gate')}`);
    expect(state.selected).toBe('gate');
    expect(await panesOf(page, 'gate')).toEqual(expect.arrayContaining(['compose', 'sbatch']));
    await page.close();
  });

  it('clears when the active term is pressed again, and focus stays on that term', async () => {
    const page = await home();
    await termButton(page, 'net').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    const state = await snapshot(page);
    expect(state.pressed).toEqual(['false', 'false', 'false', 'false']);
    expect(state.selected).toBe('');
    expect(state.lit).toEqual([]);
    expect(state.status).toBe('Showing: all lines');
    expect(state.showAllHidden).toBe(true);
    expect(state.focused).toContain(labelOf('net'));
    await page.close();
  });

  it('clears with Show all and returns focus to the term that was selected', async () => {
    const page = await home();
    await termButton(page, 'scratch').focus();
    await page.keyboard.press('Space');
    await page.locator('.crosswalk__clear').focus();
    await page.keyboard.press('Enter');
    const state = await snapshot(page);
    expect(state.pressed).toEqual(['false', 'false', 'false', 'false']);
    expect(state.lit).toEqual([]);
    expect(state.showAllHidden).toBe(true);
    expect(state.focused).toContain(labelOf('scratch'));
    expect(state.status).toBe('Showing: all lines');
    await page.close();
  });

  it('keeps a natural tab order: the four terms, then Show all when it is visible', async () => {
    const page = await home();
    const order = await page.evaluate(() => [...document.querySelectorAll('.crosswalk button')].map((button) => ({
      label: button.textContent!.replace(/^\S\s/, '').trim(), tabindex: button.getAttribute('tabindex'),
    })));
    expect(order.map(({ label }) => label)).toEqual([...CONCEPTS.map(({ label }) => label), 'Show all']);
    expect(order.every(({ tabindex }) => tabindex === null)).toBe(true);
    await termButton(page, 'step').focus();
    await page.keyboard.press('Enter');
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('Tab');
    expect((await snapshot(page)).focused).toBe('Show all');
    await page.close();
  });

  it('leaves the code selectable', async () => {
    const page = await home();
    await termButton(page, 'gate').focus();
    await page.keyboard.press('Enter');
    const selectable = await page.evaluate(() => [...document.querySelectorAll('.crosswalk pre code')].every((code) => getComputedStyle(code).userSelect !== 'none'));
    expect(selectable).toBe(true);
    await page.locator('.crosswalk__line[data-concepts~="gate"]').first().selectText();
    expect(await page.evaluate(() => window.getSelection()!.toString().length)).toBeGreaterThan(0);
    await page.close();
  });

  it('does nothing without JavaScript: terms and lines stay, no controls appear', async () => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    page.setDefaultTimeout(3_000);
    await page.goto(`${server.origin}/`);
    expect(await page.locator('.crosswalk__term').count()).toBe(4);
    expect(await page.locator('.crosswalk button').count()).toBe(0);
    expect(await page.locator('.crosswalk [role="status"]').count()).toBe(0);
    expect(await page.locator('.crosswalk__line--selected').count()).toBe(0);
    expect(await page.locator('.crosswalk').innerText()).not.toMatch(/select a term/i);
    for (const { key } of CONCEPTS) {
      const panes = await page.locator(`.crosswalk__line[data-concepts~="${key}"]`).evaluateAll(
        (lines) => [...new Set(lines.map((line) => line.closest('.crosswalk__pane')!.getAttribute('data-pane')))],
      );
      expect(panes, key).toEqual(expect.arrayContaining(['compose', 'sbatch']));
    }
    await context.close();
  });
});
