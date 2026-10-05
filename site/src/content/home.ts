import { DOORS, type Door, type DoorId, type StepNumber } from './contracts';
import { projectLearningPath } from './projections';
import type { ContentItem, Talk } from './schema';

/* All home page copy. Fields ending in "Html" are trusted, hand-authored markup
   rendered with set:html. They carry only <code>, <strong>, glossary links and
   the concept classes c-step, c-gate, c-scratch and c-net. No tested claim
   lives here: tested claims come from the applicability record through the
   projection. */

export const HOME_TITLE = 'Bridging the Laptop-to-Cluster Gap';
export const HOME_DESCRIPTION = 'Translate a multi-service Docker Compose stack to a scheduler-managed HPC allocation with Slurm and Apptainer.';

const doorHref = (id: DoorId): string => DOORS.find((door) => door.id === id)!.href;

export const HERO = {
  kicker: 'A free, open-source learning guide for Docker Compose users',
  title: 'Your Compose stack, on a shared cluster',
  ledeHtml: 'On your laptop, <code>docker compose up</code> starts every service whenever you ask. A shared research cluster runs no Docker daemon and gives you no root access (administrator rights), so that command won’t work there. Instead, you ask a scheduler for a block of computer time, wait your turn, and then one script starts each service inside that block. This guide shows how to translate one into the other, one idea at a time.',
  primary: { label: 'Start with the big idea', href: '#big-idea' },
  secondary: { label: 'Already have a Compose file? Translate it', href: doorHref('translate') },
  quiet: { lead: 'Support researchers or run a cluster?', label: 'See what this assumes, and when not to use it', href: doorHref('evaluate') },
} as const;

export const BIG_IDEA = {
  title: 'The big idea',
  proseHtml: 'On a shared cluster, a scheduler (Slurm, at most centers) decides what runs, where and for how long; Docker doesn’t. You ask it for a fixed share of one machine for a fixed time (an <a href="/about/glossary/#allocation">allocation</a>), and one batch script then does inside it what Compose did on your laptop. Four ideas change meaning along the way. A service becomes a program the scheduler launches and tracks inside your allocation (a <a class="c-step" href="/about/glossary/#job-step">job step</a>). <code>depends_on</code> becomes a check that the coordinator can really serve before any worker starts (a <a class="c-gate" href="/about/glossary/#readiness-gate">readiness gate</a>). A named volume becomes temporary job storage (<a class="c-scratch" href="/about/glossary/#job-scoped-scratch">job-scoped scratch</a>). A published port becomes local-only access (<a class="c-net" href="/about/glossary/#loopback">loopback</a>), which services use by default; reaching a service from beyond its node needs access your center approves.',
} as const;

export const ANALOGY = {
  title: 'A cluster is a shared building, not another laptop',
  bodyHtml: 'The scheduler is the booking desk. You ask for a room (an <strong>allocation</strong>: set CPUs, memory and hours) and wait until one is free. Once you’re in, your script (the <strong>job</strong>) starts the services itself. A <strong>coordinator</strong>, which hands out tasks, opens first. The script lets <strong>workers</strong> in only after the coordinator hangs its “we’re open” sign (the <strong>readiness gate</strong>). Before you leave, you check that the work is right (<strong>verification</strong>); the sign being up never proved that. When your script finishes, or your time runs out, everyone is sent out (clean up).',
  breaksTitle: 'Where the analogy breaks',
  breaks: [
    { lead: 'You usually queue.', text: 'A cluster may keep your job waiting until a room is free.' },
    { lead: 'Other people’s jobs may share the node.', text: 'Local-only access (loopback) keeps your services off the network; it is not a lock.' },
    { lead: 'There is no front door.', text: 'Nothing outside the node reaches your services without access your center approves.' },
    { lead: 'Copy out what you want to keep.', text: 'Cleanup stops your services but does not empty the room; when temporary job storage is cleared depends on your center.' },
  ],
} as const;

/* One caption per frozen step, matching slurm/baseline.sbatch at v0.1.0:
   workers run in step 4 only; the coordinator runs from step 2 through verify;
   job scratch spans the run; cleanup is the EXIT trap set at the start. Claims stay
   inside what the script does: the time limit is READINESS_TIMEOUT (default 30,
   range 1..300, baseline.sbatch:22,135), and an untrappable SIGKILL or a wall-time
   kill bypasses the trap (the KILL path is Designed, not run), so no caption says
   "however the job ends" or a fixed number of seconds. */
export const TIMELINE_CAPTIONS: Record<StepNumber, string> = {
  1: 'The scheduler grants one node for a set time. The script checks its inputs and makes a private job folder (job-scoped scratch).',
  2: 'The coordinator starts as its own tracked program (a job step), on local-only access (loopback), and writes its address to a file.',
  3: 'Proves the coordinator can serve: the exact expected answer within the time limit (30 seconds by default), or the job stops before any worker starts.',
  4: 'Only now do workers start, each as a job step. The script waits for every worker to finish.',
  5: 'With the coordinator still running, a separate check confirms every result; only a full pass writes the success file.',
  6: 'Cleanup, set up at the start (an EXIT trap), stops every step still running when the script exits, whether it passed or failed.',
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

/** Credibility strip links. The version comes from currentReleaseVersion() and the notes link from landing.release.href (R10), both at build time. */
export function projectRecordLinks(version: string, releaseNotesLink: string): PathStep[] {
  return [
    { label: `${HOME_TITLE}: a 2026 Better Scientific Software Fellowship project`, href: '/about/attribution/' },
    { label: 'Talks, posters & papers', href: '/about/talks-and-papers/' },
    { label: `${version} release notes`, href: releaseNotesLink },
    { label: 'Code Apache-2.0 · text CC BY 4.0', href: '/about/attribution/#licenses' },
  ];
}
