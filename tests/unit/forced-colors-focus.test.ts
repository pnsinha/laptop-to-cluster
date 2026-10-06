import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('../../site/src/styles/global.css', import.meta.url)), 'utf8');

describe('focus outline', () => {
  it('keeps a solid outline of at least 2px in normal mode', () => {
    expect(css).toMatch(/^:focus-visible \{ outline: var\(--focus-width\) solid var\(--focus\);/m);
  });
  it('declares a 2px solid Highlight outline for every focus-visible element under forced colours', () => {
    const start = css.indexOf('@media (forced-colors: active)');
    const block = css.slice(start, css.indexOf('\n}\n', start));
    expect(block).toMatch(/:focus-visible \{ outline: 2px solid Highlight;/);
  });
  it('never removes the focus outline', () => {
    expect(css).not.toMatch(/:focus(-visible)?\s*\{[^}]*outline:\s*(none|0)/);
  });
});
