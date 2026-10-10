import { describe, expect, it } from 'vitest';
import { CONCEPTS, DOORS, LEARNING_PATH, REQUIRED_FRAGMENTS } from '../../site/src/content/contracts';
import {
  BIG_IDEA, CONCEPT_NOTES, DOOR_SUMMARIES, DOORS_SECTION, EVENT_BAND, HERO, HERO_FIGURE, PROJECT_RECORDS,
  eventBandLead, homeDoors, projectRecordLinks, resolveLearningPath,
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
  EVENT_BAND.label, EVENT_BAND.linkText, PROJECT_RECORDS.title, PROJECT_RECORDS.visitLead, PROJECT_RECORDS.visitLinkText,
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
    for (const idea of [/no Docker daemon/, /no root access \(administrator rights\)/, /scheduler/, /wait your turn/, /one (?:batch )?script starts each service/]) {
      expect(lede).toMatch(idea);
    }
  });
});

describe('big idea', () => {
  it('puts plain language first and the term in parentheses for every concept', () => {
    const prose = text(BIG_IDEA.proseHtml);
    for (const concept of CONCEPTS) {
      const pattern = new RegExp(`${escapeRegExp(concept.plain)}\\s*\\((?:an? )?${escapeRegExp(concept.label.toLowerCase())}\\)`, 'i');
      expect(text(CONCEPT_NOTES[concept.key]), concept.key).toMatch(pattern);
    }
    expect(prose).toMatch(/\(an allocation\)/);
    expect(prose).toMatch(/scheduler \(Slurm, at most centers\)/);
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
    expect(DOOR_SUMMARIES.understand).toMatch(/six steps/);
    expect(DOOR_SUMMARIES.understand).toMatch(/without a cluster account/);
    expect(DOOR_SUMMARIES.translate).toMatch(/Compose file becomes on a cluster/);
    expect(DOOR_SUMMARIES.translate).toMatch(/your own services/);
    expect(DOOR_SUMMARIES.evaluate).toMatch(/assumes/);
    expect(DOOR_SUMMARIES.evaluate).toMatch(/your center already runs/);
  });
});

describe('event band and project records', () => {
  it('words the featured talk so it stays true after the date', () => {
    expect(eventBandLead({ kind: 'talk', venue: "US-RSE'26", event_date: '2026-10-20', location: 'San Jose, CA' }))
      .toBe('Talk at US-RSE ’26 (Tue Oct 20, San Jose)');
    expect(eventBandLead({ kind: 'poster', venue: 'SC26', event_date: '2026-11-17', location: 'Chicago, IL' }))
      .toBe('Poster at SC26 (Tue Nov 17, Chicago)');
    expect(eventBandLead({ kind: 'talk', venue: "US-RSE '26", event_date: '2026-10-20' }))
      .toBe('Talk at US-RSE ’26 (Tue Oct 20)');
    expect(EVENT_BAND).toEqual({ label: 'Featured talk', linkText: 'talk and poster links', href: '/about/talks-and-papers/' });
    for (const value of [EVENT_BAND.label, EVENT_BAND.linkText]) expect(value).not.toMatch(/upcoming|coming|will|join|next|soon/i);
  });

  it('links the project records strip, taking the release notes link from the landing projection', () => {
    expect(projectRecordLinks({ id: 'release-v0-2-0', href: '/milestones/2/#release-v0-2-0' })).toEqual([
      { label: 'Bridging the Laptop-to-Cluster Gap: a 2026 Better Scientific Software Fellowship project', href: '/about/attribution/' },
      { label: 'Talks, posters & papers', href: '/about/talks-and-papers/' },
      { label: 'v0.2.0 release notes', href: '/milestones/2/#release-v0-2-0' },
      { label: 'Code Apache-2.0 · text CC BY 4.0', href: '/about/attribution/#licenses' },
    ]);
    expect(PROJECT_RECORDS).toEqual({
      title: 'Project records',
      visitLead: 'Here from the SC26 poster or the US-RSE ’26 talk?',
      visitLinkText: 'Talk and poster links',
      visitHref: '/about/talks-and-papers/',
    });
    expect(JSON.stringify([projectRecordLinks({ id: 'release-v0-2-0', href: '/milestones/2/#release-v0-2-0' }), PROJECT_RECORDS])).not.toMatch(/ParaTools|Department of Energy|National Science Foundation/);
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

  it('derives the release notes label from the same release item as the link', () => {
    const notes = (id: string, href: string) => projectRecordLinks({ id, href }).find(({ label }) => label.endsWith('release notes'));
    expect(notes('release-v0-1-0', '/milestones/1/#release-v0-1-0')).toEqual({ label: 'v0.1.0 release notes', href: '/milestones/1/#release-v0-1-0' });
    expect(notes('release-v0-2-0', '/milestones/2/#release-v0-2-0')).toEqual({ label: 'v0.2.0 release notes', href: '/milestones/2/#release-v0-2-0' });
    expect(() => projectRecordLinks({ id: 'release-latest', href: '/x/' })).toThrow(/release-latest/);
    expect(() => projectRecordLinks({ id: 'release-v0-2', href: '/x/' })).toThrow();
  });
});
