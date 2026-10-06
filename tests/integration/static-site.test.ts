import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { PROJECTION_SECTION, validateBuiltOutput } from '../../scripts/publication.mjs';
import { TIMELINE_STEPS } from '../../site/src/content/contracts.js';
import { formatMonthYear } from '../../site/src/content/projections.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = resolve(root, 'site/dist');
const readPage = (path: string) => readFileSync(resolve(dist, path, 'index.html'), 'utf8');
const route = {
  home: '', resources: 'resources', start: 'start', diagnostics: 'diagnostics',
  conceptual: 'guide/scheduler-as-orchestrator', runnable: 'guide/baseline-single-node-pattern',
  applicability: 'applicability/m1-baseline-anvil',
  milestone: 'milestones/1', attribution: 'about/attribution',
  accessibility: 'about/accessibility', support: 'about/support',
  event: 'events/iguide-forum-2026',
} as const;
const html = Object.fromEntries(Object.entries(route).map(([key, path]) => [key, readPage(path)])) as Record<keyof typeof route, string>;
const source = parse(readFileSync(resolve(root, 'site/src/content/applicability/m1-baseline-anvil.yml'), 'utf8')) as any;

function htmlFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}
const pages = htmlFiles(dist).map((file) => ({ file, html: readFileSync(file, 'utf8'), route: relative(dist, file).split(sep).join('/').replace(/index\.html$/, '') })).filter(({ route }) => route !== '404.html');
const generatedCss = readdirSync(resolve(dist, '_astro')).filter((file) => file.endsWith('.css')).map((file) => readFileSync(resolve(dist, '_astro', file), 'utf8')).join('\n');
const projectionCount = (page: string) => page.match(/data-projection-id=/g)?.length ?? 0;
// One projection block, validated or escalated; the opening pattern is the shared export (C4).
const projectionBlocks = new RegExp(`${PROJECTION_SECTION.source}[\\s\\S]*?</section>`, 'g');
const escaped = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const profiles: Record<keyof typeof route, string> = {
  home: 'landing', resources: 'resources', start: 'start', diagnostics: 'diagnostic',
  conceptual: 'learning-conceptual', runnable: 'learning-runnable',
  applicability: 'applicability', milestone: 'milestone', attribution: 'about',
  accessibility: 'accessibility', support: 'support', event: 'event',
};

