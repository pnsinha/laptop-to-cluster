import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const css = readFileSync(`${root}/site/src/styles/tokens.css`, 'utf8');
type Tokens = Record<string, string>;

/* A theme block starts at --canvas and runs to its closing brace; blocks hold no nested braces. */
const blocks: Tokens[] = [...css.matchAll(/--canvas:\s*([^;]+);[\s\S]*?\n\s*\}/g)].map((match) =>
  Object.fromEntries([...match[0].matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()])));
const [light, darkByOs, darkByAttribute, print, forced] = blocks;

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const PAIRS: Array<[string, string, number]> = [
  ['text', 'canvas', 4.5], ['text', 'surface', 4.5], ['text', 'raised', 4.5],
  ['muted', 'canvas', 4.5], ['muted', 'surface', 4.5], ['muted', 'raised', 4.5],
  ['primary', 'canvas', 4.5], ['primary', 'surface', 4.5], ['accent', 'canvas', 4.5], ['accent', 'surface', 4.5],
  ['on-primary', 'primary', 4.5], ['on-primary', 'primary-hover', 4.5],
  ['warning', 'warning-surface', 4.5], ['danger', 'danger-surface', 4.5], ['success', 'success-surface', 4.5],
  ['c-step', 'c-step-bg', 4.5], ['c-gate', 'c-gate-bg', 4.5], ['c-scratch', 'c-scratch-bg', 4.5], ['c-net', 'c-net-bg', 4.5],
  ['c-step', 'canvas', 4.5], ['c-gate', 'canvas', 4.5], ['c-scratch', 'canvas', 4.5], ['c-net', 'canvas', 4.5],
  ['c-step', 'surface', 4.5], ['c-gate', 'surface', 4.5], ['c-scratch', 'surface', 4.5], ['c-net', 'surface', 4.5],
  ['border', 'canvas', 3], ['border', 'raised', 3], ['focus', 'canvas', 3], ['focus', 'surface', 3], ['rule', 'canvas', 1.2],
];

describe('design tokens', () => {
  it('has five theme blocks: light base, dark by OS, dark by attribute, print and forced colours', () => {
    expect(blocks).toHaveLength(5);
    expect(light['--canvas']).toBe('#fbf9f4');
    expect(darkByOs['--canvas']).toBe('#131a29');
    expect(darkByAttribute['--canvas']).toBe('#131a29');
    expect(print['--canvas']).toBe('#ffffff');
    expect(forced['--canvas']).toBe('Canvas');
  });

  it('writes the compatibility aliases as literal values in every theme block', () => {
    for (const [index, block] of blocks.entries()) {
      expect(block['--shell'], `block ${index} --shell`).toBe(block['--canvas']);
      expect(block['--shell-text'], `block ${index} --shell-text`).toBe(block['--text']);
      expect(block['--text-base'], `block ${index}`).toBe('1rem');
      expect(block['--text-supporting'], `block ${index}`).toBe('0.875rem');
      expect(block['--leading-base'], `block ${index}`).toBe('1.45');
      expect(block['--shell'], `block ${index} must not use var()`).not.toMatch(/var\(/);
      expect(block['--shell-text'], `block ${index} must not use var()`).not.toMatch(/var\(/);
    }
  });

  it.each([['light', 0], ['dark by OS', 1], ['dark by attribute', 2], ['print', 3]] as const)('meets WCAG 2.2 AA token pairs in the %s palette', (_name, index) => {
    const palette = blocks[index];
    const failing = PAIRS.filter(([fg, bg, min]) => contrast(palette[`--${fg}`], palette[`--${bg}`]) < min).map(([fg, bg, min]) => `${fg}/${bg} needs ${min}`);
    expect(failing).toEqual([]);
  });

  it('keeps the two dark blocks identical so the OS and the manual choice look the same', () => {
    expect(darkByAttribute).toEqual(darkByOs);
  });

  it('advertises both schemes on the base root, narrows them in theme blocks, and never uses light-dark()', () => {
    expect(css.match(/color-scheme:\s*light dark;/g)).toHaveLength(1);
    expect(css).toMatch(/:root\[data-theme="light"\]\s*\{\s*color-scheme:\s*light;/);
    expect(css.match(/color-scheme:\s*dark;/g)).toHaveLength(2);
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/light-dark\(/);
  });

  it('keeps print and forced-colour overrides at (0,2,0) so a stored theme cannot beat them', () => {
    expect(css.match(/:root:not\(\[data-theme\]\),\s*:root\[data-theme\]\s*\{/g)).toHaveLength(2);
  });

  it('puts the self-hosted face first in every font stack, then the fallback face, then system fonts', () => {
    expect(css).toMatch(/--font-display:\s*"Source Serif 4", "Source Serif 4 Fallback", ui-serif/);
    expect(css).toMatch(/--font-reading:\s*"Source Serif 4", "Source Serif 4 Fallback", ui-serif/);
    expect(css).toMatch(/--font-body:\s*"IBM Plex Sans", "IBM Plex Sans Fallback", system-ui/);
    expect(css).toMatch(/--font-technical:\s*"IBM Plex Mono", ui-monospace/);
    expect(css).toMatch(/--font-marks:\s*"L2C Marks", "Noto Sans Symbols 2"/);
  });

  it('defines the four concept shapes and the size floors', () => {
    expect(css).toContain('--mark-step: "■";');
    expect(css).toContain('--mark-gate: "◆";');
    expect(css).toContain('--mark-scratch: "▲";');
    expect(css).toContain('--mark-net: "●";');
    expect(css).toMatch(/--text-fine:\s*0\.875rem;/);
    expect(css).toMatch(/--text-ui:\s*1rem;/);
    expect(css).toMatch(/--text-code:\s*0\.9375rem;/);
  });

  it('maps the legacy token names that existing pages still use onto the new scale', () => {
    const base = css.slice(css.indexOf(':root {'), css.indexOf(':root[data-theme="light"]'));
    for (const name of ['--text-body', '--text-lead', '--text-heading', '--text-subheading', '--text-technical', '--flow-tight', '--flow-body', '--flow-section', '--shell-accent']) {
      expect(base, name).toContain(`${name}: var(--`);
    }
  });
});
