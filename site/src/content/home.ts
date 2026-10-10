import { DOORS, type ConceptKey, type Door, type DoorId } from './contracts';
import { projectLearningPath } from './projections';
import type { ContentItem, Talk } from './schema';

/* All home page copy. Fields ending in "Html" are trusted, hand-authored markup
   rendered with set:html. They carry only <code> and glossary links; the
   concept colour and shape come from ConceptMap.astro via CONCEPTS. No tested
   claim lives here: tested claims come from the applicability record through
   the projection. */

export const HOME_TITLE = 'Bridging the Laptop-to-Cluster Gap';
export const HOME_DESCRIPTION = 'Translate a multi-service Docker Compose stack to a scheduler-managed HPC allocation with Slurm and Apptainer.';

const doorHref = (id: DoorId): string => DOORS.find((door) => door.id === id)!.href;

export const HERO = {
  kicker: 'A free, open-source learning guide for Docker Compose users',
  title: 'Your Compose stack, on a shared cluster',
  ledeHtml: 'On your laptop, <code>docker compose up</code> starts every service whenever you ask. A shared research cluster runs no Docker daemon and gives you no root access (administrator rights), so that command won’t work there. Instead, you ask a scheduler for an allocation, wait your turn, and one batch script starts each service inside it. This guide translates one into the other, one idea at a time.',
  primary: { label: 'Start with the big idea', href: '#big-idea' },
  secondary: { label: 'Already have a Compose file? Translate it', href: doorHref('translate') },
  quiet: { lead: 'Support researchers or run a cluster?', label: 'See what this assumes, and when not to use it', href: doorHref('evaluate') },
} as const;

export const BIG_IDEA = {
  title: 'The big idea',
  proseHtml: 'On a shared cluster, a scheduler (Slurm, at most centers) decides what runs, where and for how long; Docker doesn’t. You ask it for a fixed share of one machine for a fixed time (an <a href="/about/glossary/#allocation">allocation</a>), and one batch script then does inside it what Compose did on your laptop. Four ideas change meaning along the way.',
  composeSide: 'In Compose',
  clusterSide: 'On a cluster',
} as const;

/* The hero figure: two execution environments, not a startup sequence. Plain HTML, no concept colours. */
export const HERO_FIGURE = {
  caption: 'The same three programs in two environments. On your laptop, Docker starts them on demand. On a cluster, a scheduler grants one allocation and your batch script starts them inside it.',
  services: ['coordinator', 'worker', 'worker'],
  laptop: { title: 'Your laptop', command: 'docker compose up', facts: ['Docker daemon, root access', 'Starts whenever you ask', 'Ports published to your machine'] },
  cluster: { title: 'A shared cluster', command: 'sbatch baseline.sbatch', allocation: 'One allocation: one node, a fixed time', facts: ['No Docker daemon, no root access', 'A scheduler decides when you run', 'Local-only access inside the node'] },
} as const;

/* One note per concept. Each starts with CONCEPTS.plain verbatim and puts the term in parentheses (a unit test checks this), then carries the qualifier the old timeline and analogy used to carry. */
export const CONCEPT_NOTES: Record<ConceptKey, string> = {
  step: 'A program the scheduler launches and tracks inside your allocation (a <a href="/about/glossary/#job-step">job step</a>).',
  gate: 'A check that the coordinator can really serve before any worker starts (a <a href="/about/glossary/#readiness-gate">readiness gate</a>). It does not establish that results are correct.',
  scratch: 'Temporary job storage (<a href="/about/glossary/#job-scoped-scratch">job-scoped scratch</a>). It may remain until your center clears it; copy out what you need before the job ends.',
  net: 'Local-only access (<a href="/about/glossary/#loopback">loopback</a>). It is not an isolation boundary; access beyond the node requires center approval.',
};

export const DOORS_SECTION = { title: 'Pick your path' } as const;

export const DOOR_SUMMARIES: Record<DoorId, string> = {
  understand: 'Each of the six steps in detail, with a short annotated script you can read without a cluster account.',
  translate: 'See what each part of your Compose file becomes on a cluster, then edit the example job to run your own services.',
  evaluate: 'What the pattern assumes, where it was tested, and when a service your center already runs is the better choice.',
};

export interface PathStep { label: string; href: string }
export type HomeDoor = Door & { summary: string; path?: PathStep[] };

/** LEARNING_PATH resolved to titles and canonical URLs, in learning order. A thin wrapper over W2's projectLearningPath (R10). */
export function resolveLearningPath(items: readonly ContentItem[]): PathStep[] {
  return projectLearningPath([...items]).map(({ title, url }) => ({ label: title, href: url }));
}

/** The three frozen doors with their summaries; door 1 also carries the learning path. */
export function homeDoors(items: readonly ContentItem[]): HomeDoor[] {
  const path = resolveLearningPath(items);
  return DOORS.map((door) => (door.id === 'understand' && path.length > 0
    ? { ...door, summary: DOOR_SUMMARIES[door.id], path }
    : { ...door, summary: DOOR_SUMMARIES[door.id] }));
}

/* The band names the event and its date, never "upcoming", so the static page
   stays true after the date. */
export const EVENT_BAND = { label: 'Featured talk', linkText: 'talk and poster links', href: '/about/talks-and-papers/' } as const;

const KIND_LABEL: Record<Talk['kind'], string> = { talk: 'Talk', poster: 'Poster', paper: 'Paper' };

/** "Talk at US-RSE ’26 (Tue Oct 20, San Jose)", built from the featured talks.yml entry. */
export function eventBandLead(talk: Pick<Talk, 'kind' | 'venue' | 'event_date' | 'location'>): string {
  const date = new Date(`${talk.event_date}T00:00:00Z`);
  const part = (options: Intl.DateTimeFormatOptions) => date.toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
  const day = `${part({ weekday: 'short' })} ${part({ month: 'short' })} ${date.getUTCDate()}`;
  const venue = talk.venue.replace(/\s?['’](\d{2})\b/, ' ’$1');
  const city = talk.location?.split(',')[0]?.trim();
  return `${KIND_LABEL[talk.kind]} at ${venue} (${day}${city ? `, ${city}` : ''})`;
}

export const PROJECT_RECORDS = {
  title: 'Project records',
  visitLead: 'Here from the SC26 poster or the US-RSE ’26 talk?',
  visitLinkText: 'Talk and poster links',
  visitHref: '/about/talks-and-papers/',
} as const;

/** Version label for a release item id such as `release-v0-2-0`. Throws on any other shape so label and link cannot drift apart. */
export function releaseVersionFromId(id: string): string {
  const match = /^release-v(\d+)-(\d+)-(\d+)$/.exec(id);
  if (!match) throw new Error(`releaseVersionFromId: expected release-vX-Y-Z, got "${id}"`);
  return `v${match[1]}.${match[2]}.${match[3]}`;
}

/** Credibility strip links. The release notes label and link both come from one release item (landing.release: id and href) at build time. The footer's version comes from currentReleaseVersion() instead. */
export function projectRecordLinks(release: { id: string; href: string }): PathStep[] {
  return [
    { label: `${HOME_TITLE}: a 2026 Better Scientific Software Fellowship project`, href: '/about/attribution/' },
    { label: 'Talks, posters & papers', href: '/about/talks-and-papers/' },
    { label: `${releaseVersionFromId(release.id)} release notes`, href: release.href },
    { label: 'Code Apache-2.0 · text CC BY 4.0', href: '/about/attribution/#licenses' },
  ];
}
