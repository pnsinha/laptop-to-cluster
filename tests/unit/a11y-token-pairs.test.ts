import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ALIAS_LITERALS, auditTokenMap, auditTokens, buildPairs, contrastRatio, declaredColorSchemes, pairTokenNames, parseThemeBlocks,
} from '../accessibility/token-pairs';

const LIGHT: Record<string, string> = {
  canvas: '#fbf9f4', surface: '#f3efe5', raised: '#fffefb', text: '#23211c', muted: '#5a554b', primary: '#1d2a44', accent: '#45506a',
  'primary-hover': '#2d3e63', 'on-primary': '#fbf9f4', border: '#857e70', rule: '#c9bfaa', focus: '#1d2a44',
  warning: '#735600', 'warning-surface': '#fbf3d0', danger: '#a3211a', 'danger-surface': '#fbe9e7', success: '#0f6a5f', 'success-surface': '#e2f3ef',
  'c-step': '#0b5cad', 'c-step-bg': '#e3f0fc', 'c-gate': '#9a4a00', 'c-gate-bg': '#fdf0dc',
  'c-scratch': '#5b21b6', 'c-scratch-bg': '#efe8fd', 'c-net': '#166534', 'c-net-bg': '#e3f4e8',
};
const DARK: Record<string, string> = {
  canvas: '#131a29', surface: '#192234', raised: '#1f293d', text: '#ebe5d9', muted: '#b3ab9c', primary: '#f4eee2', accent: '#b8c1d6',
  'primary-hover': '#ddd4c1', 'on-primary': '#131a29', border: '#737c90', rule: '#3a4560', focus: '#f4eee2',
  warning: '#e8c35f', 'warning-surface': '#2b2511', danger: '#ff9a8f', 'danger-surface': '#3a1a1e', success: '#6fd6c4', 'success-surface': '#10302c',
  'c-step': '#79b8ff', 'c-step-bg': '#0f2a44', 'c-gate': '#f0a35e', 'c-gate-bg': '#3a2410',
  'c-scratch': '#c4a5ff', 'c-scratch-bg': '#2a1d47', 'c-net': '#6fdd8b', 'c-net-bg': '#12321d',
};
const PRINT: Record<string, string> = {
  canvas: '#ffffff', surface: '#ffffff', raised: '#ffffff', text: '#000000', muted: '#333333', primary: '#000000', accent: '#333333',
  'primary-hover': '#000000', 'on-primary': '#ffffff', border: '#555555', rule: '#999999', focus: '#000000',
  warning: '#5c4400', 'warning-surface': '#ffffff', danger: '#8a1c15', 'danger-surface': '#ffffff', success: '#0b5249', 'success-surface': '#ffffff',
  'c-step': '#0b5cad', 'c-step-bg': '#ffffff', 'c-gate': '#9a4a00', 'c-gate-bg': '#ffffff',
  'c-scratch': '#5b21b6', 'c-scratch-bg': '#ffffff', 'c-net': '#166534', 'c-net-bg': '#ffffff',
};
const aliases = (t: Record<string, string>) => ({ 'text-base': '1rem', 'text-supporting': '0.875rem', 'leading-base': '1.45', shell: t.canvas, 'shell-text': t.text });
const decl = (t: Record<string, string>, withAliases = true) =>
  Object.entries({ ...t, ...(withAliases ? aliases(t) : {}) }).map(([key, value]) => `--${key}: ${value};`).join(' ');
function sheet(options: { light?: Record<string, string>; darkAttr?: Record<string, string>; aliases?: boolean } = {}) {
  const withAliases = options.aliases !== false;
  return `/* fixture */
:root { color-scheme: light dark; ${decl(options.light ?? LIGHT, withAliases)} }
:root[data-theme="light"] { color-scheme: light; }
@media screen and (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark; ${decl(DARK, withAliases)} } }
@media screen { :root[data-theme="dark"] { color-scheme: dark; ${decl(options.darkAttr ?? DARK, withAliases)} } }
@media print { :root:not([data-theme]), :root[data-theme] { color-scheme: light; ${decl(PRINT, withAliases)} } }
@media (forced-colors: active) { :root:not([data-theme]), :root[data-theme] { --canvas: Canvas; --text: CanvasText; } }`;
}

describe('stylesheet theme-block parsing', () => {
  it('splits a stylesheet into light, dark, OS-dark, print and forced-colour blocks', () => {
    const blocks = parseThemeBlocks(sheet());
    expect(blocks.light.canvas).toBe('#fbf9f4');
    expect(blocks.dark.canvas).toBe('#131a29');
    expect(blocks.darkMedia.canvas).toBe('#131a29');
    expect(blocks.print.canvas).toBe('#ffffff');
    expect(blocks.forced.canvas).toBe('canvas');
  });

  it('reads minified output whose attribute selectors have no quotes', () => {
    const minified = ':root{color-scheme:light dark;--canvas:#fbf9f4}:root[data-theme=light]{color-scheme:light}@media screen and (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--canvas:#131a29}}@media screen{:root[data-theme=dark]{color-scheme:dark;--canvas:#131a29}}';
    const blocks = parseThemeBlocks(minified);
    expect(blocks.light.canvas).toBe('#fbf9f4');
    expect(blocks.darkMedia.canvas).toBe('#131a29');
    expect(blocks.dark.canvas).toBe('#131a29');
    expect(declaredColorSchemes(minified)).toEqual({ base: 'light dark', light: 'light', dark: 'dark', darkMedia: 'dark' });
  });

  it('reports the declared colour scheme of each block so the base can be checked without a computed style', () => {
    expect(declaredColorSchemes(sheet())).toEqual({ base: 'light dark', light: 'light', dark: 'dark', darkMedia: 'dark' });
  });
});

