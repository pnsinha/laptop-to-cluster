import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { CONCEPTS, DOORS, REQUIRED_FRAGMENTS } from '../../site/src/content/contracts';
import { CROSSWALK } from '../../site/src/content/crosswalk';
import { BIG_IDEA, CLOSING, CONCEPT_NOTES, CREDIT, CROSSWALK_DISCLOSURE, EVENT_BAND, HERO, presentedAtLead, siteFacts } from '../../site/src/content/home';
import { currentReleaseVersion } from '../../site/src/content/release';
import type { Talk } from '../../site/src/content/schema';

const root = fileURLToPath(new URL('../..', import.meta.url));
const home = readFileSync(resolve(root, 'site/dist/index.html'), 'utf8');
const main = home.slice(home.indexOf('<main'), home.indexOf('</main>'));
/* The page's own content, without Starlight's mobile table of contents and other navigation inside <main>. */
const content = main.replace(/<nav\b[\s\S]*?<\/nav>/g, '');
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
const talks = parse(readFileSync(resolve(root, 'site/src/content/talks.yml'), 'utf8')) as Talk[];
const panes = [...main.matchAll(/<figure class="crosswalk__pane" data-pane="([a-z]+)"><figcaption>([\s\S]*?)<\/figcaption><pre><code>([\s\S]*?)<\/code><\/pre><\/figure>/g)]
  .map(([, id, caption, code]) => ({
    id,
    caption,
    lines: [...code.matchAll(/<span class="crosswalk__line"(?: data-concepts="([a-z ]+)")?><span class="crosswalk__mark" aria-hidden="true">([^<]*)<\/span>(?:<span class="crosswalk__sr">([^<]*)<\/span>)?(?:<span class="crosswalk__n">(\d+)<\/span>)?([^]*?)<\/span>/g)]
      .map(([, concepts = '', marks, sr = '', n, body]) => ({
        concepts: concepts ? concepts.split(' ') : [],
        marks,
        sr,
        n: n ? Number(n) : undefined,
        text: decode(body).replace(/\n$/, ''),
      })),
  }));

