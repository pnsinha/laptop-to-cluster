import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { accessibilityPages, requiredKinds } from './browser-fixtures';

const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = resolve(root, 'site/dist');
const pages = accessibilityPages.map((fixture) => ({
  ...fixture,
  html: fixture.distRoute === '404'
    ? readFileSync(resolve(dist, '404.html'), 'utf8')
    : readFileSync(resolve(dist, fixture.distRoute, 'index.html'), 'utf8'),
}));
const css = readdirSync(resolve(dist, '_astro'))
  .filter((file) => file.endsWith('.css'))
  .map((file) => readFileSync(resolve(dist, '_astro', file), 'utf8'))
  .join('\n');
const withoutDisclosures = (html: string) => html.replace(/<details\b[\s\S]*?<\/details>/g, '');

describe('representative static accessibility coverage', () => {
  it('covers every required page kind with a semantic, script-independent document shell', () => {
    const coveredKinds = new Set(pages.map(({ kind }) => kind));
    for (const kind of requiredKinds) expect(coveredKinds.has(kind), kind).toBe(true);
    for (const page of pages) {
      expect(page.html, page.path).toMatch(/<html lang="en">/);
      expect(page.html, page.path).toContain('href="#main"');
      expect(page.html, page.path).toMatch(/<nav[^>]+aria-label="Primary"/);
      expect(page.html, page.path).toMatch(/<main id="main" tabindex="-1">/);
      expect(page.html, page.path).toMatch(/<footer class="site-footer">/);
      expect(page.html.match(/<h1(?:\s|>)/g), page.path).toHaveLength(1);
      expect(page.html, page.path).not.toMatch(/<script\b|onclick=|onkeydown=|client:/i);
    }
  });

  it('keeps prerequisites, assumptions, warnings, status, scope, and reporting or recovery links outside disclosures', () => {
    for (const page of pages) {
      const visibleWithoutDisclosure = withoutDisclosures(page.html);
      for (const marker of page.criticalOutsideDisclosure ?? []) {
        expect(visibleWithoutDisclosure, `${page.path}: ${marker}`).toContain(marker);
      }
      if (page.html.includes('Unvalidated content')) {
        expect(visibleWithoutDisclosure, `${page.path}: unvalidated state`).toContain('Unvalidated content');
      }
    }
    expect(withoutDisclosures(pages.find(({ kind }) => kind === 'runnable module')!.html)).toMatch(/<strong>Warning:<\/strong>/);
    expect(withoutDisclosures(pages.find(({ kind }) => kind === 'start')!.html)).toContain('Confirm these assumptions before execution');
    expect(withoutDisclosures(pages.find(({ kind }) => kind === 'support')!.html)).toContain('project maintainer');
  });

  it('uses named native disclosures, meaningful alternatives, and native table regions', () => {
    for (const page of pages) {
      for (const details of page.html.match(/<details\b[\s\S]*?<\/details>/g) ?? []) {
        expect(details, page.path).toMatch(/<summary>[^<]+<\/summary>/);
      }
      for (const image of page.html.match(/<img\b[^>]*>/g) ?? []) {
        expect(image, page.path).toMatch(/\balt="[^"]*"/);
      }
    }
    const home = pages.find(({ kind }) => kind === 'home')!.html;
    expect(home).toMatch(/<figure class="workflow-figure">[\s\S]*?<figcaption>[\s\S]*?<ol>/);
    const milestone = pages.find(({ kind }) => kind === 'milestone')!.html;
    expect(milestone).toMatch(/class="table-overflow layout-data" role="region" aria-label="[^"]+ table" tabindex="0"/);
    expect(milestone).toMatch(/<table>[\s\S]*?<th>Deliverable<\/th>[\s\S]*?<th>Status<\/th>/);
  });

  it('provides non-color link, current-page, warning, and status cues', () => {
    expect(css).toMatch(/a\{[^}]*text-decoration-thickness:/);
    expect(css).toMatch(/\.action\{[^}]*border:/);
    expect(css).toMatch(/\.site-nav__link\[aria-current=(?:"page"|page)\]:(?::)?before\{content:"▸ "/);
    expect(css).toMatch(/\.site-nav__link--external\{[^}]*border:/);
    for (const page of pages) expect(page.html, page.path).toContain('(external)');
    expect(pages.find(({ kind }) => kind === 'support')!.html).toContain('Warning: protect sensitive information');
    expect(pages.find(({ kind }) => kind === 'milestone')!.html).toMatch(/<strong>Status:<\/strong>/);
    expect(pages.find(({ kind }) => kind === 'home')!.html).toMatch(/<strong>(?:Status|Boundary):<\/strong>/);
  });

  it('defines minimum sizes, focus, both schemes, bounded content, forced colors, print, and reduced motion', () => {
    expect(css).toMatch(/--text-base:1rem/);
    expect(css).toMatch(/--text-supporting:\.875rem/);
    expect(css).toMatch(/:focus-visible\{outline:/);
    expect(css).toMatch(/color-scheme:light dark/);
    expect(css).toMatch(/forced-colors:active/);
    expect(css).toMatch(/@media print/);
    expect(css).toMatch(/(?:max-width:30rem|width<=30rem)/);
    expect(css).toMatch(/prefers-reduced-motion:reduce/);
    expect(css).toMatch(/overflow-wrap:anywhere/);
    expect(css).toMatch(/\.table-overflow\{[^}]*overflow-x:auto/);
    expect(css).not.toMatch(/@font-face|@import\s+url|url\(["']?https?:|fonts\.(?:googleapis|gstatic)|use\.typekit/i);
    expect(css).not.toMatch(/@keyframes|animation-name\s*:|animation\s*:|transition\s*:/);
  });

  it('renders the 404/not-found page with semantic structure, Home/Resources links, and visible focus', () => {
    const notFound = pages.find(({ kind }) => kind === 'not-found');
    expect(notFound, 'not-found fixture must exist').toBeDefined();
    const html = notFound!.html;
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toContain('href="#main"');
    expect(html).toMatch(/<main id="main" tabindex="-1">/);
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/resources/"');
    expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
    expect(html).not.toMatch(/<script\b|onclick=|onkeydown=|client:/i);
  });

  it('ensures warning meaning is not color-dependent (text label always present)', () => {
    for (const page of pages) {
      // Every warning-colored region must have explicit text label
      if (page.html.includes('class="notice"') || page.html.includes('class="support-state')) {
        expect(page.html, page.path).toMatch(/<strong>(?:Warning|Status|Draft|Superseded|Archived|Unvalidated content|failed|unvalidated|stale)(?::|<)/i);
      }
    }
  });

  it('ensures the secondary hero link is an adequate click target (standard inline link with sufficient text)', () => {
    const home = pages.find(({ kind }) => kind === 'home')!.html;
    const heroSecondary = home.match(/class="hero__secondary-link"[^>]*>(.*?)<\/a>/s)?.[1] ?? '';
    // Must have at least 4 characters of text (adequate target)
    expect(heroSecondary.replace(/<[^>]*>/g, '').trim().length).toBeGreaterThanOrEqual(4);
  });
});
