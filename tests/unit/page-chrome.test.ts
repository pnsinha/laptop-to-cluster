import { describe, expect, it } from 'vitest';
import { LEARNING_PATH, TALKS_LABEL } from '../../site/src/content/contracts';
import { projectLearningPathNavigation } from '../../site/src/content/projections';
import { moduleHeaderLine } from '../../site/src/content/wording';
import {
  ABOUT_NAV_ITEMS, ADOPTION_HEADER_LINE, DIAGRAMS_BY_ITEM, TIMELINE_BY_ITEM,
  isExternalHref, learningPathNavigation, pageHeaderLine, recordDateLine, slotNames, sortTalks, splitAtSlots, talkMeta,
} from '../../site/src/content/page-chrome';
import type { ContentItem, Talk } from '../../site/src/content/schema';

const item = (fields: Record<string, unknown>) => ({ status: 'published', milestone: 2, summary: 'Summary.', ...fields }) as unknown as ContentItem;
const path = [
  item({ id: 'module-0-orientation', stable_slug: 'tour', artifact_type: 'learning-module', module_number: 0, module_type: 'conceptual', estimated_minutes: 5, title: 'The five-minute tour' }),
  item({ id: 'module-1-scheduler-orchestrator', stable_slug: 'scheduler-as-orchestrator', artifact_type: 'learning-module', module_number: 1, module_type: 'conceptual', title: 'Scheduler as orchestrator' }),
  item({ id: 'start-guide', stable_slug: 'getting-started', route_namespace: 'start', artifact_type: 'guidance-note', title: 'Run the example' }),
  item({ id: 'module-2-baseline', stable_slug: 'baseline-single-node-pattern', artifact_type: 'learning-module', module_number: 2, module_type: 'runnable', estimated_minutes: 30, title: 'Baseline single-node pattern' }),
  item({ id: 'module-3-compose-to-hpc-translation', stable_slug: 'compose-to-hpc-translation', artifact_type: 'learning-module', module_number: 3, module_type: 'conceptual', estimated_minutes: 25, title: 'Translate a Compose file' }),
  item({ id: 'adoption-evaluate', stable_slug: 'evaluate', artifact_type: 'checklist', route_namespace: 'adoption', title: 'Evaluate and adopt' }),
];

describe('pageHeaderLine', () => {
  it('builds "Module n · type · about m min" for learning modules', () => {
    expect(pageHeaderLine(path[3])).toBe('Module 2 · Hands-on · about 30 min');
    expect(pageHeaderLine(path[4])).toBe('Module 3 · Reading · about 25 min');
    expect(pageHeaderLine(path[1])).toBe('Module 1 · Reading');
  });
  it('agrees with the shared wording helper (R10)', () => {
    expect(pageHeaderLine(path[3])).toBe(moduleHeaderLine({ module_number: 2, module_type: 'runnable', estimated_minutes: 30 }));
  });
  it('renders no line for a partial module record without a type or number', () => {
    expect(pageHeaderLine(item({ id: 'fixture', artifact_type: 'learning-module', title: 'Fixture module' }))).toBeUndefined();
  });
  it('labels the adoption page and leaves other pages without a line', () => {
    expect(pageHeaderLine(path[5])).toBe(ADOPTION_HEADER_LINE);
    expect(pageHeaderLine(item({ id: 'about-project', artifact_type: 'attribution', stable_slug: 'project', title: 'Project' }))).toBeUndefined();
  });
});

describe('slot markers', () => {
  const html = '<h2 id="a">A</h2>\n<!-- l2c:timeline -->\n<p>Text</p>\n<!-- a plain comment -->\n<!--l2c:diagram-single-node-architecture-->\n<p>End</p>';
  it('splits rendered Markdown at l2c markers only and keeps all other markup', () => {
    const segments = splitAtSlots(html);
    expect(segments.map((segment) => (segment.kind === 'slot' ? `slot:${segment.name}` : 'html'))).toEqual(['html', 'slot:timeline', 'html', 'slot:diagram-single-node-architecture', 'html']);
    expect(segments.filter((segment) => segment.kind === 'html').map((segment) => segment.html).join('')).toBe(html.replace('<!-- l2c:timeline -->', '').replace('<!--l2c:diagram-single-node-architecture-->', ''));
    expect(slotNames(html)).toEqual(['timeline', 'diagram-single-node-architecture']);
  });
  it('returns the whole string as one html segment when there is no marker', () => {
    expect(splitAtSlots('<p>x</p>')).toEqual([{ kind: 'html', html: '<p>x</p>' }]);
    expect(splitAtSlots('')).toEqual([]);
  });
});

describe('per-item placement tables', () => {
  it('shows the timeline unlit on the tour and Module 1 and with step 3 lit on Module 2 (D13)', () => {
    expect(TIMELINE_BY_ITEM['module-0-orientation']).toEqual({});
    expect(TIMELINE_BY_ITEM['module-1-scheduler-orchestrator']).toEqual({});
    expect(TIMELINE_BY_ITEM['module-2-baseline']).toEqual({ highlight: 3 });
    expect(Object.keys(TIMELINE_BY_ITEM)).toHaveLength(3);
  });
  it('keeps the existing diagrams as the fallback placement', () => {
    expect(DIAGRAMS_BY_ITEM['module-1-scheduler-orchestrator']).toEqual(['compose-to-hpc', 'readiness-sequence']);
    expect(DIAGRAMS_BY_ITEM['module-2-baseline']).toEqual(['single-node-architecture']);
  });
});

