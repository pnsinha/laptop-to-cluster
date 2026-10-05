import { TALKS_LABEL, type StepNumber } from './contracts';
import { formatDate } from './format';
import { projectLearningPathNavigation, type ModuleNavigation } from './projections';
import type { ContentItem, Talk } from './schema';
import { moduleHeaderLine, MODULE_TYPE_LABELS, type ModuleTypeLabelKey } from './wording';

/* Small pure helpers shared by the page templates (LearningModuleLayout,
   [namespace]/[slug].astro, ModulePager, TalksList). Nothing here renders. */

export const ADOPTION_HEADER_LINE = 'Adoption guide';

/** "Module 2 · Hands-on · about 30 min" for modules, "Adoption guide" for the adoption page. */
export function pageHeaderLine(item: ContentItem): string | undefined {
  if (item.artifact_type === 'learning-module') {
    const moduleType = item.module_type as ModuleTypeLabelKey;
    if (typeof item.module_number !== 'number' || !(moduleType in MODULE_TYPE_LABELS)) return undefined; // partial fixtures render no line
    return moduleHeaderLine({ module_number: item.module_number, module_type: moduleType, estimated_minutes: item.estimated_minutes });
  }
  if (item.artifact_type === 'checklist' && item.route_namespace === 'adoption') return ADOPTION_HEADER_LINE;
  return undefined;
}

/* Slot markers. Markdown cannot instantiate a component, so an author writes
   <!-- l2c:timeline --> on its own line, and the template swaps in the component
   there. A marker name is lower-case kebab-case and appears at most once per page. */
export type BodySegment = { kind: 'html'; html: string } | { kind: 'slot'; name: string };
const SLOT_PATTERN = /<!--\s*l2c:([a-z0-9]+(?:-[a-z0-9]+)*)\s*-->/g;

export function splitAtSlots(html: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let last = 0;
  for (const match of html.matchAll(SLOT_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ kind: 'html', html: html.slice(last, index) });
    segments.push({ kind: 'slot', name: match[1] });
    last = index + match[0].length;
  }
  if (last < html.length) segments.push({ kind: 'html', html: html.slice(last) });
  return segments;
}

export function slotNames(html: string): string[] {
  return splitAtSlots(html).flatMap((segment) => (segment.kind === 'slot' ? [segment.name] : []));
}

/* D13: the six-step timeline appears on the tour, Module 1 (both unlit) and Module 2 (step 3 lit), nowhere else. */
export const TIMELINE_BY_ITEM: Readonly<Record<string, { highlight?: StepNumber }>> = {
  'module-0-orientation': {},
  'module-1-scheduler-orchestrator': {},
  'module-2-baseline': { highlight: 3 },
};

/* Fallback placement (after the article) for diagrams whose <!-- l2c:diagram-NAME --> marker is absent. */
export const DIAGRAMS_BY_ITEM: Readonly<Record<string, readonly string[]>> = {
  'module-1-scheduler-orchestrator': ['compose-to-hpc', 'readiness-sequence'],
  'module-2-baseline': ['single-node-architecture'],
};

export const ABOUT_NAV_ITEMS = [
  { label: 'Project', href: '/about/project/' },
  { label: TALKS_LABEL, href: '/about/talks-and-papers/' },
  { label: 'Attribution and licenses', href: '/about/attribution/' },
  { label: 'Accessibility', href: '/about/accessibility/' },
  { label: 'Support', href: '/about/support/' },
  { label: 'Glossary', href: '/about/glossary/' },
] as const;

/** Milestones show their due date (from the milestone record), releases their release date. */
export function recordDateLine(
  item: ContentItem,
  dueDates: ReadonlyMap<number, string>,
): { label: 'Due' | 'Released'; iso: string } | undefined {
  if (item.artifact_type === 'milestone') {
    const iso = dueDates.get(item.milestone);
    return iso ? { label: 'Due', iso } : undefined;
  }
  if (item.artifact_type === 'release' && item.publication_date) return { label: 'Released', iso: item.publication_date };
  return undefined;
}

/** Thin wrapper (R10). Previous and next published page along LEARNING_PATH (D16); undefined when the page is not on the path. */
export function learningPathNavigation(items: readonly ContentItem[], id: string): ModuleNavigation | undefined {
  return projectLearningPathNavigation([...items])[id]; // R10: W2's projection is the single source
}

export const TALK_KIND_LABELS: Record<Talk['kind'], string> = { talk: 'Talk', poster: 'Poster', paper: 'Paper' };

export function sortTalks(talks: readonly Talk[]): Talk[] {
  return [...talks].sort((a, b) => b.event_date.localeCompare(a.event_date) || a.id.localeCompare(b.id));
}

export function talkMeta(talk: Pick<Talk, 'venue' | 'event_date'>): string {
  return `${talk.venue} · ${formatDate(talk.event_date)}`;
}

export const isExternalHref = (href: string): boolean => /^https?:\/\//.test(href);
