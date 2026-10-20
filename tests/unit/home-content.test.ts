import { describe, expect, it } from 'vitest';
import * as homeModule from '../../site/src/content/home';
import { CONCEPTS, DOORS, LEARNING_PATH, REQUIRED_FRAGMENTS } from '../../site/src/content/contracts';
import {
  BIG_IDEA, CONCEPT_NOTES, DOOR_SUMMARIES, DOORS_SECTION, EVENT_BAND, HERO, HERO_FIGURE, VISIT_LINE,
  eventBandLead, homeDoors, resolveLearningPath,
} from '../../site/src/content/home';
import type { ContentItem } from '../../site/src/content/schema';

const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const words = (value: string) => text(value).split(' ').filter(Boolean).length;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const item = (id: string, extra: Record<string, unknown>) =>
  ({ id, status: 'published', milestone: 2, title: `Title of ${id}`, ...extra }) as unknown as ContentItem;
const pathItems = [
  item('adoption-evaluate', { artifact_type: 'checklist', route_namespace: 'adoption', stable_slug: 'evaluate', title: 'Evaluate and adopt' }),
  item('module-2-baseline', { artifact_type: 'learning-module', stable_slug: 'baseline-single-node-pattern' }),
  item('module-0-orientation', { artifact_type: 'learning-module', stable_slug: 'tour', title: 'The five-minute tour' }),
  item('start-guide', { artifact_type: 'guidance-note', route_namespace: 'start', stable_slug: 'getting-started' }),
  item('module-3-compose-to-hpc-translation', { artifact_type: 'learning-module', stable_slug: 'compose-to-hpc-translation' }),
  item('module-1-scheduler-orchestrator', { artifact_type: 'learning-module', stable_slug: 'scheduler-as-orchestrator' }),
];
const allCopy = [
  HERO.kicker, HERO.title, HERO.ledeHtml, HERO.primary.label, HERO.secondary.label, HERO.quiet.lead, HERO.quiet.label,
  HERO_FIGURE.caption, ...HERO_FIGURE.services,
  HERO_FIGURE.laptop.title, HERO_FIGURE.laptop.command, ...HERO_FIGURE.laptop.facts,
  HERO_FIGURE.cluster.title, HERO_FIGURE.cluster.command, HERO_FIGURE.cluster.allocation, ...HERO_FIGURE.cluster.facts,
  BIG_IDEA.title, BIG_IDEA.proseHtml, BIG_IDEA.composeSide, BIG_IDEA.clusterSide,
  ...Object.values(CONCEPT_NOTES), DOORS_SECTION.title, ...Object.values(DOOR_SUMMARIES),
  EVENT_BAND.label, EVENT_BAND.linkText, VISIT_LINE.lead, VISIT_LINE.linkText,
].map(text);

