import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const css = readFileSync(`${root}/site/src/styles/global.css`, 'utf8');

describe('frontend foundation styles', () => {
  it('defines shared measures, focus, and bounded technical content', () => {
    expect(css).toMatch(/--measure-prose:\s*68ch/);
    expect(css).toMatch(/--measure-(?:wide|data):/);
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline/s);
    expect(css).toMatch(/pre\s*\{[^}]*overflow-x:\s*auto/s);
    expect(css).toMatch(/(?:\.hash|\.checksum|\.integrity)[\s\S]*overflow-wrap:\s*anywhere/);
  });

  it('preserves native table display and bounds overflow in the wrapper instead', () => {
    expect(css).not.toMatch(/table\s*\{[^}]*display\s*:\s*block/s);
    expect(css).toMatch(/\.table-overflow\s*\{[^}]*overflow-x:\s*auto/s);
    expect(css).toMatch(/table\s*\{[^}]*border-collapse:\s*collapse/s);
  });
});


describe('finalized presentation CSS regression gates', () => {
  it('does not use card--raised, raised-surface, or box-shadow on card elements for resource/diagnostic/learning-path/project contexts', () => {
    expect(css).not.toMatch(/\.card--raised/);
    expect(css).not.toMatch(/\.raised-surface/);
    expect(css).not.toMatch(/\.card\s*\{[^}]*box-shadow/s);
    expect(css).not.toMatch(/\.resource-card\s*\{[^}]*box-shadow/s);
  });

  it('does not apply cursor:pointer on non-link/non-button elements in resource/diagnostic/learning-path/project contexts', () => {
    // cursor:pointer is only allowed on summary, a, button elements
    const cursorPointerRules = css.match(/[^{}]+\{[^}]*cursor:\s*pointer[^}]*/g) ?? [];
    for (const rule of cursorPointerRules) {
      const selector = rule.split('{')[0].trim();
      expect(selector, `cursor:pointer on non-interactive: ${selector}`).toMatch(/summary|button|a|\[role="button"\]/i);
    }
  });

  it('defines 320px reflow and bounded overflow rules for technical content', () => {
    expect(css).toMatch(/max-width:\s*30rem|max-inline-size:\s*30rem/);
    expect(css).toMatch(/pre\s*\{[^}]*overflow-x:\s*auto/s);
    expect(css).toMatch(/\.table-overflow\s*\{[^}]*overflow-x:\s*auto/s);
    expect(css).toMatch(/overflow-wrap:\s*(?:anywhere|break-word)/);
  });
});


describe('Midnight Field Notes semantic foundation', () => {
  it('defines complete semantic light/dark/shell roles and system-only serif, sans, and mono typography', () => {
    const light = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const dark = css.match(/@media \(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? '';
    for (const token of ['canvas', 'surface', 'raised', 'text', 'muted', 'primary', 'accent', 'shell', 'shell-text', 'border', 'warning']) {
      expect(light, `light --${token}`).toMatch(new RegExp(`--${token}:`));
      expect(dark, `dark --${token}`).toMatch(new RegExp(`--${token}:`));
    }
    expect(css).toMatch(/color-scheme:\s*light dark/);
    expect(css).toMatch(/--font-display:\s*ui-serif,[^;]*serif;/);
    expect(css).toMatch(/--font-body:\s*system-ui,[^;]*sans-serif;/);
    expect(css).toMatch(/--font-technical:\s*ui-monospace,[^;]*monospace;/);
    expect(css).toMatch(/\.site-header, \.site-footer\s*\{[^}]*background:\s*var\(--shell\)/s);
    expect(css).toMatch(/pre, \.terminal, \.technical-figure\s*\{[^}]*background:\s*var\(--shell\)/s);
    expect(css).not.toMatch(/@font-face|@import\s+url|fonts\.(?:googleapis|gstatic)|use\.typekit|linear-gradient|radial-gradient|backdrop-filter/);
  });

  it('keeps minimum text sizes and forced-color, print, and reduced-motion safeguards', () => {
    expect(css).toMatch(/--text-base:\s*1rem/);
    expect(css).toMatch(/--text-supporting:\s*0\.875rem/);
    expect(css).toMatch(/--leading-base:\s*1\.5[0-9]*/);
    expect(css).toMatch(/:root\s*\{[\s\S]*font-size:\s*var\(--text-base\);[\s\S]*line-height:\s*var\(--leading-base\)/);
    expect(css).toMatch(/button, input, select, textarea, summary\s*\{[^}]*font-size:\s*var\(--text-base\)[^}]*line-height:\s*1\.5/s);
    expect(css).toMatch(/small, \.supporting, \.technical-label\s*\{[^}]*font-size:\s*var\(--text-supporting\)/s);
    expect(css).toMatch(/h1, h2, h3\s*\{[^}]*line-height:\s*1\.15/s);
    expect(css).toMatch(/pre, \.terminal, \.technical-figure\s*\{[^}]*background:\s*var\(--shell\)/s);
    expect(css).toMatch(/@media \(forced-colors:\s*active\)[\s\S]*--canvas:\s*Canvas/);
    expect(css).toMatch(/@media print[\s\S]*--shell:\s*#fff/);
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/);
    expect(css).not.toMatch(/@keyframes|animation-name\s*:|animation\s*:|transition\s*:/);
  });
});
