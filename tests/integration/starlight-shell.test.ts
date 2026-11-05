import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ACKNOWLEDGMENT_SHA256 } from '../../scripts/publication.mjs';
import { createHash } from 'node:crypto';
import { currentReleaseVersion } from '../../site/src/content/release';

/* The shell every page shares on Starlight: the header, the sidebar, the table of contents, the
   footer with the site information block and the acknowledgment, and the head. */
const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = resolve(root, 'site/dist');
const htmlFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? htmlFiles(resolve(directory, entry.name)) : entry.name.endsWith('.html') ? [resolve(directory, entry.name)] : []));
const pages = htmlFiles(dist).map((file) => ({ route: `/${relative(dist, file).split(sep).join('/').replace(/index\.html$/, '')}`, html: readFileSync(file, 'utf8') }));
const page = (route: string) => pages.find((entry) => entry.route === route)!.html;
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

describe('header', () => {
  it('shows the site title, the search control, the repository link and the theme select on every page', () => {
    for (const { route, html } of pages) {
      const header = html.match(/<header class="header[^"]*"[^>]*>([\s\S]*?)<\/header>/)?.[1] ?? '';
      expect(header, route).toContain('class="site-title');
      expect(text(header.match(/<a href="\/" class="site-title[^"]*"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? ''), route).toBe('Laptop-to-Cluster Guide');
      expect(header, route).toMatch(/<site-search\b|<button[^>]*data-open-modal/);
      expect(header, route).toMatch(/<a href="https:\/\/github\.com\/pnsinha\/laptop-to-cluster"[^>]*rel="me"[^>]*>/);
      expect(header, route).toContain('<starlight-theme-select>');
      expect(header, route).toMatch(/<option value="dark"[^>]*>Dark<\/option>/);
    }
  });
});

describe('sidebar', () => {
  it('lists the learning path first, in order, then the mid-task pages, the evidence and the project records', () => {
    const sidebar = page('/').match(/<nav class="sidebar[^"]*"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
    const groups = [...sidebar.matchAll(/<span class="large[^"]*">([^<]+)<\/span>/g)].map(([, label]) => label);
    expect(groups).toEqual(['Learning path', 'While you run it', 'Evidence', 'Project']);
    const hrefs = [...sidebar.matchAll(/<a href="([^"]+)"/g)].map(([, href]) => href).filter((href) => href.startsWith('/'));
    expect(hrefs.slice(0, 7)).toEqual(['/resources/', '/guide/tour/', '/guide/scheduler-as-orchestrator/', '/start/', '/guide/baseline-single-node-pattern/', '/guide/compose-to-hpc-translation/', '/adoption/evaluate/']);
    expect(hrefs.slice(7)).toEqual(['/diagnostics/', '/about/cheat-sheet/', '/about/glossary/', '/applicability/m2-baseline-anvil-2026-10/', '/milestones/1/', '/milestones/2/', '/about/project/', '/about/talks-and-papers/', '/about/attribution/', '/about/accessibility/', '/about/support/']);
    expect(sidebar).toMatch(/<details open[^>]*><summary[^>]*><span class="group-label[^"]*"><span class="large[^"]*">Learning path/);
    expect(sidebar).toMatch(/<details class="[^"]*"><summary[^>]*><span class="group-label[^"]*"><span class="large[^"]*">Project/);
  });

  it('links the About page from every page, so attribution is one step away', () => {
    for (const { route, html } of pages) {
      const sidebar = html.match(/<nav class="sidebar[^"]*"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
      expect(sidebar, route).toContain('href="/about/project/"');
    }
  });

  it('marks the current page, and only the current page, on every page it lists', () => {
    for (const { route, html } of pages) {
      const sidebar = html.match(/<nav class="sidebar[^"]*"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
      const current = [...sidebar.matchAll(/<a href="([^"]+)" aria-current="page"/g)].map(([, href]) => href);
      if (sidebar.includes(`href="${route}"`)) expect(current, route).toEqual([route]);
      else expect(current, route).toEqual([]);
    }
  });
});

describe('table of contents and pager', () => {
  it('offers an "On this page" list on the reading pages, from the body headings, and none on the home page', () => {
    for (const route of ['/guide/tour/', '/guide/baseline-single-node-pattern/', '/start/', '/adoption/evaluate/', '/diagnostics/', '/about/glossary/']) {
      const html = page(route);
      expect(html, route).toContain('<h2 id="starlight__on-this-page">On this page</h2>');
      expect(html.match(/<starlight-toc[^>]*>[\s\S]*?<\/starlight-toc>/)?.[0], route).toMatch(/<a href="#[^"]+"/);
    }
    expect(page('/')).not.toContain('starlight__on-this-page');
    expect(page('/guide/baseline-single-node-pattern/')).toMatch(/<a href="#implementation-reference-heading"[^>]*>[\s\S]*?Implementation reference/);
  });

  it('pages along the learning path only, from the tour to the evaluation guide', () => {
    const pager = (route: string) => page(route).match(/<div class="pagination-links[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
    expect(pager('/guide/tour/')).not.toContain('rel="prev"');
    expect(pager('/guide/tour/')).toMatch(/<a href="\/guide\/scheduler-as-orchestrator\/" rel="next"/);
    expect(pager('/start/')).toMatch(/<a href="\/guide\/scheduler-as-orchestrator\/" rel="prev"/);
    expect(pager('/start/')).toMatch(/<a href="\/guide\/baseline-single-node-pattern\/" rel="next"/);
    expect(pager('/adoption/evaluate/')).toMatch(/<a href="\/guide\/compose-to-hpc-translation\/" rel="prev"/);
    expect(pager('/adoption/evaluate/')).not.toContain('rel="next"');
    for (const route of ['/', '/applicability/m2-baseline-anvil-2026-10/', '/404.html']) expect(pager(route), route).toBe('');
  });
});

describe('footer', () => {
  it('holds the site information links and the verbatim acknowledgment inside the footer element on every page', () => {
    const release = currentReleaseVersion();
    for (const { route, html } of pages) {
      const footer = html.match(/<footer class="l2c-footer[^"]*"[^>]*>([\s\S]*?)<\/footer>/)?.[1] ?? '';
      expect(footer, route).not.toBe('');
      const links = [...(footer.match(/<nav aria-label="Site information">([\s\S]*?)<\/nav>/)?.[1] ?? '').matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(([, href, label]) => [label, href]);
      expect(links, route).toEqual([
        [`Release ${release}`, '/milestones/2/#release-v0-2-0'],
        ['Report a problem', '/about/support/'],
        ['Accessibility', '/about/accessibility/'],
        ['Attribution and licenses', '/about/attribution/'],
        ['GitHub repository (external)', 'https://github.com/pnsinha/laptop-to-cluster'],
      ]);
      const acknowledgment = footer.match(/<p class="acknowledgment">([^<]+)<\/p>/g) ?? [];
      expect(acknowledgment, route).toHaveLength(1);
      expect(sha(text(acknowledgment[0])), route).toBe(ACKNOWLEDGMENT_SHA256);
    }
  });

  it('shows the edit link and the last-updated date on the content pages', () => {
    const module2 = page('/guide/baseline-single-node-pattern/');
    expect(module2).toContain('href="https://github.com/pnsinha/laptop-to-cluster/edit/main/site/src/content/content-items/02-baseline-single-node-pattern.md"');
    expect(module2).toMatch(/Last updated: <time datetime="2026-10-20T00:00:00\.000Z">/);
    expect(page('/')).not.toContain('/edit/main/');
  });
});

describe('head', () => {
  it('carries the canonical and feed links, two font preloads, the theme-color metas and the three inline helpers, with no inline styles', () => {
    for (const { route, html } of pages) {
      const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
      expect(head, route).toMatch(/<link rel="canonical" href="https:\/\/laptop-to-cluster\.org\/[^"]*"\/>/);
      expect(head, route).toContain('<link rel="alternate" type="application/rss+xml" title="Laptop-to-Cluster updates" href="https://laptop-to-cluster.org/feed.xml"/>');
      expect(head.match(/<link rel="preload" href="\/fonts\/[^"]+\.woff2" as="font" type="font\/woff2" crossorigin="anonymous"\/>/g), route).toHaveLength(2);
      expect(head, route).toContain('<meta name="theme-color" media="(prefers-color-scheme: light)" content="#fbf9f4"/>');
      expect(head, route).toContain('<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#131a29"/>');
      expect(head.match(/attributeFilter:\['data-theme'\]/g), route).toHaveLength(1);
      expect(head.match(/beforeprint/g), route).toHaveLength(1);
      expect(head.match(/hashchange/g), route).toHaveLength(1);
      expect(head, route).toContain('<link rel="shortcut icon" href="/favicon.svg"');
      expect(html, route).not.toMatch(/<style\b/);
    }
    expect(existsSync(resolve(dist, 'favicon.svg'))).toBe(true);
  });

  it('links the same stylesheets on every page, one of them holding the tokens', () => {
    const sheets = pages.map(({ html }) => (html.match(/<link rel="stylesheet" href="([^"]+)"/g) ?? []).map((link) => link.match(/href="([^"]+)"/)![1]).filter((href) => !href.includes('/print.')));
    const shared = sheets[0].filter((href) => sheets.every((list) => list.includes(href)));
    expect(shared.length).toBeGreaterThanOrEqual(1);
    const withTokens = shared.filter((href) => readFileSync(resolve(dist, `.${href}`), 'utf8').includes('--canvas:'));
    expect(withTokens).toHaveLength(1);
  });
});
