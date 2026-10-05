import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY } from '../../site/src/content/contracts';
import { effectiveTheme, storedChoice, themeAttribute } from '../../site/src/content/theme';

const root = fileURLToPath(new URL('../..', import.meta.url));
const source = (path: string) => readFileSync(`${root}/${path}`, 'utf8');
const inlineScripts = (text: string) => [...text.matchAll(/<script is:inline>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
const layoutScripts = inlineScripts(source('site/src/layouts/BaseLayout.astro'));
const bootScript = layoutScripts.find((text) => text.includes('getItem'))!;
const printScript = layoutScripts.find((text) => text.includes('beforeprint'))!;
const controlScript = inlineScripts(source('site/src/components/ThemeControl.astro'))[0];
const bytes = (text: string) => Buffer.byteLength(text);
const LIGHT = '#fbf9f4';
const DARK = '#131a29';
const STORED = [null, 'light', 'dark', 'system', '', 'junk'] as const;

function makeDom(stored: string | null, throwing = false) {
  const store = new Map<string, string>();
  if (stored !== null) store.set(THEME_STORAGE_KEY, stored);
  const metas = ['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)'].map((media) => ({ content: '', getAttribute: (name: string) => (name === 'media' ? media : null) }));
  const buttons = ['system', 'light', 'dark'].map((choice) => ({ dataset: { themeChoice: choice } as Record<string, string>, attrs: {} as Record<string, string>, setAttribute(name: string, value: string) { this.attrs[name] = value; } }));
  const listeners: Record<string, (event: unknown) => void> = {};
  const html = { dataset: {} as Record<string, string>, removeAttribute(name: string) { if (name === 'data-theme') delete this.dataset.theme; } };
  const box = { hidden: true, querySelectorAll: () => buttons, addEventListener: (type: string, handler: (event: unknown) => void) => { listeners[type] = handler; } };
  const document = { documentElement: html, querySelectorAll: (selector: string) => (selector.startsWith('meta') ? metas : []), querySelector: (selector: string) => (selector === '[data-theme-control]' ? box : null) };
  const localStorage = {
    getItem: (key: string) => { if (throwing) throw new Error('blocked'); return store.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (throwing) throw new Error('blocked'); store.set(key, value); },
    removeItem: (key: string) => { if (throwing) throw new Error('blocked'); store.delete(key); },
  };
  const click = (choice: string) => listeners.click({ target: { closest: () => buttons.find((button) => button.dataset.themeChoice === choice) } });
  return { sandbox: { document, localStorage }, store, metas, buttons, html, box, click };
}
const pressed = (dom: ReturnType<typeof makeDom>) => dom.buttons.filter((button) => button.attrs['aria-pressed'] === 'true').map((button) => button.dataset.themeChoice);

describe('theme boot script', () => {
  it('stays within 300 bytes', () => {
    expect(bytes(bootScript)).toBeLessThanOrEqual(300);
  });

  it.each(STORED)('applies the same attribute as theme.ts for stored value %j', (value) => {
    const dom = makeDom(value);
    runInNewContext(bootScript, dom.sandbox);
    expect(dom.html.dataset.theme ?? null).toBe(themeAttribute(value));
    const expected = themeAttribute(value) === null ? '' : effectiveTheme(value, false) === 'dark' ? DARK : LIGHT;
    expect(dom.metas.map((meta) => meta.content)).toEqual([expected, expected]);
  });

  it('does nothing and does not throw when storage is blocked', () => {
    const dom = makeDom('dark', true);
    expect(() => runInNewContext(bootScript, dom.sandbox)).not.toThrow();
    expect(dom.html.dataset.theme).toBeUndefined();
  });
});

describe('theme control script', () => {
  it.each(STORED)('paints the stored choice %j, unhides the control and keeps System on the OS colours', (value) => {
    const dom = makeDom(value);
    runInNewContext(controlScript, dom.sandbox);
    expect(dom.box.hidden).toBe(false);
    expect(pressed(dom)).toEqual([storedChoice(value)]);
    expect(dom.html.dataset.theme ?? null).toBe(themeAttribute(value));
    const colours = dom.metas.map((meta) => meta.content);
    expect(colours).toEqual(themeAttribute(value) === null ? [LIGHT, DARK] : effectiveTheme(value, false) === 'dark' ? [DARK, DARK] : [LIGHT, LIGHT]);
  });

  it('stores Light and Dark, clears the key for System, and updates data-theme, theme-color and aria-pressed each time', () => {
    const dom = makeDom(null);
    runInNewContext(controlScript, dom.sandbox);
    dom.click('dark');
    expect(dom.store.get(THEME_STORAGE_KEY)).toBe('dark');
    expect([dom.html.dataset.theme, pressed(dom).join()]).toEqual(['dark', 'dark']);
    expect(dom.metas.map((meta) => meta.content)).toEqual([DARK, DARK]);
    dom.click('light');
    expect(dom.store.get(THEME_STORAGE_KEY)).toBe('light');
    expect(dom.metas.map((meta) => meta.content)).toEqual([LIGHT, LIGHT]);
    dom.click('system');
    expect(dom.store.has(THEME_STORAGE_KEY)).toBe(false);
    expect(dom.html.dataset.theme).toBeUndefined();
    expect(pressed(dom)).toEqual(['system']);
    expect(dom.metas.map((meta) => meta.content)).toEqual([LIGHT, DARK]);
  });

  it('still switches the page when storage is blocked', () => {
    const dom = makeDom(null, true);
    runInNewContext(controlScript, dom.sandbox);
    dom.click('dark');
    expect(dom.html.dataset.theme).toBe('dark');
  });

  it('is built from addEventListener, with no inline handler attributes anywhere in the shell', () => {
    expect(controlScript).toContain('addEventListener');
    for (const path of ['site/src/layouts/BaseLayout.astro', 'site/src/components/ThemeControl.astro']) expect(source(path)).not.toMatch(/\bon[a-z]+\s*=/i);
  });
});

describe('print script', () => {
  it('stays within 200 bytes', () => {
    expect(bytes(printScript)).toBeLessThanOrEqual(200);
  });

  it('opens the closed disclosures in main before printing and closes only those afterwards', () => {
    const closed = [{ open: false }, { open: false }];
    const handlers: Record<string, () => void> = {};
    runInNewContext(printScript, { document: { querySelectorAll: () => closed }, addEventListener: (type: string, handler: () => void) => { handlers[type] = handler; } });
    handlers.beforeprint();
    expect(closed.map((item) => item.open)).toEqual([true, true]);
    handlers.afterprint();
    expect(closed.map((item) => item.open)).toEqual([false, false]);
  });
});

describe('client JS budget', () => {
  it('control script stays within 700 bytes (R13/A9)', () => {
    expect(bytes(controlScript)).toBeLessThanOrEqual(700);
  });

  it('leaves at least 840 bytes of the 2 KB page budget for the W9 crosswalk (R13)', () => {
    expect(bytes(bootScript) + bytes(printScript) + bytes(controlScript)).toBeLessThanOrEqual(2048 - 840);
  });
});
