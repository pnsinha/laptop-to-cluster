import { describe, expect, it } from 'vitest';
import { CONCEPTS, DOORS, LEARNING_PATH, TIMELINE_STEPS } from '../../site/src/content/contracts';
import {
  ANALOGY, BIG_IDEA, DOOR_SUMMARIES, DOORS_SECTION, EVENT_BAND, HERO, HOME_TITLE, PROJECT_RECORDS, TIMELINE_CAPTIONS,
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
  BIG_IDEA.title, BIG_IDEA.proseHtml, ANALOGY.title, ANALOGY.bodyHtml, ANALOGY.breaksTitle,
  ...ANALOGY.breaks.flatMap(({ lead, text: body }) => [lead, body]),
  ...Object.values(TIMELINE_CAPTIONS), DOORS_SECTION.title, ...Object.values(DOOR_SUMMARIES),
  EVENT_BAND.label, EVENT_BAND.linkText, PROJECT_RECORDS.title, PROJECT_RECORDS.visitLead, PROJECT_RECORDS.visitLinkText,
].map(text);

describe('home hero', () => {
  it('pins the required hero labels and routes', () => {
    expect(HOME_TITLE).toBe('Bridging the Laptop-to-Cluster Gap');
    expect(HERO.kicker).toBe('A free, open-source learning guide for Docker Compose users');
    expect(HERO.title).toBe('Your Compose stack, on a shared cluster');
    expect(HERO.primary).toEqual({ label: 'Start with the big idea', href: '#big-idea' });
    expect(HERO.secondary).toEqual({ label: 'Already have a Compose file? Translate it', href: '/guide/compose-to-hpc-translation/' });
    expect(HERO.quiet.href).toBe('/adoption/evaluate/');
    expect(`${HERO.quiet.lead} ${HERO.quiet.label}`).toBe('Support researchers or run a cluster? See what this assumes, and when not to use it');
  });

  it('explains in the lede why Compose stops working and what replaces it', () => {
    expect(HERO.ledeHtml).toContain('<code>docker compose up</code>');
    const lede = text(HERO.ledeHtml);
    for (const idea of [/no Docker daemon/, /no root access \(administrator rights\)/, /scheduler/, /wait your turn/, /one script starts each service/]) {
      expect(lede).toMatch(idea);
    }
  });
});

