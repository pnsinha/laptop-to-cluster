import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = resolve(root, 'site/dist');
const tokens = readFileSync(resolve(root, 'site/src/styles/tokens.css'), 'utf8');
const [lightSurface, darkSurface] = [...tokens.matchAll(/--surface:\s*(#[0-9a-fA-F]{6});/g)].map((match) => match[1]);

const htmlFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(path) : entry.name.endsWith('.html') ? [path] : [];
  });
const pages = htmlFiles(dist).map((file) => readFileSync(file, 'utf8'));
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const colours = { light: new Set<string>(), dark: new Set<string>() };
for (const html of pages) for (const match of html.matchAll(/--shiki-(light|dark):(#[0-9a-fA-F]{6})/g)) colours[match[1] as 'light' | 'dark'].add(match[2].toUpperCase());

describe('built code blocks', () => {
  it('are dual-theme, with colours as variables and no single-theme leftovers', () => {
    const withCode = pages.filter((html) => html.includes('astro-code'));
    expect(withCode.length).toBeGreaterThan(0);
    for (const html of withCode) {
      expect(html).toContain('astro-code astro-code-themes github-light github-dark');
      expect(html).not.toMatch(/class="astro-code github-dark"/);
      expect(html).not.toMatch(/<span style="color:#/);
    }
  });

  it.each([['light', lightSurface], ['dark', darkSurface]] as const)('keep every %s token colour at 4.5:1 or better on the code surface', (theme, surface) => {
    expect(colours[theme].size).toBeGreaterThan(0);
    const failing = [...colours[theme]].filter((colour) => contrast(colour, surface) < 4.5).map((colour) => `${colour} ${contrast(colour, surface).toFixed(2)}`);
    expect(failing).toEqual([]);
  });
});
