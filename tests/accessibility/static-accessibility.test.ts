import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EVIDENCE_ROW_LABELS, NAV_ITEMS } from '../../site/src/content/contracts';
import { inspectThemeScript } from './browser-checks';
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
const text = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const anchorTexts = (html: string) => [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map((match) => text(match[1]));

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
      // Inline handlers remain prohibited under the progressive-enhancement policy.
      expect(page.html, page.path).not.toMatch(/onclick=|onkeydown=/i);
    }
  });

  it('puts one blocking theme script in the head and keeps the theme control hidden until script shows it', () => {
    for (const page of pages) {
      expect(inspectThemeScript(page.html, page.path), page.path).toEqual([]);
      const control = page.html.match(/<[^>]*data-theme-control[^>]*>/)?.[0] ?? '';
      expect(control, page.path).toMatch(/\shidden(?:[\s=>]|$)/);
      const choices = [...page.html.matchAll(/<button\b[^>]*data-theme-choice="(system|light|dark)"[^>]*aria-pressed="(?:true|false)"[^>]*>(System|Light|Dark)<\/button>/g)].map((match) => `${match[1]}:${match[2]}`);
      expect(choices, page.path).toEqual(['system:System', 'light:Light', 'dark:Dark']);
    }
  });

  it('lists the five frozen navigation items in order, and the footer records links', () => {
    for (const page of pages) {
      const primary = page.html.match(/<nav[^>]+aria-label="Primary"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
      expect(anchorTexts(primary), page.path).toEqual(NAV_ITEMS.map(({ label }) => label));
      const records = page.html.match(/<nav[^>]+aria-label="Site records"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
      expect(anchorTexts(records), page.path).toEqual(['Attribution', 'Talks & papers', 'Accessibility', 'Support', 'Licenses', 'GitHub (external)']);
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
    expect(withoutDisclosures(pages.find(({ kind }) => kind === 'runnable module')!.html)).toContain('Prerequisites');
    expect(withoutDisclosures(pages.find(({ kind }) => kind === 'start')!.html)).toContain('Confirm these assumptions before you run anything');
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
    const modulePage = pages.find(({ kind }) => kind === 'runnable module')!.html;
    expect(modulePage).toMatch(/<figure class="timeline" aria-labelledby="timeline-title"><figcaption id="timeline-title" class="timeline__title">[^<]+<\/figcaption><ol class="timeline__steps">/);
    expect(modulePage).toMatch(/<span class="timeline__bars" aria-hidden="true">/);
    expect(home).toMatch(/<span class="crosswalk__mark" aria-hidden="true">/);
    const milestone = pages.find(({ kind }) => kind === 'milestone')!.html;
    expect(milestone).toMatch(/class="table-overflow layout-data" role="region" aria-label="[^"]+ table" tabindex="0"/);
    expect(milestone).toMatch(/<table>[\s\S]*?<th>Deliverable<\/th>[\s\S]*?<th>Status<\/th>/);
  });

  it('exposes the evidence panel as a native disclosure with the three frozen row labels', () => {
    const home = pages.find(({ kind }) => kind === 'home')!.html;
    expect(home).toMatch(/<details class="evidence-panel"><summary>What this means for you<\/summary>/);
    const rows = home.match(/<dl class="evidence-rows">([\s\S]*?)<\/dl>/)?.[1] ?? '';
    expect([...rows.matchAll(/<dt>([^<]+)<\/dt>/g)].map((match) => match[1])).toEqual([...EVIDENCE_ROW_LABELS]);
    expect(home).toMatch(/<p class="evidence-badge(?: [^"]*)?">(?:<strong>Warning:<\/strong> )?[^<]+<\/p>/);
  });

  it('provides non-color link, current-page, selected, shape, warning, and status cues', () => {
    expect(css).toMatch(/a\{[^}]*text-decoration-thickness:/);
    expect(css).toMatch(/\.action[^{]*\{[^}]*border/);
    expect(css).toMatch(/\[aria-current=(?:"page"|page)\][^{]*\{[^}]*(?:border|text-decoration|font-weight|content)/);
    expect(css).toMatch(/\[aria-pressed=(?:"true"|true)\][^{]*\{[^}]*(?:border|outline|text-decoration|font-weight)/);
    for (const mark of ['■', '◆', '▲', '●']) expect(css, mark).toContain(mark);
    for (const page of pages) expect(page.html, page.path).toContain('(external)');
    expect(pages.find(({ kind }) => kind === 'support')!.html).toContain('sanitized technical checklist');
    expect(pages.find(({ kind }) => kind === 'milestone')!.html).toMatch(/<strong>Status:<\/strong>/);
  });

  it('defines minimum sizes, focus, both schemes, bounded content, forced colors, print, and reduced motion', () => {
    expect(css).toMatch(/--text-base:1rem/);
    expect(css).toMatch(/--text-supporting:\.875rem/);
    expect(css).toMatch(/:focus-visible[^{]*\{outline:/);
    expect(css).toMatch(/color-scheme:light dark/);
    expect(css).toMatch(/forced-colors:active/);
    expect(css).toMatch(/@media print/);
    expect(css).toMatch(/(?:max-width:30rem|width<=30rem)/);
    expect(css).toMatch(/prefers-reduced-motion:reduce/);
    expect(css).toMatch(/overflow-wrap:anywhere/);
    expect(css).toMatch(/\.table-overflow\{[^}]*overflow-x:auto/);
    expect(css).not.toMatch(/@import\s+url|url\(["']?https?:|fonts\.(?:googleapis|gstatic)|use\.typekit/i);
    expect(css).not.toMatch(/@keyframes|animation-name\s*:\s*(?!none)|animation\s*:\s*(?!none)|transition\s*:\s*(?!none)/);
  });

  it('self-hosts only the allowed font faces, as swap-loaded local or same-origin woff2 sources', () => {
    const faces = css.match(/@font-face\{[^}]*\}/g) ?? [];
    expect(faces.length).toBeGreaterThanOrEqual(6);
    const families = new Set<string>();
    for (const face of faces) {
      expect(face).toMatch(/font-display:swap/);
      const family = face.match(/font-family:\s*["']?([^;"'}]+)["']?/)?.[1].trim() ?? '';
      expect(family, face).toMatch(/^(?:Source Serif 4|IBM Plex Sans|IBM Plex Mono|L2C Marks)(?: Fallback)?$/);
      families.add(family);
      const sources = (face.match(/src:([^;}]+)/)?.[1] ?? '').split(/,(?![^(]*\))/).map((source) => source.trim());
      expect(sources.length, face).toBeGreaterThan(0);
      for (const source of sources) expect(source, face).toMatch(/^(?:local\(["']?[^)"']+["']?\)|url\(\/fonts\/[\w./-]+\.woff2\)\s*format\(["']woff2["']\))$/);
    }
    for (const family of ['Source Serif 4', 'IBM Plex Sans', 'IBM Plex Mono', 'L2C Marks']) expect(families.has(family), family).toBe(true);
    for (const [, file] of css.matchAll(/url\((\/fonts\/[\w./-]+\.woff2)\)/g)) expect(existsSync(resolve(dist, file.slice(1))), file).toBe(true);
    for (const page of pages) {
      const preloads = (page.html.match(/<link\b[^>]*>/g) ?? []).filter((link) => /rel="preload"/.test(link) && /as="font"/.test(link));
      expect(preloads.length, page.path).toBeLessThanOrEqual(2);
      for (const link of preloads) expect(link, page.path).toMatch(/crossorigin/);
    }
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
    expect(html).not.toMatch(/onclick=|onkeydown=/i);
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
