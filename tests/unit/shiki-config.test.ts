import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateCanonicalConfig } from '../../scripts/publication.mjs';
import config, { CODE_CONTRAST, codeContrast } from '../../site/astro.config.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const text = readFileSync(`${root}/site/astro.config.mjs`, 'utf8');
const tokens = readFileSync(`${root}/site/src/styles/tokens.css`, 'utf8');
const [lightSurface, darkSurface] = [...tokens.matchAll(/--surface:\s*(#[0-9a-fA-F]{6});/g)].map((match) => match[1]);

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('Shiki configuration', () => {
  it('uses github-light and github-dark as CSS variables, with no default colour', () => {
    const shiki = (config as any).markdown.shikiConfig;
    expect(shiki.themes).toEqual({ light: 'github-light', dark: 'github-dark' });
    expect(shiki.defaultColor).toBe(false);
    expect(shiki.theme).toBeUndefined();
    expect(shiki.wrap).toBe(false);
  });

  it('highlights bash, python, sh and yaml', () => {
    expect((config as any).markdown.shikiConfig.langs).toEqual(['bash', 'python', 'sh', 'yaml']);
  });

  it('still passes the canonical-config rules and keeps the integration list closed', () => {
    expect(validateCanonicalConfig(text)).toEqual([]);
    expect(text.match(/integrations:\s*\[([^\]]+)\]/)?.[1].replace(/\s/g, '')).toBe('sitemap(),canonicalPolicy(),accessibleTables()');
    expect(text).not.toMatch(/ViewTransitions|adapter|server\s*:|session|auth/i);
  });

  it('has the two surfaces it is checked against', () => {
    expect(lightSurface).toBe('#f3efe5');
    expect(darkSurface).toBe('#192234');
  });

  it.each([['light', lightSurface], ['dark', darkSurface]] as const)('swaps only colours that fail 4.5:1 on the %s surface, for ones that pass', (theme, surface) => {
    for (const [from, to] of Object.entries(CODE_CONTRAST[theme])) {
      expect(contrast(from, surface), `${theme} ${from}`).toBeLessThan(4.5);
      expect(contrast(to, surface), `${theme} ${to}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('rewrites the variables on a token span, in either letter case, and leaves everything else alone', () => {
    const node = { properties: { style: '--shiki-light:#6a737d;--shiki-dark:#6A737D' } };
    codeContrast.span(node);
    expect(node.properties.style).toBe('--shiki-light:#57606A;--shiki-dark:#8B949E');
    const kept = { properties: { style: '--shiki-light:#005CC5;--shiki-dark:#79B8FF' } };
    codeContrast.span(kept);
    expect(kept.properties.style).toBe('--shiki-light:#005CC5;--shiki-dark:#79B8FF');
    expect(() => codeContrast.span({ properties: {} })).not.toThrow();
    expect(() => codeContrast.span({})).not.toThrow();
  });
});
