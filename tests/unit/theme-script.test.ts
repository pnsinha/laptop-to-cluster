import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY } from '../../site/src/content/contracts';
import { effectiveTheme, themeAttribute } from '../../site/src/content/theme';

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

type Os = 'light' | 'dark';
function makeDom(stored: string | null, options: { throwing?: boolean; os?: Os } = {}) {
  const { throwing = false, os = 'light' } = options;
  const store = new Map<string, string>();
  if (stored !== null) store.set(THEME_STORAGE_KEY, stored);
  const metas = ['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)'].map((media) => ({ content: '', getAttribute: (name: string) => (name === 'media' ? media : null) }));
  const listeners: Record<string, (event: unknown) => void> = {};
  const box = { hidden: true };
  const toggle = { parentNode: box, attrs: {} as Record<string, string>, setAttribute(name: string, value: string) { this.attrs[name] = value; }, addEventListener: (type: string, handler: (event: unknown) => void) => { listeners[type] = handler; } };
  const html = { dataset: {} as Record<string, string>, removeAttribute(name: string) { if (name === 'data-theme') delete this.dataset.theme; } };
  const document = { documentElement: html, querySelectorAll: (selector: string) => (selector.startsWith('meta') ? metas : []), querySelector: (selector: string) => (selector === '[data-theme-toggle]' ? toggle : null) };
  const localStorage = {
    getItem: (key: string) => { if (throwing) throw new Error('blocked'); return store.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (throwing) throw new Error('blocked'); store.set(key, value); },
    removeItem: (key: string) => { if (throwing) throw new Error('blocked'); store.delete(key); },
  };
  const query = { media: '', matches: os === 'dark', changes: [] as Array<() => void>, addEventListener(type: string, handler: () => void) { if (type === 'change') this.changes.push(handler); } };
  const matchMedia = (media: string) => { query.media = media; return query; };
  const click = () => listeners.click({ target: toggle });
  const setOs = (next: Os) => { query.matches = next === 'dark'; for (const handler of query.changes) handler(); };
  return { sandbox: { document, localStorage, matchMedia }, store, metas, toggle, html, box, query, click, setOs };
}
const pressed = (dom: ReturnType<typeof makeDom>) => dom.toggle.attrs['aria-pressed'];
const colours = (dom: ReturnType<typeof makeDom>) => dom.metas.map((meta) => meta.content);

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
    const dom = makeDom('dark', { throwing: true });
    expect(() => runInNewContext(bootScript, dom.sandbox)).not.toThrow();
    expect(dom.html.dataset.theme).toBeUndefined();
  });
});