describe('big idea and analogy', () => {
  it('puts plain language first and the term in parentheses for every concept', () => {
    const prose = text(BIG_IDEA.proseHtml);
    for (const concept of CONCEPTS) {
      const pattern = new RegExp(`${escapeRegExp(concept.plain)}\\s*\\((?:an? )?${escapeRegExp(concept.label.toLowerCase())}\\)`, 'i');
      expect(prose, concept.key).toMatch(pattern);
    }
    expect(prose).toMatch(/\(an allocation\)/);
    expect(prose).toMatch(/scheduler \(Slurm, at most centers\)/);
  });

  it('marks each concept term with its concept class and its glossary anchor', () => {
    for (const [key, anchor] of [['step', 'job-step'], ['gate', 'readiness-gate'], ['scratch', 'job-scoped-scratch'], ['net', 'loopback']]) {
      expect(BIG_IDEA.proseHtml).toContain(`<a class="c-${key}" href="/about/glossary/#${anchor}">`);
    }
    expect(BIG_IDEA.proseHtml).toContain('<a href="/about/glossary/#allocation">allocation</a>');
  });

  it('keeps the frozen vocabulary for loopback and access beyond the node', () => {
    const prose = text(BIG_IDEA.proseHtml);
    expect(prose).toMatch(/\(loopback\), which services use by default/);
    expect(prose).toMatch(/beyond its node needs access your center approves/);
  });

  it('tells the analogy in the order the script runs and keeps gate and verification apart', () => {
    expect(ANALOGY.title).toBe('A cluster is a shared building, not another laptop');
    const story = text(ANALOGY.bodyHtml);
    const at = (pattern: RegExp) => story.search(pattern);
    for (const pattern of [/booking desk/, /\(an allocation/, /wait until one is free/, /coordinator/, /workers in only after/, /\(the readiness gate\)/, /\(verification\)/, /finishes, or your time runs out/]) {
      expect(at(pattern), String(pattern)).toBeGreaterThanOrEqual(0);
    }
    expect(at(/coordinator/)).toBeLessThan(at(/workers/));
    expect(at(/readiness gate/)).toBeLessThan(at(/verification/));
    expect(story).toMatch(/never proved that/);
  });

  it('lists where the analogy breaks: queue, shared node, center-approved access, copy out', () => {
    expect(ANALOGY.breaksTitle).toBe('Where the analogy breaks');
    const breaks = ANALOGY.breaks.map(({ lead, text: body }) => `${lead} ${body}`);
    expect(breaks).toHaveLength(4);
    expect(breaks[0]).toMatch(/queue/i);
    expect(breaks[0]).toMatch(/waiting/);
    expect(breaks[1]).toMatch(/share the node/);
    expect(breaks[1]).toMatch(/\(loopback\)/);
    expect(breaks[2]).toMatch(/outside the node/);
    expect(breaks[2]).toMatch(/center approves/);
    expect(breaks[3]).toMatch(/Copy out/);
    expect(breaks[3]).toMatch(/depends on your center/);
  });
});

describe('timeline captions', () => {
  it('provides one caption per frozen step', () => {
    expect(Object.keys(TIMELINE_CAPTIONS).map(Number)).toEqual(TIMELINE_STEPS.map(({ n }) => n));
    for (const step of TIMELINE_STEPS) expect(TIMELINE_CAPTIONS[step.n].length, step.label).toBeGreaterThan(20);
  });

  it('matches what baseline.sbatch does at each step', () => {
    expect(TIMELINE_CAPTIONS[1]).toMatch(/private/);
    expect(TIMELINE_CAPTIONS[1]).toMatch(/\(job-scoped scratch\)/);
    expect(TIMELINE_CAPTIONS[2]).toMatch(/coordinator/);
    expect(TIMELINE_CAPTIONS[2]).toMatch(/\(a job step\)/);
    expect(TIMELINE_CAPTIONS[2]).toMatch(/\(loopback\)/);
    expect(TIMELINE_CAPTIONS[3]).toMatch(/^Proves the coordinator can serve/);
    expect(TIMELINE_CAPTIONS[3]).toMatch(/before any worker starts/);
    // READINESS_TIMEOUT is configurable (1..300), so the caption names a time limit, not a fixed 30 s.
    expect(TIMELINE_CAPTIONS[3]).toMatch(/time limit \(30 seconds by default\)/);
    expect(TIMELINE_CAPTIONS[3]).not.toMatch(/within 30 seconds/);
    expect(TIMELINE_CAPTIONS[4]).toMatch(/^Only now/);
    expect(TIMELINE_CAPTIONS[4]).toMatch(/waits for every worker/);
    expect(TIMELINE_CAPTIONS[5]).toMatch(/coordinator still running/);
    expect(TIMELINE_CAPTIONS[5]).toMatch(/only a full pass/);
    expect(TIMELINE_CAPTIONS[6]).toMatch(/set up at the start \(an EXIT trap\)/);
    // An untrappable kill bypasses the trap, and that path is Designed, not run, so no caption promises "however it ends".
    expect(TIMELINE_CAPTIONS[6]).toMatch(/when the script exits/);
    expect(TIMELINE_CAPTIONS[6]).not.toMatch(/however|no matter|always|every time/i);
    expect(Object.values(TIMELINE_CAPTIONS).filter((caption) => /\bworkers start\b/.test(caption))).toEqual([TIMELINE_CAPTIONS[4]]);
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
      HERO.ledeHtml, BIG_IDEA.proseHtml, ANALOGY.bodyHtml,
      ...ANALOGY.breaks.flatMap(({ lead, text: body }) => [lead, body]),
      ...Object.values(TIMELINE_CAPTIONS), ...Object.values(DOOR_SUMMARIES),
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
