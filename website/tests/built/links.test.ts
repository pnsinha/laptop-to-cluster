import { describe, expect, it } from 'vitest';
import { pages } from './dist';

/* Check 3, links: every same-site link and every fragment resolves in the built site. */
const ids = new Map(pages.map(({ path, html }) => [path, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]))]));
const assets = /^\/(?:_astro|fonts|pagefind)\/|\.(?:pdf|svg|xml|json|txt|css|js|woff2)$/;

describe('internal links', () => {
  for (const { path, html } of pages) {
    it(`resolve from ${path}`, () => {
      const broken: string[] = [];
      for (const [, raw] of html.matchAll(/\shref="([^"]+)"/g)) {
        const href = raw.replace(/^https:\/\/laptop-to-cluster\.org(?=\/)/, '');
        if (!href.startsWith('/') && !href.startsWith('#')) continue;
        const [target, fragment] = href.split('#');
        const page = target === '' ? path : target;
        if (assets.test(page)) continue;
        const known = ids.get(page);
        if (!known) broken.push(href);
        else if (fragment && !known.has(decodeURIComponent(fragment))) broken.push(href);
      }
      expect(broken).toEqual([]);
    });
  }
});