describe('home hero', () => {
  it('pins the required hero routes and keeps every label non-empty', () => {
    expect(HERO.primary.href).toBe('#big-idea');
    expect(HERO.secondary.href).toBe('/guide/compose-to-hpc-translation/');
    expect(HERO.quiet.href).toBe('/adoption/evaluate/');
    for (const label of [HERO.kicker, HERO.title, HERO.primary.label, HERO.secondary.label, HERO.quiet.lead, HERO.quiet.label]) {
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });

  it('explains in the lede why Compose stops working and what replaces it', () => {
    expect(HERO.ledeHtml).toContain('<code>docker compose up</code>');
    const lede = text(HERO.ledeHtml);
    for (const idea of [/docker compose up/, /no Docker daemon/, /no root access \(administrator rights\)/, /scheduler/, /wait your turn/, /batch script/]) {
      expect(lede).toMatch(idea);
    }
    expect(lede).toContain('you request a scheduler allocation (a block of computer time on the cluster), wait your turn');
  });
});

describe('hero figure', () => {
  it('shows the batch script at its path in the workflow layout, as the crosswalk does', () => {
    expect(HERO_FIGURE.cluster.command).toBe('sbatch slurm/baseline.sbatch');
  });
});

describe('big idea', () => {
  it('puts plain language first and the term in parentheses for every concept', () => {
    const prose = text(BIG_IDEA.proseHtml);
    for (const concept of CONCEPTS) {
      const pattern = new RegExp(`${escapeRegExp(concept.plain)}\\s*\\((?:an? )?${escapeRegExp(concept.label.toLowerCase())}\\)`, 'i');
      expect(text(CONCEPT_NOTES[concept.key]), concept.key).toMatch(pattern);
    }
    expect(BIG_IDEA.proseHtml).toContain('href="/about/glossary/#allocation"');
    expect(prose).toMatch(/scheduler \(Slurm, at most centers\)/);
  });

  it('keeps the three qualifiers the old timeline and analogy carried', () => {
    expect(text(CONCEPT_NOTES.gate)).toContain('It does not establish that results are correct.');
    expect(text(CONCEPT_NOTES.scratch)).toContain('It may remain until your center clears it; copy out what you need before the job ends.');
    expect(text(CONCEPT_NOTES.net)).toContain('It is not an isolation boundary; access beyond the node requires center approval.');
  });

  it('opens each concept note with a capital and links it to its glossary anchor', () => {
    const anchors: Record<string, string> = { step: 'job-step', gate: 'readiness-gate', scratch: 'job-scoped-scratch', net: 'loopback' };
    for (const concept of CONCEPTS) {
      const anchor = anchors[concept.key];
      expect(REQUIRED_FRAGMENTS.glossary, `${concept.key} anchor`).toContain(anchor);
      expect(CONCEPT_NOTES[concept.key]).toContain(`href="/about/glossary/#${anchor}"`);
      expect(text(CONCEPT_NOTES[concept.key]), concept.key).toMatch(/^[A-Z]/);
    }
  });
});

describe('doors and learning path', () => {
  it('resolves LEARNING_PATH to titles and canonical URLs in learning order', () => {
    expect(LEARNING_PATH).toHaveLength(6);
    expect(resolveLearningPath(pathItems)).toEqual([
      { label: 'The five-minute tour', href: '/guide/tour/' },
      { label: 'Title of module-1-scheduler-orchestrator', href: '/guide/scheduler-as-orchestrator/' },
      { label: 'Title of start-guide', href: '/start/' },
      { label: 'Title of module-2-baseline', href: '/guide/baseline-single-node-pattern/' },
      { label: 'Title of module-3-compose-to-hpc-translation', href: '/guide/compose-to-hpc-translation/' },
      { label: 'Evaluate and adopt', href: '/adoption/evaluate/' },
    ]);
  });

  it('skips path entries that are missing or not published', () => {
    const partial = pathItems
      .filter(({ id }) => id !== 'adoption-evaluate')
      .map((entry) => (entry.id === 'module-3-compose-to-hpc-translation' ? ({ ...entry, status: 'draft' }) as ContentItem : entry));
    expect(resolveLearningPath(partial).map(({ href }) => href)).toEqual([
      '/guide/tour/', '/guide/scheduler-as-orchestrator/', '/start/', '/guide/baseline-single-node-pattern/',
    ]);
  });

  it('builds the three frozen doors with summaries, and the path only in door 1', () => {
    const doors = homeDoors(pathItems);
    expect(doors.map(({ id, href, linkText }) => [id, href, linkText])).toEqual(DOORS.map(({ id, href, linkText }) => [id, href, linkText]));
    expect(doors.map(({ summary }) => summary)).toEqual([DOOR_SUMMARIES.understand, DOOR_SUMMARIES.translate, DOOR_SUMMARIES.evaluate]);
    expect(doors[0].path).toEqual(resolveLearningPath(pathItems));
    expect(doors[1].path).toBeUndefined();
    expect(doors[2].path).toBeUndefined();
    expect(homeDoors([])[0].path).toBeUndefined();
    expect(DOORS_SECTION.title).toBe('Pick your path');
  });

  it('summarizes each door by purpose', () => {
    expect(DOOR_SUMMARIES.understand).toBe('The six steps from request to results, in detail, with a short annotated script you can read without a cluster account.');
    expect(DOOR_SUMMARIES.understand).toMatch(/six steps/);
    expect(DOOR_SUMMARIES.understand).toMatch(/without a cluster account/);
    expect(DOOR_SUMMARIES.translate).toMatch(/Compose file becomes on a cluster/);
    expect(DOOR_SUMMARIES.translate).toMatch(/your own services/);
    expect(DOOR_SUMMARIES.evaluate).toMatch(/assumes/);
    expect(DOOR_SUMMARIES.evaluate).toMatch(/your center already runs/);
  });
});

describe('event band and visit line', () => {
  it('words the featured talk so it stays true after the date', () => {
    expect(eventBandLead({ kind: 'talk', venue: "US-RSE'26", event_date: '2026-10-20', location: 'San Jose, CA' }))
      .toBe('Talk at US-RSE’26 (Tue Oct 20, San Jose)');
    expect(eventBandLead({ kind: 'poster', venue: 'SC26', event_date: '2026-11-17', location: 'Chicago, IL' }))
      .toBe('Poster at SC26 (Tue Nov 17, Chicago)');
    expect(eventBandLead({ kind: 'talk', venue: "US-RSE '26", event_date: '2026-10-20' }))
      .toBe('Talk at US-RSE’26 (Tue Oct 20)');
    expect(EVENT_BAND).toEqual({ label: 'Featured talk', linkText: 'talk and poster links', href: '/about/talks-and-papers/' });
    for (const value of [EVENT_BAND.label, EVENT_BAND.linkText]) expect(value).not.toMatch(/upcoming|coming|will|join|next|soon/i);
  });

  it('keeps one short visit line after the event band and no project records list', () => {
    expect(VISIT_LINE).toEqual({
      lead: 'Here from the SC26 poster or the US-RSE’26 talk?',
      linkText: 'Talk and poster links',
      href: '/about/talks-and-papers/',
    });
    expect(JSON.stringify(VISIT_LINE)).not.toMatch(/ParaTools|Department of Energy|National Science Foundation|Project records/);
    for (const gone of ['projectRecordLinks', 'PROJECT_RECORDS', 'releaseVersionFromId']) expect(gone in homeModule, gone).toBe(false);
  });
});

describe('home copy rules', () => {
  it('never says reservation, names no system, version or date, and uses no arrows', () => {
    for (const value of allCopy) {
      expect(value).not.toMatch(/reserv/i);
      expect(value).not.toMatch(/anvil|purdue|\b(?:slurm|apptainer)\s+v?\d|\d+\.\d+\.\d+-\d|\b20\d\d-\d\d-\d\d\b/i);
      expect(value).not.toMatch(/[→↗➔➜⟶»]/);
    }
  });

  it('stays near the ≈600-word home budget', () => {
    const prose = [
      HERO.ledeHtml, HERO_FIGURE.caption, BIG_IDEA.proseHtml,
      ...Object.values(CONCEPT_NOTES), ...Object.values(DOOR_SUMMARIES),
    ];
    expect(prose.reduce((total, value) => total + words(value), 0)).toBeLessThanOrEqual(600);
  });
});
