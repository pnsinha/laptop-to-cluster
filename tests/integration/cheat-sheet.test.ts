import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DESIGNED_NOT_RUN } from '../../site/src/content/contracts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = resolve(root, 'site/dist');
const pageOf = (route: string) => readFileSync(join(dist, route, 'index.html'), 'utf8');
const sheet = pageOf('about/cheat-sheet');

describe('cheat sheet: built page', () => {
  it('is an About page with one h1 and the print hook', () => {
    expect(sheet).toContain('data-composition-profile="about"');
    expect(sheet.match(/<h1(?:\s|>)/g)).toHaveLength(1);
    expect(sheet).toContain('<h1>One-page cheat sheet</h1>');
    expect(sheet.match(/<div class="cheat-sheet">/g)).toHaveLength(1);
  });

  it('needs no JavaScript and carries no control', () => {
    const article = sheet.match(/<article>[\s\S]*<\/article>/)?.[0] ?? '';
    expect(article).not.toBe('');
    expect(article).not.toMatch(/<button|<script|<form|<input/);
    expect(sheet).not.toContain('crosswalk__status');
  });

  it('labels untested rows with the exact label and keeps the sheet free of system, date and job text', () => {
    const article = sheet.match(/<article>[\s\S]*<\/article>/)![0];
    expect(article.match(new RegExp(`<td>${DESIGNED_NOT_RUN}</td>`, 'g'))!.length).toBeGreaterThanOrEqual(4);
    expect(article.match(/<td>Tested<\/td>/g)!.length).toBeGreaterThanOrEqual(10);
    expect(article).not.toMatch(/Purdue|Anvil|Expanse|Jetstream|\b20\d\d\b|\bv\d+\.\d+|job ?id\b|\b\d{7,}\b/i);
  });

  it('resolves every internal link and fragment', () => {
    const hrefs = [...sheet.matchAll(/<a [^>]*href="(\/[^"]*)"/g)].map(([, href]) => href);
    expect(hrefs.length).toBeGreaterThan(5);
    for (const href of hrefs) {
      const [path, fragment] = href.split('#');
      const file = join(dist, path, path.endsWith('/') ? 'index.html' : '');
      expect(existsSync(file), `${href} -> ${file}`).toBe(true);
      if (fragment && file.endsWith('.html')) expect(readFileSync(file, 'utf8'), href).toContain(`id="${fragment}"`);
    }
  });

  it('is in the sitemap and the URL manifest', () => {
    expect(readFileSync(join(dist, 'sitemap-0.xml'), 'utf8')).toContain('https://laptop-to-cluster.org/about/cheat-sheet/');
    expect(readFileSync(join(dist, 'url-manifest.json'), 'utf8')).toContain('/about/cheat-sheet/');
  });
});