describe('theme control script', () => {
  const COMBINATIONS = STORED.flatMap((value) => (['light', 'dark'] as const).map((os) => [value, os] as const));

  it.each(COMBINATIONS)('paints stored value %j with the OS on %s: unhides the control, asks for the dark-scheme query, and sets aria-pressed from the effective theme', (value, os) => {
    const dom = makeDom(value, { os });
    runInNewContext(controlScript, dom.sandbox);
    expect(dom.box.hidden).toBe(false);
    expect(dom.query.media).toMatch(/^\(prefers-color-scheme:\s*dark\)$/);
    expect(dom.html.dataset.theme ?? null).toBe(themeAttribute(value));
    expect(pressed(dom)).toBe(String(effectiveTheme(value, os === 'dark') === 'dark'));
    expect(colours(dom)).toEqual(themeAttribute(value) === null ? [LIGHT, DARK] : effectiveTheme(value, false) === 'dark' ? [DARK, DARK] : [LIGHT, LIGHT]);
  });

  it('OS light, nothing stored: a click stores dark, a second click returns to following the OS', () => {
    const dom = makeDom(null, { os: 'light' });
    runInNewContext(controlScript, dom.sandbox);
    expect(pressed(dom)).toBe('false');
    dom.click();
    expect([dom.store.get(THEME_STORAGE_KEY), dom.html.dataset.theme, pressed(dom)]).toEqual(['dark', 'dark', 'true']);
    expect(colours(dom)).toEqual([DARK, DARK]);
    dom.click();
    expect(dom.store.has(THEME_STORAGE_KEY)).toBe(false);
    expect(dom.html.dataset.theme).toBeUndefined();
    expect(pressed(dom)).toBe('false');
    expect(colours(dom)).toEqual([LIGHT, DARK]);
  });

  it('OS dark, nothing stored: a click stores light, a second click returns to following the OS', () => {
    const dom = makeDom(null, { os: 'dark' });
    runInNewContext(controlScript, dom.sandbox);
    expect(pressed(dom)).toBe('true');
    dom.click();
    expect([dom.store.get(THEME_STORAGE_KEY), dom.html.dataset.theme, pressed(dom)]).toEqual(['light', 'light', 'false']);
    expect(colours(dom)).toEqual([LIGHT, LIGHT]);
    dom.click();
    expect(dom.store.has(THEME_STORAGE_KEY)).toBe(false);
    expect(dom.html.dataset.theme).toBeUndefined();
    expect(pressed(dom)).toBe('true');
    expect(colours(dom)).toEqual([LIGHT, DARK]);
  });

  it('a stored choice that already differs from the OS is switched to the OS value by one click, which clears the store', () => {
    const dom = makeDom('dark', { os: 'light' });
    runInNewContext(controlScript, dom.sandbox);
    expect(pressed(dom)).toBe('true');
    dom.click();
    expect(dom.store.has(THEME_STORAGE_KEY)).toBe(false);
    expect(dom.html.dataset.theme).toBeUndefined();
    expect(pressed(dom)).toBe('false');
  });

  it('follows an OS change while nothing is stored, and ignores it once a choice is stored', () => {
    const following = makeDom(null, { os: 'light' });
    runInNewContext(controlScript, following.sandbox);
    following.setOs('dark');
    expect(pressed(following)).toBe('true');
    expect(following.html.dataset.theme).toBeUndefined();
    following.setOs('light');
    expect(pressed(following)).toBe('false');
    // An OS change only refreshes aria-pressed: it never rewrites data-theme or the theme-color metas (the scanner sets data-theme by hand and a late change event must not undo it).
    following.html.dataset.theme = 'dark';
    following.setOs('dark');
    expect(following.html.dataset.theme).toBe('dark');
    const chosen = makeDom('light', { os: 'dark' });
    runInNewContext(controlScript, chosen.sandbox);
    expect(pressed(chosen)).toBe('false');
    chosen.setOs('light');
    chosen.setOs('dark');
    expect([pressed(chosen), chosen.html.dataset.theme, chosen.store.get(THEME_STORAGE_KEY)]).toEqual(['false', 'light', 'light']);
  });

  it.each(['light', 'dark'] as const)('still switches the page when storage is blocked (OS %s), and switches back', (os) => {
    const dom = makeDom(null, { throwing: true, os });
    runInNewContext(controlScript, dom.sandbox);
    const other = os === 'dark' ? 'light' : 'dark';
    dom.click();
    expect([dom.html.dataset.theme, pressed(dom)]).toEqual([other, String(other === 'dark')]);
    dom.click();
    expect(dom.html.dataset.theme).toBeUndefined();
    expect(pressed(dom)).toBe(String(os === 'dark'));
  });

  it('is built from addEventListener, with no inline handler attributes anywhere in the shell', () => {
    expect(controlScript).toContain('addEventListener');
    for (const path of ['site/src/layouts/BaseLayout.astro', 'site/src/components/ThemeControl.astro']) expect(source(path)).not.toMatch(/\bon[a-z]+\s*=/i);
  });

  it('keeps the l2c-theme key and no longer knows the System, Light and Dark choice buttons', () => {
    expect(controlScript).toContain(`'${THEME_STORAGE_KEY}'`);
    expect(controlScript).not.toContain('themeChoice');
    expect(controlScript).not.toContain('data-theme-choice');
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
