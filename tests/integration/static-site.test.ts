import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { validateBuiltOutput } from '../../scripts/publication.mjs';

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
    const expectedScope = `The baseline workflow was validated on ${source.environment.public_name} with ${source.scheduler.family} and ${source.runtime.name}.`;
    for (const [key, consumer] of Object.entries(consumers) as Array<[keyof typeof consumers, string]>) {
      expect(projectionCount(html[key]), key).toBe(1);
      const block = html[key].match(/<section class="applicability-projection".*?<\/section>/)?.[0] ?? '';
      expect(block, key).toContain(`data-projection-id="${consumer}:${source.id}"`);
      expect(block, key).toContain(`data-source-id="${source.id}"`);
      expect(block, key).toContain(expectedScope);
      expect(block, key).toContain(source.portability_boundaries[0]);
      expect(block.match(/href="\/applicability\/[^"]+\/"/g), key).toEqual([`href="/applicability/${source.id}/"`]);
      expect(block.match(/<p(?:\s|>)/g), key).toHaveLength(3);
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
        .replace(/<section class="applicability-projection".*?<\/section>/g, '')
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
    expect(html.runnable).toContain('PREREQ-SLURM');
    expect(html.runnable).toContain('PREREQ-APPTAINER');
    expect(html.runnable).toContain('Implementation reference');
    expect(html.runnable).toContain('workflows/baseline-slurm-apptainer/slurm/baseline.sbatch');
    expect(html.runnable).toContain('bin/readiness.py');
    expect(html.runnable).toContain('&quot;status&quot;: &quot;success&quot;');
    expect(html.start).toContain('Open the v0.1.0 sbatch script (external)');
    expect(html.start).toContain('workflows/baseline-slurm-apptainer/slurm/baseline.sbatch');
    expect(html.start).toContain('implementation-reference');
    const disclosures = html.runnable.match(/<details.*?<\/details>/g) ?? [];
    for (const disclosure of disclosures) expect(disclosure).not.toMatch(/Prerequisites|Tested workflow scope|Unvalidated content/);
    expect(html.runnable).not.toMatch(/<(?:section|aside|article)[^>]*(?:hidden|aria-hidden="true")[^>]*>.*?(?:Prerequisites|applicability-projection)/);
  });

  it('places sources after substantive content and suppresses healthy support panels', () => {
    for (const key of ['conceptual', 'runnable'] as const) expect(html[key].indexOf('Sources and scope')).toBeGreaterThan(html[key].indexOf('Next step'));
    expect(html.support).not.toContain('Public artifact status: available');
    expect(html.support).not.toContain('class="support-state');
  });
});

describe('reader-choice landing and resources', () => {
  it('uses a semantic workflow figure with verification last and decorative connectors hidden', () => {
    expect(html.home).toContain('<figure class="workflow-figure">');
    expect(html.home).toContain('<figcaption>One allocation, five ordered responsibilities</figcaption>');
    expect(html.home).toContain('<ol>');
    const figure = html.home.match(/<figure class="workflow-figure">(.*?)<\/figure>/)?.[1] ?? '';
    expect([...figure.matchAll(/<strong>([^<]+)<\/strong>/g)].map((match) => match[1]))
      .toEqual(['Allocation', 'Coordinator', 'Readiness gate', 'Workers', 'Verification']);
    expect(figure.match(/<i aria-hidden="true">↓<\/i>/g)).toHaveLength(4);
    expect(figure.slice(figure.indexOf('<strong>Verification</strong>'))).not.toContain('<i');
    expect(html.home.indexOf('Verification')).toBeGreaterThan(html.home.indexOf('Workers'));
    expect(html.home.indexOf('applicability-projection')).toBeGreaterThan(html.home.indexOf('</figure>'));
    expect(html.home).not.toMatch(/validation dashboard|from module metadata|No account is required/i);
  });

  it('keeps resources complete, ordinary-linked, choice-oriented, and free of internal metadata', () => {
    expect(html.resources).not.toMatch(/<script\b|client:|Applicability records|Keywords|published ·/i);
    for (const heading of ['Learn the model', 'Run and recover', 'Review the project']) expect(html.resources).toContain(heading);
    expect(html.resources).toContain('href="/guide/scheduler-as-orchestrator/"');
    expect(html.resources).toContain('href="/guide/baseline-single-node-pattern/"');
    expect(html.resources).not.toContain('Planned for a later milestone');

    const cards = html.resources.match(/<a class="resource-tile"[^>]*>.*?<\/a>/g) ?? [];
    expect(cards).toHaveLength(15);
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
    const figure = html.home.match(/<figure class="workflow-figure">([\s\S]*?)<\/figure>/)?.[1] ?? '';
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

  it('uses system fonts, both schemes, native tables, bounded overflow, and no decorative technology', () => {
    expect(generatedCss).toMatch(/color-scheme:light dark/);
    expect(generatedCss).toMatch(/--font-display:\s*(?:ui-serif|system-ui|Georgia)/);
    expect(generatedCss).toMatch(/system-ui/);
    expect(generatedCss).toMatch(/ui-monospace/);
    expect(generatedCss).not.toMatch(/@font-face|@import url|fonts\.google|use\.typekit|linear-gradient|radial-gradient|backdrop-filter/);
    expect(generatedCss).not.toMatch(/@keyframes|animation-name:|animation:|transition:|scroll-timeline|parallax/);
    expect(generatedCss).not.toMatch(/table\{[^}]*display:block/);
    expect(generatedCss).toMatch(/\.table-overflow\{[^}]*overflow-x:auto/);
    for (const page of pages) expect(page.html, page.route).not.toMatch(/client:(?:load|idle|visible)|<script\b|<canvas\b|autoplay|<marquee\b|fonts\.(?:googleapis|gstatic)|use\.typekit/i);
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
