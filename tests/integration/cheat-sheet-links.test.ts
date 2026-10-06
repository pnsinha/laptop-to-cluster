import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = resolve(root, 'site/dist');
const page = (route: string) => readFileSync(join(dist, route, 'index.html'), 'utf8');

describe('cheat sheet: where it is linked from', () => {
  it('is linked from the five-minute tour', () => {
    expect(page('guide/tour')).toContain('href="/about/cheat-sheet/"');
  });
  it('is linked from Talks & papers', () => {
    expect(page('about/talks-and-papers')).toContain('href="/about/cheat-sheet/"');
  });
  it('every error ID on the sheet appears on the Troubleshooting page', () => {
    // Match the printed text, not an anchor: W2 and W6 own the anchor scheme.
    const sheet = readFileSync(join(root, 'site/src/content/content-items/about-cheat-sheet.md'), 'utf8');
    const ids = [...sheet.matchAll(/`(BSSW-[A-Z-]+)` \(([\d, ]+)\)/g)].map((m) => m[1]);
    expect(ids).toHaveLength(15);
    const html = page('diagnostics');
    for (const id of ids) expect(html, id).toMatch(new RegExp(`${id}(?![A-Z-])`));
  });
});