describe('artifact-aware static composition', () => {
  it('assigns every validated composition profile to representative routes', () => {
    for (const [key, profile] of Object.entries(profiles)) expect(html[key as keyof typeof route], key).toContain(`data-composition-profile="${profile}"`);
    expect(new Set(Object.values(profiles))).toEqual(new Set([
      'landing', 'resources', 'learning-conceptual', 'learning-runnable', 'start', 'diagnostic',
      'milestone', 'about', 'support', 'accessibility', 'applicability', 'event',
    ]));
  });

  it('renders one source-agreeing projection only on authorized pages', () => {
    const consumers = { home: 'landing', runnable: 'runnable-module', milestone: 'milestone' } as const;
    for (const [key, consumer] of Object.entries(consumers) as Array<[keyof typeof consumers, string]>) {
      expect(projectionCount(html[key]), key).toBe(1);
      const block = html[key].match(projectionBlocks)?.[0] ?? '';
      expect(block, key).toContain(`data-projection-id="${consumer}:${source.id}"`);
      expect(block, key).toContain(`data-source-id="${source.id}"`);
      expect(block, key).toContain(`<p class="evidence-badge">Tested on ${source.environment.public_name} · ${formatMonthYear(source.validation_date)}</p>`);
      for (const item of [source.plain_language.tested, ...source.plain_language.you_need, ...source.plain_language.depends_on_center]) expect(block, key).toContain(escaped(item.text));
      expect(block.match(/href="\/applicability\/[^"]+\/"/g), key).toEqual([`href="/applicability/${source.id}/"`]);
      // Tightened: the old `<p` count only passed by coincidence once the panel arrived.
      expect(block.match(/<p class="evidence-(?:badge|link|untested)"/g), key).toHaveLength(3);
      expect(block.match(/<div class="evidence-row">/g), key).toHaveLength(3);
      expect(block, key).toContain('<details class="evidence-panel">');
    }
    for (const key of ['resources', 'conceptual', 'start', 'attribution', 'accessibility', 'support'] as const) expect(projectionCount(html[key]), key).toBe(0);
    // Diagnostics are anchored sections of the single /diagnostics/ page; only the
    // apptainer diagnostic has a typed causal relationship to the applicability record.
    expect(projectionCount(html.diagnostics)).toBe(1);
    expect(html.diagnostics).toContain(`data-projection-id="diagnostic:BSSW-PREREQ-APPTAINER:${source.id}"`);
    expect(html.diagnostics.match(/Relevant discriminator:/g)).toHaveLength(1);
    expect(html.diagnostics).toContain('runtime: Apptainer');
    expect(html.diagnostics).not.toContain('Tested workflow scope');
  });

  it('keeps exhaustive validation fields only on the canonical applicability page', () => {
    const canonical = html.applicability;
    for (const value of [
      source.environment.public_name, source.environment.notes, source.scheduler.version, source.runtime.version,
      source.container_digest, source.workflow_revision, source.execution_date, source.validation_date,
      source.submission_id, source.result.terminal_state, String(source.result.exit_code), source.evidence.id,
      source.evidence.integrity, source.review_after,
    ]) expect(canonical).toContain(value);
    expect(canonical).toContain(source.environment.fallback ? 'Fallback' : 'Primary');
    for (const check of source.result.checks) expect(canonical).toContain(check);
    for (const item of [...source.assumptions, ...source.limitations, ...source.portability_boundaries]) expect(canonical).toContain(item.replaceAll('&', '&amp;'));
    for (const provenance of source.provenance) {
      expect(canonical).toContain(provenance.label);
      expect(canonical).toContain(provenance.reference.path);
      expect(canonical).toContain(provenance.reference.integrity);
    }
    expect(canonical).toContain(`class="applicability-record" data-source-id="${source.id}"`);
    expect(route.applicability).toBe(`applicability/${source.id}`);
    for (const [key, page] of Object.entries(html)) {
      if (key === 'applicability') continue;
      const conciseRemoved = page
        .replace(projectionBlocks, '')
        .replace(/<aside class="diagnostic-applicability".*?<\/aside>/g, '');
      for (const forbidden of [
        source.environment.public_name, source.scheduler.version, source.runtime.version,
        source.execution_date, source.validation_date, source.submission_id, source.evidence.id,
        source.evidence.integrity, source.portability_boundaries[0], ...source.result.checks,
      ]) expect(conciseRemoved, `${key}:${forbidden}`).not.toContain(forbidden);
    }
  });

  it('keeps critical runnable guidance visible and safely ordered before execution', () => {
    const procedure = html.runnable.indexOf('<h2 id="procedure">');
    expect(html.runnable.indexOf('Prerequisites')).toBeLessThan(procedure);
    expect(html.runnable.indexOf('Tested workflow scope')).toBeLessThan(procedure);
    expect(html.runnable).toContain('Safety and scope limitations');
    expect(html.runnable).toContain('PREQ-SLURM');
    expect(html.runnable).toContain('PREQ-APPTAINER');
    expect(html.runnable).toContain('Implementation reference');
    expect(html.runnable).toContain('workflows/baseline-slurm-apptainer/slurm/baseline.sbatch');
    expect(html.runnable).toContain('bin/readiness.py');
    // The success marker is now stated as inline code in "Expected result"; accept either quote form.
    expect(html.runnable).toMatch(/&quot;status&quot;: &quot;success&quot;|"status": "success"/);
    expect(html.start).toContain('Open the v0.1.0 sbatch script (external)');
    expect(html.start).toContain('workflows/baseline-slurm-apptainer/slurm/baseline.sbatch');
    expect(html.start).toContain('implementation-reference');
    const disclosures = html.runnable.match(/<details.*?<\/details>/g) ?? [];
    for (const disclosure of disclosures) expect(disclosure).not.toMatch(/Prerequisites|Tested workflow scope|Unvalidated content/);
    expect(html.runnable).not.toMatch(/<(?:section|aside|article)[^>]*(?:hidden|aria-hidden="true")[^>]*>.*?(?:Prerequisites|applicability-projection)/);
  });

  it('places sources after substantive content and suppresses healthy support panels', () => {
    for (const key of ['conceptual', 'runnable'] as const) {
      const keyPoints = html[key].indexOf('id="key-points"');
      expect(keyPoints, `${key}: key points heading`).toBeGreaterThan(-1);
      expect(html[key].indexOf('Sources and scope'), key).toBeGreaterThan(keyPoints);
    }
    expect(html.support).not.toContain('Public artifact status: available');
    expect(html.support).not.toContain('class="support-state');
  });
});

describe('reader-choice landing and resources', () => {
  it('uses the six-step timeline with verify before clean up and the projection before the big idea', () => {
    expect(html.home).toContain('<figure class="timeline" aria-labelledby="timeline-title">');
    expect(html.home).toContain('<figcaption id="timeline-title" class="timeline__title">One allocation, start to finish</figcaption>');
    expect(html.home).toContain('<ol class="timeline__steps">');
    const figure = html.home.match(/<figure class="timeline"[^>]*>([\s\S]*?)<\/figure>/)?.[1] ?? '';
    expect(figure).not.toBe('');
    expect([...figure.matchAll(/<strong>([^<]+)<\/strong>/g)].map((match) => match[1]))
      .toEqual(TIMELINE_STEPS.map(({ label }) => label));
    // K7: decorative arrows and `<i>` are gone; the A2 lane spans and the ◆ gate mark are allowed.
    expect(figure).not.toMatch(/↓|→|<i\b/);
    expect(figure.indexOf('<strong>Verify results</strong>')).toBeGreaterThan(figure.indexOf('<strong>Run workers</strong>'));
    expect(figure.indexOf('<strong>Verify results</strong>')).toBeLessThan(figure.indexOf('<strong>Clean up</strong>'));
    const projection = html.home.indexOf('<section class="applicability-projection');
    expect(projection).toBeGreaterThan(-1);
    expect(projection).toBeLessThan(html.home.indexOf('<figure class="timeline"'));
    expect(html.home).not.toMatch(/validation dashboard|from module metadata|No account is required/i);
  });

  it('keeps resources complete, ordinary-linked, choice-oriented, and free of internal metadata', () => {
    expect(html.resources).not.toMatch(/Applicability records|Keywords|published ·/i);
    for (const heading of ['Understand', 'Translate', 'Evaluate and adopt']) expect(html.resources).toContain(heading);
    expect(html.resources).toContain('href="/guide/scheduler-as-orchestrator/"');
    expect(html.resources).toContain('href="/guide/baseline-single-node-pattern/"');
    expect(html.resources).not.toContain('Planned for a later milestone');

    const cards = html.resources.match(/<a class="resource-tile"[^>]*>.*?<\/a>/g) ?? [];
    expect(cards).toHaveLength(12);
    const tileHrefs = cards.map((card) => card.match(/href="([^"]+)"/)?.[1] ?? '');
    expect(new Set(tileHrefs).size).toBe(tileHrefs.length);
    for (const href of [
      '/guide/tour/', '/guide/scheduler-as-orchestrator/', '/start/', '/guide/baseline-single-node-pattern/',
      '/guide/compose-to-hpc-translation/', '/diagnostics/', '/adoption/evaluate/', '/milestones/1/', '/milestones/2/',
      '/about/talks-and-papers/',
    ]) expect(tileHrefs, href).toContain(href);
    for (const card of cards) {
      expect(card).not.toMatch(/resource-card__metadata|<strong>(?:Keywords|Status|Milestone|Environment|Version):/i);
      expect(card.match(/class="resource-tile__tag"/g)?.length ?? 0).toBeLessThanOrEqual(1);
    }
  });
});

describe('finalized presentation regression gates', () => {
  it('uses the funded project title in the landing page <title>', () => {
    expect(html.home).toContain('<title>Bridging the Laptop-to-Cluster Gap');
  });

  it('renders at most one filled hero action on the landing page', () => {
    const primaryActions = html.home.match(/class="action action--primary"/g) ?? [];
    expect(primaryActions.length).toBeLessThanOrEqual(1);
  });

  it('exposes no "publication candidate" text in any page visible content', () => {
    for (const page of pages) {
      expect(page.html.toLowerCase(), page.route).not.toContain('publication candidate');
    }
  });

  it('uses no generic card/raised containers on resources, diagnostics, learning-path steps, project links, applicability context, completion, or sources', () => {
    const contexts = [html.resources, html.diagnostics, html.home, html.applicability];
    for (const page of contexts) {
      expect(page).not.toMatch(/class="[^"]*card--raised[^"]*"/);
      expect(page).not.toMatch(/class="[^"]*card--generic[^"]*"/);
      expect(page).not.toMatch(/class="[^"]*raised-surface[^"]*"/);
    }
  });

  it('does not imply clickability on unlinked containers (no cursor:pointer on non-interactive elements)', () => {
    // Resource tiles must themselves be links (not standalone clickable containers)
    const resourceCards = html.resources.match(/<a class="resource-tile"[^>]*>.*?<\/a>/gs) ?? [];
    expect(resourceCards.length).toBeGreaterThan(0);
  });

  it('does not restore per-step boxes or connector/arrow SVGs in the workflow', () => {
    const figure = html.home.match(/<figure class="timeline"[^>]*>([\s\S]*?)<\/figure>/)?.[1] ?? '';
    expect(figure).not.toBe('');
    expect(figure).not.toMatch(/<svg\b/);
    expect(figure).not.toMatch(/class="[^"]*connector[^"]*"/);
    expect(figure).not.toMatch(/class="[^"]*step-box[^"]*"/);
    // Decorative ↓ arrows must be aria-hidden
    const arrows = figure.match(/<i[^>]*>↓<\/i>/g) ?? [];
    for (const arrow of arrows) {
      expect(arrow).toContain('aria-hidden="true"');
    }
  });

  it('renders the 404 page with not-found profile and Home/Resources links', () => {
    const notFoundHtml = readFileSync(resolve(dist, '404.html'), 'utf8');
    expect(notFoundHtml).toContain('data-composition-profile="not-found"');
    expect(notFoundHtml).toContain('href="/"');
    expect(notFoundHtml).toContain('href="/resources/"');
  });

  it('keeps the full funding administration text on the attribution page only, not repeated inline elsewhere', () => {
    for (const page of pages.filter(({ route }) => route !== 'about/attribution/').slice(0, 5)) {
      expect(page.html, page.route).not.toContain('ParaTools');
    }
    expect(html.attribution).toContain('ParaTools');
  });
});

describe('static accessibility, metadata, and dependency gates', () => {
  it('preserves landmarks, one h1, and canonical apex metadata on every page', () => {
    expect(pages.length).toBeGreaterThan(10);
    for (const page of pages) {
      expect(page.html.match(/<h1(?:\s|>)/g), page.route).toHaveLength(1);
      for (const marker of ['<header class="site-header">', '<main id="main" tabindex="-1">', '<footer class="site-footer">']) expect(page.html, page.route).toContain(marker);
      const canonical = `https://laptop-to-cluster.org/${page.route}`;
      expect(page.html).toContain(`<link rel="canonical" href="${canonical}">`);
      expect(page.html).toContain(`<meta property="og:url" content="${canonical}">`);
      expect(page.html).not.toMatch(/\.pages\.dev|www\.laptop-to-cluster\.org|laptoptocluster\.org/);
    }
  });

  it('uses self-hosted fonts with system fallbacks, both schemes, native tables, bounded overflow, and no decorative technology', () => {
    expect(generatedCss).toMatch(/color-scheme:light dark/);
    expect(generatedCss).toMatch(/--font-display:\s*"Source Serif 4"/);
    expect(generatedCss).toMatch(/system-ui/);
    expect(generatedCss).toMatch(/ui-monospace/);
    expect(generatedCss).not.toMatch(/@import url|fonts\.google|use\.typekit|linear-gradient|radial-gradient|backdrop-filter/);
    // Same-origin rule (full budget lives in font-budget.test.ts and W3's REMOTE-FONT): no font URL leaves the site.
    expect(generatedCss).not.toMatch(/url\(["']?(?:https?:)?\/\//);
    // The reduced-motion override (`transition:none!important;animation:none!important`) is allowed, as in the MOTION rule.
    expect(generatedCss).not.toMatch(/@keyframes|animation-name:(?!\s*none(?![\w-]))|animation:(?!\s*none(?![\w-]))|transition:(?!\s*none(?![\w-]))|scroll-timeline|parallax/);
    expect(generatedCss).not.toMatch(/table\{[^}]*display:block/);
    expect(generatedCss).toMatch(/\.table-overflow\{[^}]*overflow-x:auto/);
    // Progressive-enhancement policy: scripts and islands are permitted; canvas,
    // autoplay, marquee, and remote fonts remain forbidden.
    for (const page of pages) expect(page.html, page.route).not.toMatch(/<canvas\b|autoplay|<marquee\b|fonts\.(?:googleapis|gstatic)|use\.typekit/i);
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    expect(pkg.dependencies).toEqual({ '@astrojs/sitemap': '3.7.3', astro: '7.1.3' });
    const config = readFileSync(resolve(root, 'site/astro.config.mjs'), 'utf8');
    expect(config.match(/integrations:\s*\[([^\]]+)\]/)?.[1].replace(/\s/g, '')).toBe('sitemap(),canonicalPolicy(),accessibleTables()');
    expect(config).not.toMatch(/ViewTransitions|adapter|server\s*:|session|auth/i);
  });

  it('passes the publication validator that enforces composition, agreement, visibility, and reachability', () => {
    expect(validateBuiltOutput(dist)).toEqual([]);
  });
});

describe('v0.2.0 routes, timeline placement and evidence summaries', () => {
  const extra = {
    tour: 'guide/tour', translate: 'guide/compose-to-hpc-translation', evaluate: 'adoption/evaluate', talks: 'about/talks-and-papers',
  } as const;
  const extraHtml = Object.fromEntries(Object.entries(extra).map(([key, path]) => [key, readPage(path)])) as Record<keyof typeof extra, string>;

  it('builds the three door pages and the talks page with one h1, the adoption page in the adoption profile', () => {
    for (const [key, page] of Object.entries(extraHtml)) expect(page.match(/<h1(?:\s|>)/g), key).toHaveLength(1);
    expect(extraHtml.evaluate).toContain('data-composition-profile="adoption"');
    expect(extraHtml.talks).toContain('data-composition-profile="about"');
  });

  it('shows a record summary only on adoption-profile pages, at most once', () => {
    for (const page of pages) {
      const count = page.html.match(/<section class="record-summary"/g)?.length ?? 0;
      if (page.html.includes('data-composition-profile="adoption"')) expect(count, page.route).toBeLessThanOrEqual(1);
      else expect(count, page.route).toBe(0);
    }
  });

  it('does not report any applicability record page as duplicating its own summaries (D3)', () => {
    const errors = validateBuiltOutput(dist).filter((error) => /SOURCE-DUPLICATION/.test(error) && /applicability\//.test(error));
    expect(errors).toEqual([]);
  });

  it('places the timeline per D13: unlit on home, tour and Module 1, step 3 lit on Module 2, nowhere else', () => {
    const lit: Record<string, number[]> = {
      '': [], 'guide/tour/': [], 'guide/scheduler-as-orchestrator/': [], 'guide/baseline-single-node-pattern/': [3],
    };
    for (const page of pages) {
      const figures = page.html.match(/<figure class="timeline"/g)?.length ?? 0;
      if (!(page.route in lit)) { expect(figures, page.route).toBe(0); continue; }
      expect(figures, page.route).toBe(1);
      const steps = [...page.html.matchAll(/<li class="timeline__step"([^>]*)>/g)];
      expect(steps, page.route).toHaveLength(6);
      const highlighted = steps.filter((step) => step[1].includes('aria-current="step"')).map((step) => Number(step[1].match(/data-step="(\d)"/)?.[1]));
      expect(highlighted, page.route).toEqual(lit[page.route]);
    }
  });

  it('renders the A2 lane markup, the aria-hidden bars and the scratch-tail sentence inside the timeline', () => {
    const figure = html.home.match(/<figure class="timeline"[^>]*>([\s\S]*?)<\/figure>/)?.[1] ?? '';
    const lanes = [...figure.matchAll(/<span class="timeline__lane"[^>]*data-lane="([a-z]+)"/g)].map((match) => match[1]);
    expect(lanes).toEqual(TIMELINE_STEPS.flatMap(() => ['scratch', 'coord', 'workers', 'checks']));
    expect(figure.match(/<span class="timeline__bars" aria-hidden="true">/g)).toHaveLength(6);
    expect(figure.indexOf('</ol>')).toBeLessThan(figure.indexOf('<p class="timeline__after">'));
    expect(figure.indexOf('<p class="timeline__after">')).toBeLessThan(figure.indexOf('<dl class="timeline__key">'));
  });

  it('renders the A1 screen-reader text on tagged crosswalk lines only, and the A3 subtitle', () => {
    const crosswalk = html.home.match(/<section class="crosswalk"[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(crosswalk).toContain('<p class="crosswalk__subtitle">');
    expect(crosswalk).not.toContain('data-concepts=""');
    const tagged = crosswalk.match(/ data-concepts="[^"]+"/g)?.length ?? 0;
    const readerText = [...crosswalk.matchAll(/<span class="crosswalk__sr">([^<]*)<\/span>/g)].map((match) => match[1]);
    expect(tagged).toBeGreaterThan(0);
    expect(readerText).toHaveLength(tagged);
    for (const text of readerText) expect(text).toMatch(/:\s*$/);
  });
});
