import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('../../site/src/styles/global.css', import.meta.url)), 'utf8');

describe('reduced-motion override', () => {
  it('neutralises scroll, transition and animation everywhere inside the reduce block', () => {
    const start = css.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(start).toBeGreaterThanOrEqual(0);
    const block = css.slice(start, css.indexOf('\n}\n', start));
    for (const decl of [
      'scroll-behavior: auto !important',
      'transition: none !important',
      'animation: none !important',
    ]) expect(block, decl).toContain(decl);
    expect(block).toMatch(/\*,\s*\*::before,\s*\*::after/);
  });
});