describe('About navigation', () => {
  it('gains the talks entry (TALKS_LABEL, R19) and keeps every route unique and trailing-slashed', () => {
    expect(ABOUT_NAV_ITEMS.map(({ label }) => label)).toContain(TALKS_LABEL);
    expect(ABOUT_NAV_ITEMS.find(({ label }) => label === TALKS_LABEL)?.href).toBe('/about/talks-and-papers/');
    expect(new Set(ABOUT_NAV_ITEMS.map(({ href }) => href)).size).toBe(ABOUT_NAV_ITEMS.length);
    for (const { href } of ABOUT_NAV_ITEMS) expect(href).toMatch(/^\/about\/[a-z-]+\/$/);
  });
});

describe('recordDateLine', () => {
  const dueDates = new Map([[2, '2026-12-15']]);
  it('shows the milestone due date, never the publication date', () => {
    const milestone = item({ id: 'milestone-2', artifact_type: 'milestone', stable_slug: 'two', milestone: 2, publication_date: '2026-09-01', title: 'Milestone 2' });
    expect(recordDateLine(milestone, dueDates)).toEqual({ label: 'Due', iso: '2026-12-15' });
  });
  it('omits the line when the milestone record has no due date', () => {
    const milestone = item({ id: 'milestone-3', artifact_type: 'milestone', stable_slug: 'three', milestone: 3, publication_date: '2026-09-01', title: 'Milestone 3' });
    expect(recordDateLine(milestone, dueDates)).toBeUndefined();
  });
  it('shows the release date for releases and nothing for other pages', () => {
    const release = item({ id: 'release-v0-2-0', artifact_type: 'release', stable_slug: 'v0-2-0', publication_date: '2026-10-15', title: 'Release v0.2.0' });
    expect(recordDateLine(release, dueDates)).toEqual({ label: 'Released', iso: '2026-10-15' });
    expect(recordDateLine(path[0], dueDates)).toBeUndefined();
  });
});

describe('learningPathNavigation', () => {
  it('follows LEARNING_PATH order across modules, the start guide and the adoption page', () => {
    expect(LEARNING_PATH).toEqual(['module-0-orientation', 'module-1-scheduler-orchestrator', 'start-guide', 'module-2-baseline', 'module-3-compose-to-hpc-translation', 'adoption-evaluate']);
    expect(learningPathNavigation(path, 'module-0-orientation')).toEqual({
      previous: undefined,
      next: { id: 'module-1-scheduler-orchestrator', title: 'Scheduler as orchestrator', url: '/guide/scheduler-as-orchestrator/' },
    });
    expect(learningPathNavigation(path, 'module-2-baseline')).toEqual({
      previous: { id: 'start-guide', title: 'Run the example', url: '/start/' },
      next: { id: 'module-3-compose-to-hpc-translation', title: 'Translate a Compose file', url: '/guide/compose-to-hpc-translation/' },
    });
    expect(learningPathNavigation(path, 'adoption-evaluate')?.next).toBeUndefined();
    expect(learningPathNavigation(path, 'adoption-evaluate')?.previous?.url).toBe('/guide/compose-to-hpc-translation/');
  });
  it('agrees with projectLearningPathNavigation for every path item (R10 parity)', () => {
    const shared = projectLearningPathNavigation(path);
    for (const id of LEARNING_PATH) expect(learningPathNavigation(path, id)).toEqual(shared[id]);
  });
  it('skips unpublished items and returns undefined for an id outside the path', () => {
    const withDraft = path.map((entry) => (entry.id === 'start-guide' ? ({ ...entry, status: 'draft' } as ContentItem) : entry));
    expect(learningPathNavigation(withDraft, 'module-2-baseline')?.previous?.id).toBe('module-1-scheduler-orchestrator');
    expect(learningPathNavigation(path, 'module-9-unknown')).toBeUndefined();
  });
});

describe('talks helpers', () => {
  const talks = [
    { id: 'b', kind: 'poster', title: 'B', venue: 'Venue B', event_date: '2026-08-05', links: [] },
    { id: 'a', kind: 'talk', title: 'A', venue: "US-RSE’26", event_date: '2026-10-20', links: [] },
    { id: 'c', kind: 'poster', title: 'C', venue: 'Venue C', event_date: '2026-11-17', links: [] },
  ] as unknown as Talk[];
  it('sorts newest first without mutating the input', () => {
    expect(sortTalks(talks).map(({ id }) => id)).toEqual(['c', 'a', 'b']);
    expect(talks.map(({ id }) => id)).toEqual(['b', 'a', 'c']);
  });
  it('formats venue and long date for the meta line', () => {
    expect(talkMeta(talks[1])).toBe("US-RSE’26 · October 20, 2026");
  });
  it('tells external links from site paths', () => {
    expect(isExternalHref('https://us-rse.org/usrse26/program/')).toBe(true);
    expect(isExternalHref('/events/iguide-forum-2026/')).toBe(false);
  });
});
