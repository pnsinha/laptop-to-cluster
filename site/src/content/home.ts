import { DOORS, type ConceptKey, type Door, type DoorId } from './contracts';
import { projectLearningPath } from './projections';
import type { ContentItem, Talk } from './schema';
import { ATTRIBUTION } from './wording';

/* All home page copy. Fields ending in "Html" are trusted, hand-authored markup
   rendered with set:html. They carry only <code>, <p> and glossary links; the
   concept colour and shape come from ConceptMap.astro via CONCEPTS. No tested
   claim lives here: tested claims come from the applicability record through
   the projection. */

export const HOME_TITLE = 'Bridging the Laptop-to-Cluster Gap';
export const HOME_DESCRIPTION = 'Translate a multi-service Docker Compose stack to a scheduler-managed HPC allocation with Slurm and Apptainer.';

const doorHref = (id: DoorId): string => DOORS.find((door) => door.id === id)!.href;

/* The hero: what this is and who it is for (the kicker), the reader's situation (the title),
   the problem and the promise (two sentences), one filled action and one plain link. */
export const HERO = {
  kicker: 'A free, open-source learning guide for Docker Compose users',
  title: 'Your Compose stack, on a shared cluster',
  ledeHtml: 'A shared research cluster has no Docker daemon and gives you no root access, so <code>docker compose up</code> cannot run there. This guide shows how to start the same services inside one scheduler allocation, with a batch-script pattern that has been run on a real cluster.',
  primary: { label: 'Take the five-minute tour', href: doorHref('understand') },
  secondary: { label: 'Already have a Compose file? Translate it', href: doorHref('translate') },
} as const;

/** The hero tagline as Starlight renders it: the kicker line, then the lede. */
export function heroTaglineHtml(): string {
  return `<p class="kicker">${HERO.kicker}</p><p>${HERO.ledeHtml}</p>`;
}

/** The one line of site facts under the evidence badge. Free text; the tested claim stays in the badge. */
export function siteFacts(release: string): string {
  return `Release ${release} · A 2026 BSSw Fellowship project · Free to read, open source`;
}

export const BIG_IDEA = {
  title: 'The big idea',
  proseHtml: 'A scheduler (Slurm, at most centers) decides where and when your stack runs. Inside one <a href="/about/glossary/#allocation">allocation</a>, four familiar Compose ideas change meaning.',
  composeSide: 'In Compose',
  clusterSide: 'On a cluster',
} as const;

/* The hero figure: two execution environments, not a startup sequence. Plain HTML, no concept colours. */
export const HERO_FIGURE = {
  caption: 'The same three programs in two environments. On your laptop, Docker starts them on demand. On a cluster, a scheduler grants one allocation and your batch script starts them inside it. Shown here: the single-node baseline, one job on one node.',
  services: ['coordinator', 'worker', 'worker'],
  laptop: { title: 'Your laptop', command: 'docker compose up', facts: ['Docker daemon, root access', 'Starts whenever you ask', 'Ports published to your machine'] },
  cluster: { title: 'A shared cluster', command: 'sbatch slurm/baseline.sbatch', allocation: 'One allocation: one node, a fixed time', facts: ['No Docker daemon, no root access', 'A scheduler decides when you run', 'Local-only access inside the node'] },
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
  understand: 'The six steps from request to results, in detail, with a short annotated script you can read without a cluster account.',
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

/* The crosswalk's code panes sit behind one disclosure; the legend stays visible. */
export const CROSSWALK_DISCLOSURE = { summary: 'Show the Compose file beside the batch script' } as const;

/* The closing block: the two most common next steps, once more, at the end of the page. */
export const CLOSING = {
  title: 'Ready to start?',
  lead: 'Most readers begin with the tour. If you already have a Compose file, go straight to the translation guide.',
  primary: { label: 'Take the five-minute tour', href: doorHref('understand') },
  secondary: { label: 'Translate your Compose file', href: doorHref('translate') },
} as const;

/* Who made this, in one sentence, before the footer. The full attribution lives on its own page. */
export const CREDIT = {
  text: `Written by ${ATTRIBUTION.author}, ${ATTRIBUTION.affiliation}, as a 2026 BSSw Fellow in an individual capacity.`,
  link: { label: 'About the project', href: '/about/project/' },
} as const;

/* The band names each event and its date, never "upcoming", so the static page
   stays true after the date. */
export const EVENT_BAND = { label: 'Presented at', linkText: 'Talks and posters', href: '/about/talks-and-papers/' } as const;

const KIND_LABEL: Record<Talk['kind'], string> = { talk: 'Talk', poster: 'Poster', paper: 'Paper' };

/** "Talk at US-RSE’26 (Tue Oct 20, San Jose)", built from one talks.yml entry. */
export function eventBandLead(talk: Pick<Talk, 'kind' | 'venue' | 'event_date' | 'location'>): string {
  const date = new Date(`${talk.event_date}T00:00:00Z`);
  const part = (options: Intl.DateTimeFormatOptions) => date.toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
  const day = `${part({ weekday: 'short' })} ${part({ month: 'short' })} ${date.getUTCDate()}`;
  const venue = talk.venue.replace(/\s?['’](\d{2})\b/, '’$1');
  const city = talk.location?.split(',')[0]?.trim();
  return `${KIND_LABEL[talk.kind]} at ${venue} (${day}${city ? `, ${city}` : ''})`;
}

/** "Presented at I-GUIDE Forum 2026 (Aug 5), US-RSE’26 (Oct 20, San Jose) and SC26 (Nov 17, Chicago)", from every talk and poster in date order. */
export function presentedAtLead(talks: readonly Pick<Talk, 'kind' | 'venue' | 'event_date' | 'location'>[]): string {
  const events = [...talks].filter(({ kind }) => kind !== 'paper').sort((a, b) => a.event_date.localeCompare(b.event_date)).map((talk) => {
    const date = new Date(`${talk.event_date}T00:00:00Z`);
    const day = `${date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })} ${date.getUTCDate()}`;
    const venue = talk.venue.replace(/\s?['’](\d{2})\b/, '’$1');
    const city = talk.location?.split(',')[0]?.trim();
    return `${venue} (${day}${city ? `, ${city}` : ''})`;
  });
  if (events.length === 0) return '';
  const list = events.length === 1 ? events[0] : `${events.slice(0, -1).join(', ')} and ${events.at(-1)}`;
  return `${EVENT_BAND.label} ${list}`;
}
