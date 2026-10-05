import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (file: string) => readFileSync(`${root}/site/src/styles/${file}`, 'utf8');
const css = read('global.css').replace(/@import "\.\/([a-z-]+\.css)";/g, (_match, file: string) => read(file));
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
const chipRule = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
  ([, selector]) => selector.split(',').map((s) => s.trim()).join(', ') === '.c-step, .c-gate, .c-scratch, .c-net',
);

describe('concept chips fit a 320px viewport', () => {
  it('has a shared chip rule', () => {
    expect(chipRule).toBeTruthy();
  });
  it('does not forbid wrapping', () => {
    expect(chipRule![2]).not.toMatch(/white-space:\s*nowrap/);
  });
  it('wraps long labels and keeps tint and outline across lines', () => {
    expect(chipRule![2]).toMatch(/overflow-wrap:\s*anywhere/);
    expect(chipRule![2]).toMatch(/-webkit-box-decoration-break:\s*clone/);
    expect(chipRule![2]).toMatch(/box-decoration-break:\s*clone/);
  });
});
