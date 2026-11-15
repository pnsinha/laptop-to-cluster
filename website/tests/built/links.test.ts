import { describe, expect, it } from 'vitest';
import { pages, text } from './dist';

/* Check 3, links: every same-site link and every fragment resolves in the built site, and the
   disclosures that hide code or entries keep their markup. */
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

describe('Module 2 code excerpts', () => {
  const html = pages.find(({ path }) => path === '/guide/baseline-single-node-pattern/')!.html;
  const section = /<section class="implementation-reference[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';

  it('each sit in a closed disclosure whose summary names the excerpt', () => {
    const pres = [...section.matchAll(/<pre\b[^>]*>/g)].map((match) => match[0]);
    const disclosed = [...section.matchAll(/<details class="source-excerpt__code">\s*<summary>([\s\S]*?)<\/summary>\s*(<pre\b[^>]*>)/g)];
    expect(pres).toHaveLength(6);
    expect(disclosed.map((match) => match[2])).toEqual(pres);
    for (const pre of pres) expect(pre).toMatch(/^<pre tabindex="0" aria-label="[^"]+ source code">$/);
    const summaries = disclosed.map((match) => text(match[1]));
    for (const summary of summaries) expect(summary).toMatch(/^Show the code \(\d+ lines\) ?: .+/);
    expect(new Set(summaries).size).toBe(summaries.length);
  });
});