describe('contrast arithmetic', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThan(4.5);
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5);
    expect(contrastRatio('rgb(0, 0, 0)', 'rgb(255, 255, 255)')).toBeCloseTo(21, 5);
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
  });
});

describe('pair list', () => {
  it('covers surfaces, status, every concept, and the cross-tint shapes', () => {
    const pairs = buildPairs(LIGHT);
    const has = (fg: string, bg: string) => pairs.some((pair) => pair.fg === fg && pair.bg === bg);
    for (const surface of ['canvas', 'surface', 'raised']) for (const fg of ['text', 'muted', 'primary', 'accent', 'border', 'focus']) expect(has(fg, surface), `${fg}/${surface}`).toBe(true);
    for (const concept of ['step', 'gate', 'scratch', 'net']) {
      expect(has(`c-${concept}`, `c-${concept}-bg`)).toBe(true);
      expect(has('text', `c-${concept}-bg`)).toBe(true);
      expect(has(`c-${concept}`, 'canvas')).toBe(true);
    }
    expect(has('c-scratch', 'c-step-bg')).toBe(true);
    expect(has('c-step', 'c-net-bg')).toBe(true);
    for (const status of ['warning', 'danger', 'success']) expect(has(status, `${status}-surface`)).toBe(true);
  });

  it('tags hover, focus-visible and selected states, and adds visited only when a theme declares it', () => {
    const states = new Set(buildPairs(LIGHT).map(({ state }) => state));
    expect(states).toEqual(new Set(['rest', 'hover', 'focus-visible', 'selected']));
    expect(new Set(buildPairs({ ...LIGHT, 'link-visited': '#4a2a7a' }).map(({ state }) => state)).has('visited')).toBe(true);
    expect(pairTokenNames(LIGHT)).toEqual(expect.arrayContaining(['canvas', 'c-gate-bg', 'on-primary', 'primary-hover']));
  });
});

describe('stylesheet audit', () => {
  it('accepts the shipped palette with aliases in every theme block', () => {
    expect(auditTokens(sheet())).toEqual([]);
    expect(auditTokenMap(LIGHT, 'light')).toEqual([]);
    expect(auditTokenMap(DARK, 'dark')).toEqual([]);
  });

  it('reads the shortened hex colours a minifier writes', () => {
    const minified = sheet().replace(/#ffffff/g, '#fff').replace(/#000000/g, '#000').replace(/#333333/g, '#333').replace(/#555555/g, '#555');
    expect(auditTokens(minified)).toEqual([]);
  });

  it('reports a pair that falls below its threshold, naming the state and use', () => {
    const issues = auditTokens(sheet({ light: { ...LIGHT, muted: '#aaa59a' } }));
    expect(issues.join('\n')).toMatch(/light: --muted on --canvas is [\d.]+:1, below 4\.5:1 \(rest;/);
  });

  it('reports a hover or focus regression separately from rest', () => {
    const issues = auditTokens(sheet({ light: { ...LIGHT, 'primary-hover': '#c9bfaa' } }));
    expect(issues.join('\n')).toMatch(/\(hover; primary button label on hover\)/);
    const focus = auditTokens(sheet({ light: { ...LIGHT, focus: '#e0d8c4' } }));
    expect(focus.join('\n')).toMatch(/\(focus-visible; focus ring\)/);
  });

  it('reports dark values that differ between the data-theme block and the OS-preference block', () => {
    const issues = auditTokens(sheet({ darkAttr: { ...DARK, text: '#ffffff' } }));
    expect(issues.join('\n')).toContain('--text differs between the data-theme block and the OS-preference block');
  });

  it('reports missing or wrong compatibility aliases per block', () => {
    const missing = auditTokens(sheet({ aliases: false }));
    for (const block of ['light', 'dark', 'darkMedia', 'print']) {
      expect(missing.join('\n')).toContain(`${block}: --shell must equal --canvas`);
      for (const [alias, literal] of Object.entries(ALIAS_LITERALS)) expect(missing.join('\n')).toContain(`${block}: --${alias} must be the literal ${literal}`);
    }
  });

  it('keeps decorative borders subordinate to text (the scanner restraint band)', () => {
    const issues = auditTokenMap({ ...LIGHT, border: LIGHT.text }, 'light');
    expect(issues.join('\n')).toContain('outside the 1.5:1 to 4.5:1 restraint band');
  });

  it('flags a missing theme block instead of passing silently', () => {
    expect(auditTokens(':root { --canvas: #ffffff; }').join('\n')).toContain('dark: theme block is missing');
  });
});

describe('shipped tokens', () => {
  const file = fileURLToPath(new URL('../../site/src/styles/tokens.css', import.meta.url));
  it.skipIf(!existsSync(file))('passes the full audit, with a declared light-and-dark base', () => {
    const css = readFileSync(file, 'utf8');
    expect(auditTokens(css)).toEqual([]);
    expect(declaredColorSchemes(css).base).toBe('light dark');
  });
});