describe('home page, built output', () => {
  it('keeps the order: hero, projection, facts, doors, concept rows, crosswalk, closing, credit, event band, footer', () => {
    const marks = [
      '<div class="hero',
      '<section class="applicability-projection',
      '<p class="site-facts">',
      '<div class="doors not-content" id="doors">',
      '<section class="concepts not-content" id="big-idea"',
      '<section class="crosswalk not-content" id="crosswalk"',
      '<section class="home-close not-content"',
      '<p class="home-credit">',
      '<aside class="event-band not-content"',
    ];
    const positions = marks.map((mark) => main.indexOf(mark));
    positions.forEach((position, index) => expect(position, marks[index]).toBeGreaterThanOrEqual(0));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(home.indexOf('<footer class="l2c-footer')).toBeGreaterThan(main.indexOf('<aside class="event-band'));
    expect(home.indexOf('<footer class="l2c-footer')).toBeLessThan(home.indexOf('</main>'));
  });

  it('renders Starlight\'s hero with the title, the kicker and lede as the tagline, the figure, one filled action and one plain link', () => {
    const hero = main.match(/<div class="hero[\s\S]*?<div class="sl-markdown-content/)?.[0] ?? '';
    expect(hero).toContain('<h1 id="_top" data-page-title>');
    expect(text(hero.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '')).toBe(HERO.title);
    const tagline = hero.match(/<div class="tagline[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
    expect(tagline).toContain(`<p class="kicker">${HERO.kicker}</p>`);
    expect(text(tagline)).toContain(text(HERO.ledeHtml));
    expect(hero).toContain('<figure class="hero__figure not-content" aria-labelledby="hero-figure-caption">');
    expect(hero).toContain('<figcaption id="hero-figure-caption">');
    expect(hero).toContain('<p class="env__title">Your laptop</p>');
    expect(hero).toContain('<p class="env__title">A shared cluster</p>');
    expect(hero).toContain('<code>sbatch slurm/baseline.sbatch</code>');
    expect(hero.match(/<figure[\s\S]*?<\/figure>/)?.[0]).not.toMatch(/<svg|<img|<picture/);
    const actions = [...hero.matchAll(/<a class="sl-link-button[^"]*\b(primary|secondary|minimal)\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(([, variant, href, label]) => ({ variant, href, label: text(label) }));
    expect(actions).toEqual([
      { variant: 'primary', href: HERO.primary.href, label: HERO.primary.label },
      { variant: 'minimal', href: HERO.secondary.href, label: HERO.secondary.label },
    ]);
    expect(main.match(/class="sl-link-button[^"]*\bprimary\b/g)).toHaveLength(1);
    expect(home).toContain('<title>Bridging the Laptop-to-Cluster Gap');
    expect(home).toContain('<meta property="og:title" content="Bridging the Laptop-to-Cluster Gap"');
  });

  it('follows the badge with the release and fellowship facts, not a tested claim', () => {
    const facts = main.match(/<p class="site-facts">([\s\S]*?)<\/p>/)?.[1] ?? '';
    expect(text(facts)).toBe(siteFacts(currentReleaseVersion()));
    expect(main.indexOf('<p class="site-facts">')).toBeGreaterThan(main.search(PROJECTION));
  });

  it('renders four concept rows in contract order, each with its Compose name, tinted term and note', () => {
    const section = sectionFrom('<section class="concepts not-content" id="big-idea"');
    expect(section.startsWith('<section class="concepts not-content" id="big-idea" aria-labelledby="big-idea-title"><h2 id="big-idea-title">The big idea</h2>')).toBe(true);
    expect(section).toContain('<ol class="concepts__rows" role="list">');
    expect(section.match(/<li class="concept" data-concept="[a-z]+">/g)).toHaveLength(4);
    expect(section).not.toContain('<div class="concept"');
    const starts = CONCEPTS.map(({ key }) => section.indexOf(`<li class="concept" data-concept="${key}">`));
    starts.forEach((position, index) => expect(position, CONCEPTS[index].key).toBeGreaterThanOrEqual(0));
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    CONCEPTS.forEach(({ key, label, was }, index) => {
      const row = section.slice(starts[index], starts[index + 1] ?? section.length);
      expect(row, key).toContain(was);
      expect(row, key).toContain(`<p class="concept__n" aria-hidden="true">${String(index + 1).padStart(2, '0')}</p>`);
      expect(text(row), key).toContain(`${BIG_IDEA.composeSide} ${was}`);
      expect(text(row), key).toContain(`${BIG_IDEA.clusterSide} ${label}`);
      expect(row, key).toContain(`<span class="concept__term c-${key}">${label}</span>`);
      expect(text(row), key).toContain(text(CONCEPT_NOTES[key]));
    });
    expect(section).not.toMatch(/[■◆▲●]/);
  });

  it('keeps the three qualifiers inside the big idea', () => {
    const bigIdea = text(sectionFrom('<section class="concepts not-content" id="big-idea"'));
    for (const sentence of [
      'It does not establish that results are correct.',
      'It may remain until your center clears it; copy out what you need before the job ends.',
      'It is not an isolation boundary; access beyond the node requires center approval.',
    ]) expect(bigIdea, sentence).toContain(sentence);
  });

  it('leaves the timeline and the analogy off the home page', () => {
    expect(home).not.toContain('<figure class="timeline"');
    expect(home).not.toContain('class="analogy"');
  });

  it('uses no trailing arrows in the page content', () => {
    expect(content).not.toMatch(/[→↗➔➜⟶]|&rarr;/);
    for (const [, label] of content.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) expect(text(label)).not.toMatch(/(?:->|»|›|>)\s*$/);
  });

  it('keeps the crosswalk legend visible and the three code panes behind one named disclosure', () => {
    const crosswalk = sectionFrom('<section class="crosswalk not-content" id="crosswalk"');
    const legend = crosswalk.slice(0, crosswalk.indexOf('<details'));
    expect([...legend.matchAll(/<div class="crosswalk__term" data-concept="([a-z]+)">/g)].map(([, key]) => key)).toEqual(CONCEPTS.map(({ key }) => key));
    expect(crosswalk).toContain(`<details class="crosswalk__disclosure"><summary>${CROSSWALK_DISCLOSURE.summary}</summary><div class="crosswalk__panes">`);
    expect(crosswalk).not.toMatch(/<details[^>]*\sopen/);
    expect(crosswalk.match(/<figure class="crosswalk__pane"/g)).toHaveLength(3);
  });

  it('tags every legend concept in both the Compose and the sbatch pane, and quotes the script exactly', () => {
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

  it('renders the three frozen doors as cards, in contract order, with the audience line as the card title', () => {
    const doors = [...main.matchAll(/<div class="door" id="door-([a-z]+)">([\s\S]*?)<\/div>/g)];
    expect(doors.map(([, id]) => id)).toEqual(DOORS.map(({ id }) => id));
    const cards = sectionFrom('<section class="home-doors"');
    doors.forEach(([, , body], index) => {
      expect(text(cards)).toContain(DOORS[index].eyebrow);
      expect(body).toContain(`<h3 class="door__title">${DOORS[index].title}</h3>`);
      expect(body).toContain(`<a class="door__link" href="${DOORS[index].href}">${DOORS[index].linkText}</a>`);
    });
    expect(main).not.toContain('door__path');
  });

  it('closes with the two next steps, one outlined and one plain, then the author credit', () => {
    const close = sectionFrom('<section class="home-close not-content"');
    expect(close).toContain(`<h2 id="close-title">${CLOSING.title}</h2>`);
    expect(text(close)).toContain(CLOSING.lead);
    expect(close).toMatch(new RegExp(`<a class="sl-link-button[^"]*\\bsecondary\\b[^"]*"[^>]*href="${escapeRegExp(CLOSING.primary.href)}"[^>]*>${escapeRegExp(CLOSING.primary.label)}`));
    expect(close).toMatch(new RegExp(`<a class="sl-link-button[^"]*\\bminimal\\b[^"]*"[^>]*href="${escapeRegExp(CLOSING.secondary.href)}"[^>]*>${escapeRegExp(CLOSING.secondary.label)}`));
    const credit = main.match(/<p class="home-credit">([\s\S]*?)<\/p>/)?.[1] ?? '';
    expect(text(credit)).toBe(`${CREDIT.text} ${CREDIT.link.label}.`);
    expect(credit).toContain(`<a href="${CREDIT.link.href}">${CREDIT.link.label}</a>`);
    expect(credit).not.toMatch(/ParaTools|Department of Energy|National Science Foundation/);
  });

  it('names every talk and poster in the event band, as presented, with wording that stays true after the date', () => {
    const band = main.match(/<aside class="event-band not-content" aria-label="Presented at">([\s\S]*?)<\/aside>/)?.[1] ?? '';
    expect(band).toBe(`<p>${presentedAtLead(talks)}: <a href="${EVENT_BAND.href}">${EVENT_BAND.linkText}</a></p>`);
    expect(text(band)).toMatch(/^Presented at .*US-RSE’26 \(Oct 20, San Jose\)/);
    expect(text(band)).not.toMatch(/upcoming|coming|will|join|next|soon/i);
    expect(main).not.toContain('Here from the SC26 poster');
    expect(main).not.toContain('project-links');
    expect(main).not.toContain('Project records');
  });

  it('keeps system names, versions, dates, job IDs and digests inside the projection only', () => {
    expect(main.match(PROJECTION)).not.toBeNull();
    // The crosswalk caption links to the record page, whose id carries the system name; that generated href is allowed.
    // The footer sits inside <main> on Starlight; its acknowledgment names grant and contract numbers.
    const outside = content.replace(PROJECTION, '').replace(/<footer[\s\S]*?<\/footer>/, '').replace(/\shref="\/applicability\/[^"]+\/"/g, '');
    for (const pattern of [
      /anvil/i, /purdue/i, /\b(?:slurm|apptainer)\s+v?\d/i, /\b20\d\d-\d\d-\d\d\b/,
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* 20\d\d\b/, /\b\d{7,}\b/, /sha256:/i,
    ]) expect(outside, String(pattern)).not.toMatch(pattern);
  });

  it('exposes each contract fragment exactly once', () => {
    for (const id of REQUIRED_FRAGMENTS.home) expect(home.match(new RegExp(`\\bid="${id}"`, 'g')), id).toHaveLength(1);
  });

  it('puts plain language before the term on the home page and never says reservation', () => {
    const section = sectionFrom('<section class="concepts not-content" id="big-idea"');
    const notes = [...section.matchAll(/<p class="concept__note">([\s\S]*?)<\/p>/g)].map(([, note]) => text(note));
    expect(notes).toHaveLength(4);
    CONCEPTS.forEach((concept, index) => {
      expect(notes[index], concept.key).toMatch(new RegExp(`${escapeRegExp(concept.plain)}\\s*\\((?:an? )?${escapeRegExp(concept.label.toLowerCase())}\\)`, 'i'));
    });
    expect(text(content.replace(PROJECTION, ''))).not.toMatch(/reserv/i);
  });

  it('keeps the home sources free of style, script and inline handlers', () => {
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
