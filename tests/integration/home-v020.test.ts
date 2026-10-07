import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { CONCEPTS, DOORS, REQUIRED_FRAGMENTS, TIMELINE_STEPS } from '../../site/src/content/contracts';
import { CROSSWALK } from '../../site/src/content/crosswalk';
import { EVENT_BAND, eventBandLead, resolveLearningPath } from '../../site/src/content/home';
import type { ContentItem, Talk } from '../../site/src/content/schema';

const root = fileURLToPath(new URL('../..', import.meta.url));
const home = readFileSync(resolve(root, 'site/dist/index.html'), 'utf8');
const main = home.slice(home.indexOf('<main'), home.indexOf('</main>'));
const decode = (value: string) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const text = (html: string) => decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PROJECTION = /<section class="applicability-projection(?: [^"]*)?"[\s\S]*?<\/section>/;
const sectionFrom = (start: string) => {
  const at = main.indexOf(start);
  return at < 0 ? '' : main.slice(at, main.indexOf('</section>', at) + '</section>'.length);
};
const walk = (directory: string): string[] => readdirSync(directory).flatMap((name) => {
  const path = join(directory, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const contentDirectory = resolve(root, 'site/src/content/content-items');
const contentItems = readdirSync(contentDirectory).filter((file) => file.endsWith('.md'))
  .map((file) => parse(readFileSync(join(contentDirectory, file), 'utf8').split(/^---\s*$/m)[1]) as ContentItem);
const talks = parse(readFileSync(resolve(root, 'site/src/content/talks.yml'), 'utf8')) as Talk[];
const panes = [...main.matchAll(/<figure class="crosswalk__pane" data-pane="([a-z]+)"><figcaption>([\s\S]*?)<\/figcaption><pre><code>([\s\S]*?)<\/code><\/pre><\/figure>/g)]
  .map(([, id, caption, code]) => ({
    id,
    caption,
    lines: [...code.matchAll(/<span class="crosswalk__line"(?: data-concepts="([a-z ]+)")?><span class="crosswalk__mark" aria-hidden="true">([^<]*)<\/span>(?:<span class="crosswalk__sr">([^<]*)<\/span>)?(?:<span class="crosswalk__n">(\d+)<\/span>)?([^<]*)<\/span>/g)]
      .map(([, concepts = '', marks, sr = '', n, body]) => ({
        concepts: concepts ? concepts.split(' ') : [],
        marks,
        sr,
        n: n ? Number(n) : undefined,
        text: decode(body).replace(/\n$/, ''),
      })),
  }));

describe('home page, built output', () => {
  it('keeps the frozen order: hero, projection, big idea, doors, crosswalk, event band, project records, footer', () => {
    const marks = [
      '<section class="hero"',
      '<section class="applicability-projection',
      '<section class="big-idea" id="big-idea"',
      '<ul class="doors" role="list" id="doors">',
      '<section class="crosswalk" id="crosswalk"',
      '<aside class="event-band"',
      '<section class="project-links"',
    ];
    const positions = marks.map((mark) => main.indexOf(mark));
    positions.forEach((position, index) => expect(position, marks[index]).toBeGreaterThanOrEqual(0));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(home.indexOf('<footer class="site-footer"')).toBeGreaterThan(home.indexOf('</main>'));
    const hero = sectionFrom('<section class="hero"');
    expect(main.slice(main.indexOf(hero) + hero.length).startsWith('<section class="applicability-projection')).toBe(true);
  });

  it('builds the big idea as prose, then the unlit timeline, then the analogy and its breaks', () => {
    const bigIdea = sectionFrom('<section class="big-idea" id="big-idea"');
    expect(bigIdea.startsWith('<section class="big-idea" id="big-idea" aria-labelledby="big-idea-title"><h2 id="big-idea-title">The big idea</h2><p>')).toBe(true);
    const figure = bigIdea.indexOf('<figure class="timeline"');
    const analogy = bigIdea.indexOf('<div class="analogy">');
    expect(figure).toBeGreaterThan(bigIdea.indexOf('<p>'));
    expect(analogy).toBeGreaterThan(figure);
    expect(bigIdea).toContain('<h4>Where the analogy breaks</h4><ul class="analogy__breaks">');
    expect(bigIdea.match(/<ul class="analogy__breaks">([\s\S]*?)<\/ul>/)?.[1].match(/<li>/g)).toHaveLength(4);
  });

  it('renders a narrow hero with the kicker, h1, exactly one filled primary and the Compose shortcut, without an illustration', () => {
    const hero = sectionFrom('<section class="hero"');
    expect(hero).toContain('<div class="hero__copy"><p class="kicker">A free, open-source learning guide for Docker Compose users</p><h1 id="hero-title">Your Compose stack, on a shared cluster</h1><p class="lede">');
    expect(home.match(/class="action action--primary"/g)).toHaveLength(1);
    expect(hero).toContain('<a class="action action--primary" href="#big-idea">Start with the big idea</a>');
    expect(hero).toContain('<a class="hero__secondary-link" href="/guide/compose-to-hpc-translation/">Already have a Compose file? Translate it</a>');
    expect(hero).toContain('<p class="hero__quiet">Support researchers or run a cluster? <a href="/adoption/evaluate/">See what this assumes, and when not to use it</a></p>');
    expect(hero).not.toMatch(/<figure|<img|<svg|<picture/);
    expect(home).toContain('<title>Bridging the Laptop-to-Cluster Gap');
    expect(home).toContain('<meta property="og:title" content="Bridging the Laptop-to-Cluster Gap">');
    const lede = text(hero.match(/<p class="lede">([\s\S]*?)<\/p>/)?.[1] ?? '');
    for (const idea of [/docker compose up/, /no Docker daemon/, /no root access \(administrator rights\)/, /scheduler/, /wait your turn/]) expect(lede).toMatch(idea);
  });

  it('uses no trailing arrows in the page content', () => {
    expect(main).not.toMatch(/[→↗➔➜⟶]|&rarr;/);
    for (const [, label] of main.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) expect(text(label)).not.toMatch(/(?:->|»|›|>)\s*$/);
  });

  it('renders the six-step timeline once, unlit, in the frozen order, with the gate caption', () => {
    expect(home.match(/<figure class="timeline"/g)).toHaveLength(1);
    const figure = main.match(/<figure class="timeline"[^>]*>([\s\S]*?)<\/figure>/)?.[1] ?? '';
    const labels = [...figure.matchAll(/<li class="timeline__step"[^>]*><span class="timeline__num">Step \d<\/span> <strong>([^<]+)<\/strong>/g)].map(([, label]) => label);
    expect(labels).toEqual(TIMELINE_STEPS.map(({ label }) => label));
    expect(figure).not.toContain('aria-current');
    expect(figure.match(/data-step="3"[\s\S]*?<span class="timeline__caption">([^<]*)<\/span>/)?.[1]).toMatch(/proves the coordinator can serve/i);
    expect(figure).not.toMatch(/<svg\b/);
  });

  it('tags every legend concept in both the Compose and the sbatch pane, and quotes the script exactly', () => {
    expect([...main.matchAll(/<div class="crosswalk__term" data-concept="([a-z]+)">/g)].map(([, key]) => key)).toEqual(CONCEPTS.map(({ key }) => key));
    expect(panes.map(({ id }) => id)).toEqual(['compose', 'sbatch', 'coordinator']);
    for (const id of ['compose', 'sbatch']) {
      const tagged = new Set(panes.find((pane) => pane.id === id)!.lines.flatMap(({ concepts }) => concepts));
      for (const { key } of CONCEPTS) expect(tagged.has(key), `${id}:${key}`).toBe(true);
    }
    const file = readFileSync(resolve(root, 'workflows/baseline-slurm-apptainer/slurm/baseline.sbatch'), 'utf8').split('\n');
    const sbatch = panes.find(({ id }) => id === 'sbatch')!;
    expect(sbatch.lines.length).toBe(CROSSWALK.panes.find(({ id }) => id === 'sbatch')!.lines.length);
    for (const line of sbatch.lines) expect(line.text, `line ${line.n}`).toBe(file[line.n! - 1]);
    const markFor = Object.fromEntries(CONCEPTS.map(({ key, mark }) => [key, mark])) as Record<string, string>;
    for (const pane of panes) for (const line of pane.lines) expect(line.marks).toBe(line.concepts.map((key) => markFor[key]).join(''));
    // WCAG 1.3.1: the shape is aria-hidden, so every tagged line also carries its concept labels as text.
    const labelFor = Object.fromEntries(CONCEPTS.map(({ key, label }) => [key, label])) as Record<string, string>;
    for (const pane of panes) {
      for (const line of pane.lines) expect(line.sr, `${pane.id}:${line.n ?? line.text}`).toBe(line.concepts.length > 0 ? `${line.concepts.map((key) => labelFor[key]).join(', ')}: ` : '');
    }
  });

  it('labels the panes by status and revision, with the record link beside the script pane', () => {
    const recordId = main.match(PROJECTION)?.[0].match(/data-source-id="([^"]+)"/)?.[1];
    expect(recordId).toBeTruthy();
    expect(decode(panes[0].caption)).toBe('docker-compose.yml · simplified · Designed, not run');
    expect(panes[1].caption).toBe(`slurm/baseline.sbatch · excerpt · line numbers from v0.1.0 · <a href="/applicability/${recordId}/">Test record</a>`);
    expect(panes[2].caption).toBe('bin/coordinator.py · excerpt · line numbers from v0.1.0');
    for (const { caption } of panes) expect(text(caption)).not.toMatch(/\btested\b|validated|anvil|purdue/i);
  });

  it('renders the three frozen doors, with door 1 carrying the learning path resolved to titles and canonical URLs', () => {
    const doors = [...main.matchAll(/<li class="door" id="door-([a-z]+)">([\s\S]*?)<\/li>(?=<li class="door"|<\/ul>)/g)];
    expect(doors.map(([, id]) => id)).toEqual(DOORS.map(({ id }) => id));
    doors.forEach(([, , body], index) => expect(body).toContain(`<a class="door__link" href="${DOORS[index].href}">${DOORS[index].linkText}</a>`));
    expect(main).toContain('<p class="door__who">New to clusters? Start here</p>');
    const expectedPath = resolveLearningPath(contentItems);
    expect(expectedPath.length).toBeGreaterThanOrEqual(3);
    const rendered = [...(doors[0][2].match(/<ol class="door__path">([\s\S]*?)<\/ol>/)?.[1] ?? '').matchAll(/<li><a href="([^"]+)">([^<]+)<\/a><\/li>/g)]
      .map(([, href, label]) => ({ label: decode(label), href }));
    expect(rendered).toEqual(expectedPath);
    expect(doors[1][2]).not.toContain('door__path');
    expect(doors[2][2]).not.toContain('door__path');
  });

  it('renders the event band from the featured talk with wording that stays true after the date', () => {
    const featured = talks.find(({ featured }) => featured)!;
    const band = main.match(/<aside class="event-band" aria-label="Featured talk">([\s\S]*?)<\/aside>/)?.[1] ?? '';
    expect(band).toBe(`<p>${eventBandLead(featured)}: <a href="${EVENT_BAND.href}">${EVENT_BAND.linkText}</a></p>`);
    expect(text(band)).toBe('Talk at US-RSE ’26 (Tue Oct 20, San Jose): talk and poster links');
    expect(text(band)).not.toMatch(/upcoming|coming|will|join|next|soon/i);
    expect(main).not.toContain('Also at I-GUIDE 2026');
  });

  it('renders the project records strip with the funded title and the release notes from the release version', () => {
    const strip = sectionFrom('<section class="project-links"');
    expect(strip).toContain('<h2 id="project-links-title">Project records</h2>');
    expect.soft([...strip.matchAll(/<li><a href="([^"]+)">([^<]+)<\/a><\/li>/g)].map(([, href, label]) => [href, decode(label)])).toEqual([
      ['/about/attribution/', 'Bridging the Laptop-to-Cluster Gap: a 2026 Better Scientific Software Fellowship project'],
      ['/about/talks-and-papers/', 'Talks, posters & papers'],
      ['/milestones/2/#release-v0-2-0', 'v0.2.0 release notes'],
      ['/about/attribution/#licenses', 'Code Apache-2.0 · text CC BY 4.0'],
    ]);
    expect(strip).toContain('<p>Here from the SC26 poster or the US-RSE ’26 talk? <a href="/about/talks-and-papers/">Talk and poster links</a></p>');
    expect(strip).not.toMatch(/ParaTools|Department of Energy|National Science Foundation/);
  });

  it('labels the release notes with the version in the link fragment', () => {
    const strip = sectionFrom('<section class="project-links"');
    const [, href, label] = strip.match(/<li><a href="([^"]*#release-v\d+-\d+-\d+)">([^<]*release notes)<\/a><\/li>/) ?? [];
    expect(href).toBeDefined();
    const [, major, minor, patch] = href.match(/#release-v(\d+)-(\d+)-(\d+)$/)!;
    expect(decode(label)).toBe(`v${major}.${minor}.${patch} release notes`);
  });

  it('keeps system names, versions, dates, job IDs and digests inside the projection only', () => {
    expect(main.match(PROJECTION)).not.toBeNull();
    // The crosswalk caption links to the record page, whose id carries the system name.
    // That generated href is allowed; the visible text and everything else are not.
    const outside = main.replace(PROJECTION, '').replace(/\shref="\/applicability\/[^"]+\/"/g, '');
    for (const pattern of [
      /anvil/i, /purdue/i, /\b(?:slurm|apptainer)\s+v?\d/i, /\d+\.\d+\.\d+-\d/, /\bel\d\b/, /\b20\d\d-\d\d-\d\d\b/,
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* 20\d\d\b/, /\b\d{7,}\b/, /sha256:/i,
    ]) expect(outside, String(pattern)).not.toMatch(pattern);
  });

  it('exposes each contract fragment exactly once', () => {
    for (const id of REQUIRED_FRAGMENTS.home) expect(home.match(new RegExp(`\\bid="${id}"`, 'g')), id).toHaveLength(1);
  });

  it('puts plain language before the term on the home page and never says reservation', () => {
    const prose = text(sectionFrom('<section class="big-idea" id="big-idea"').match(/<h2 id="big-idea-title">The big idea<\/h2><p>([\s\S]*?)<\/p>/)?.[1] ?? '');
    for (const concept of CONCEPTS) {
      expect(prose, concept.key).toMatch(new RegExp(`${escapeRegExp(concept.plain)}\\s*\\((?:an? )?${escapeRegExp(concept.label.toLowerCase())}\\)`, 'i'));
    }
    expect(text(main.replace(PROJECTION, ''))).not.toMatch(/reserv/i);
  });

  it('removes the old workflow figure and keeps the home sources free of style, script and inline handlers', () => {
    expect(existsSync(resolve(root, 'site/src/components/WorkflowFigure.astro'))).toBe(false);
    expect(home).not.toContain('workflow-figure');
    for (const file of walk(resolve(root, 'site/src')).filter((path) => /\.(?:astro|ts|mjs)$/.test(path))) {
      expect(readFileSync(file, 'utf8'), file).not.toContain('WorkflowFigure');
    }
    for (const file of ['components/Timeline.astro', 'components/Doors.astro', 'components/Crosswalk.astro', 'pages/index.astro']) {
      expect(readFileSync(resolve(root, 'site/src', file), 'utf8'), file).not.toMatch(/<style\b|<script\b|\sstyle=|onclick/i);
    }
  });
});
