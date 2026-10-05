import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const src = `${root}/site/src`;
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
/* Properties declared in the stylesheets: tokens.css plus the few component-local ones in global.css. */
const declared = walk(`${src}/styles`).filter((path) => path.endsWith('.css')).map((path) => readFileSync(path, 'utf8')).join('\n');
const defined = new Set([...declared.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
/* Shiki writes these two on every highlighted span. */
const supplied = new Set(['--shiki-light', '--shiki-dark']);

describe('custom property resolution', () => {
  it('resolves every var(--x) under site/src to a property declared in the stylesheets', () => {
    const missing: string[] = [];
    for (const file of walk(src).filter((path) => /\.(css|astro|ts)$/.test(path))) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/var\((--[a-z0-9-]+)/g)) {
        if (!defined.has(match[1]) && !supplied.has(match[1])) missing.push(`${file.slice(root.length)}: ${match[1]}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});
