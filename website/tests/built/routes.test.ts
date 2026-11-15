import { describe, expect, it } from 'vitest';
import { pages, read } from './dist';

/* Check 1: the build publishes exactly these addresses. A page is added or removed only by changing
   this list in the same change. */
const ORIGIN = 'https://laptop-to-cluster.org';
const PAGES = [
  '/', '/about/accessibility/', '/about/attribution/', '/about/cheat-sheet/', '/about/glossary/', '/about/project/',
  '/about/support/', '/about/talks-and-papers/', '/adoption/evaluate/', '/applicability/m1-baseline-anvil/',
  '/applicability/m2-baseline-anvil-2026-10/', '/diagnostics/', '/events/iguide-forum-2026/',
  '/guide/baseline-single-node-pattern/', '/guide/compose-to-hpc-translation/', '/guide/scheduler-as-orchestrator/',
  '/guide/tour/', '/milestones/1/', '/milestones/2/', '/resources/', '/start/',
];

describe('route set', () => {
  it('builds exactly the published pages, plus 404.html', () => {
    expect(pages.map(({ path }) => path).sort()).toEqual([...PAGES, '/404.html'].sort());
  });

  it('lists the same pages in the sitemap and the URL manifest', () => {
    const urls = PAGES.map((path) => `${ORIGIN}${path}`).sort();
    expect([...read('sitemap-0.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]).sort()).toEqual(urls);
    const manifest = JSON.parse(read('url-manifest.json'));
    expect(manifest.canonical_origin).toBe(ORIGIN);
    expect(manifest.records.map(({ url }: { url: string }) => url).sort()).toEqual(urls);
    expect(manifest.records.every(({ id, path, url }: Record<string, string>) => /^[a-z0-9-]+$/.test(id) && url === `${ORIGIN}${path}`)).toBe(true);
  });

  it('publishes a feed whose every item links to a built page', () => {
    const links = [...read('feed.xml').matchAll(/<link>([^<]+)<\/link>/g)].map((match) => match[1]).slice(1);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(PAGES).toContain(link.replace(ORIGIN, '').split('#')[0]);
  });
});
