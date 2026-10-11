import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { assertReleaseVersion, readReleaseCandidate, resolveReleaseVersion } from './release-version.mjs';

const REQUIRED_CHECKS = [
  'keyboard', 'headings-landmarks', 'zoom-reflow', 'link-purpose', 'tables', 'alternatives',
  'media-captions-transcripts', 'light-dark-contrast', 'visual-hierarchy', 'typography',
  'static-figure', 'forced-colors-print', 'no-javascript', 'no-decorative-motion',
  'canonical-ownership', 'projection-count', 'pre-execution-warnings',
  'validation-source-agreement', 'editorial-concision',
] as const;

// Checks added for the v0.2.0 visual-system release (spec section 10: theme, font failure, badge and panel).
const V020_EXTRA_CHECKS = ['theme-precedence', 'font-failure', 'evidence-badge-panel', 'voiceover', 'keyboard-new-components'] as const;

// v0.1.0 is frozen: its review record is validated against exactly these constants.
const V010_ROUTE_SAMPLES = {
  '/': 'landing', '/resources/': 'resources',
  '/guide/scheduler-as-orchestrator/': 'conceptual-module',
  '/guide/baseline-single-node-pattern/': 'runnable-module', '/start/': 'start',
  '/diagnostics/': 'diagnostics-index',
  '/applicability/m1-baseline-anvil/': 'applicability',
  '/milestones/1/': 'milestone', '/about/accessibility/': 'accessibility',
  '/about/support/': 'support', '/about/attribution/': 'attribution-and-licenses',
  '/about/glossary/': 'glossary', '/about/project/': 'about',
} as const;

// v0.1.0-only: the release record renders as a section of /milestones/1/ (one milestone,
// one release), and license coverage renders as a section of /about/attribution/. The same
// consolidation applies to v0.2.0 and /milestones/2/ (explicit section id release-v0-2-0).
const V010_DESTINATIONS = {
  applicability: '/applicability/m1-baseline-anvil/',
  evidence: '/applicability/m1-baseline-anvil/', authority: '/about/attribution/',
  provenance: '/about/attribution/', release: '/milestones/1/',
} as const;
const VALID_RESULTS = new Set(['pending', 'pass', 'not-applicable']);
const PLACEHOLDER = 'EXTERNAL_REQUIRED';
const COMMIT = /^[0-9a-f]{40}$/i;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Releases with a review profile, and the milestone page that renders each release record.
const MILESTONE_BY_RELEASE: Record<string, number> = { 'v0.1.0': 1, 'v0.2.0': 2 };

export type ReviewProfile = {
  release: string;
  id: string;
  routeSamples: Record<string, string>;
  destinations: Record<string, string>;
  requiredChecks: readonly string[];
  /** v0.2.0 and later: the signature names the reviewed commit and deployment (v0.1.0 is frozen without them). */
  bindsReviewedBuild: boolean;
};

/** The route samples, canonical destinations and checks a review of `version` must cover.
 *  `recordId` is the current applicability record (first non-review entry of evidenceIds). */
export function reviewProfile(version: string, recordId: string): ReviewProfile {
  const milestone = MILESTONE_BY_RELEASE[version];
  if (!milestone) throw new Error(`no accessibility-review profile for ${version}; add one before releasing it`);
  if (version === 'v0.1.0') {
    return { release: version, id: `accessibility-review-${version}`, routeSamples: { ...V010_ROUTE_SAMPLES }, destinations: { ...V010_DESTINATIONS }, requiredChecks: REQUIRED_CHECKS, bindsReviewedBuild: false };
  }
  const record = `/applicability/${recordId}/`;
  const routeSamples: Record<string, string> = {
    '/': 'landing', '/guide/tour/': 'tour', '/guide/compose-to-hpc-translation/': 'translation-module',
    '/adoption/evaluate/': 'adoption', '/about/talks-and-papers/': 'talks-and-papers', '/resources/': 'resources',
    '/guide/scheduler-as-orchestrator/': 'conceptual-module',
    '/guide/baseline-single-node-pattern/': 'runnable-module', '/start/': 'start',
    '/diagnostics/': 'diagnostics-index', [record]: 'applicability',
    [`/milestones/${milestone}/`]: 'milestone', '/about/accessibility/': 'accessibility',
    '/about/support/': 'support', '/about/attribution/': 'attribution-and-licenses',
    '/about/glossary/': 'glossary', '/about/project/': 'about',
  };
  return {
    release: version, id: `accessibility-review-${version}`, routeSamples,
    destinations: { applicability: record, evidence: record, authority: '/about/attribution/', provenance: '/about/attribution/', release: `/milestones/${milestone}/` },
    requiredChecks: [...REQUIRED_CHECKS, ...V020_EXTRA_CHECKS],
    bindsReviewedBuild: true,
  };
}

const PRESENTATION_LEVELS = {
  primary: 'Direct answer and any prerequisite, safety warning, unvalidated state, tested-scope summary, or reporting action needed to act safely now; never place critical content only in disclosure.',
  supporting: 'Outcomes, limitations, status, and related actions presented visibly after the direct answer or task.',
  disclosure: 'Noncritical citations or reconstruction explanation in native details/summary that remains available without JavaScript.',
  'canonical-only': 'Exhaustive applicability, evidence, authority, provenance, and release facts linked to\u2014not copied from\u2014their sole canonical destination.',
};
const EDITORIAL_HEURISTICS = [
  'The first screen and approximately first 120 rendered words answer the route question.',
  'Ledes and paragraphs are concise, headings and terminology face the reader, and warnings are explicitly labelled.',
  'No throat-clearing or internal projection/schema terminology appears in ordinary reader prose.',
];

/** An unsigned review that covers everything `profile` requires. Every result is pending, so it passes as a template and fails --require-complete. */
export function pendingReview(profile: ReviewProfile) {
  return {
    schemaVersion: 2, id: profile.id, release: profile.release,
    reviewer: PLACEHOLDER, reviewedAt: PLACEHOLDER, releaseReady: false,
    ...(profile.bindsReviewedBuild ? { reviewedCommit: PLACEHOLDER, reviewedDeploymentUrl: PLACEHOLDER } : {}),
    automatedEvidence: { command: 'npm run test:accessibility:browser', representativePages: Object.keys(profile.routeSamples) },
    presentationLevels: PRESENTATION_LEVELS,
    editorialHeuristicsPolicy: { enforcement: 'human-review', approximateFirstWords: 120, buildFailingWordCount: false },
    editorialHeuristics: EDITORIAL_HEURISTICS,
    canonicalDestinationTrace: Object.entries(profile.destinations).map(([subject, destination]) => ({ subject, destination, result: 'pending', notes: 'Pending human review.' })),
    manualRouteSamples: Object.entries(profile.routeSamples).map(([route, kind]) => ({ kind, route, result: 'pending' })),
    checks: profile.requiredChecks.map((id) => ({ id, result: 'pending', notes: 'Pending human review.' })),
  };
}

/** The current applicability record named by a release candidate: the first evidence id that is not a review id. */
export function currentRecordId(evidenceIds: readonly string[]): string {
  const id = evidenceIds.find((entry) => !entry.startsWith('accessibility-review-'));
  if (!id) throw new Error('release-candidate.json evidenceIds must name an applicability record');
  return id;
}

type ReviewRecord = Record<string, any>;
type ValidationOptions = {
  requireComplete?: boolean; source?: string; version?: string; recordId?: string;
  /** Today as YYYY-MM-DD (UTC); defaults to the clock. A review cannot be dated later than this. */
  today?: string;
  /** The commit being released. Required with `requireComplete` for releases that bind the review to a build. */
  releaseSha?: string;
  /** Where the git repository is checked out; defaults to the working directory. */
  gitRoot?: string;
};

const git = (cwd: string, args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8' });

/** The commit being released: `--release-sha <sha>`, else RELEASE_SHA, else GITHUB_SHA, else HEAD; undefined when none can be found. */
export function resolveReleaseSha(argv: readonly string[], env: Record<string, string | undefined>, cwd: string): string | undefined {
  const flag = argv.findIndex((argument) => argument === '--release-sha' || argument.startsWith('--release-sha='));
  if (flag >= 0) {
    const value = argv[flag].startsWith('--release-sha=') ? argv[flag].slice('--release-sha='.length) : argv[flag + 1];
    if (value && !value.startsWith('--')) return value;
  }
  for (const name of ['RELEASE_SHA', 'GITHUB_SHA']) if (env[name]?.trim()) return env[name]!.trim();
  const head = git(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
  return head.status === 0 && head.stdout.trim() ? head.stdout.trim() : undefined;
}

/** Problems with how `reviewedCommit` relates to `releaseSha`: it must be this checkout's ancestor of (or equal to) the release, with nothing but the review file changed in between. */
function reviewedBuildProblems(reviewedCommit: string, releaseSha: string, reviewFile: string, cwd: string): string[] {
  const resolve = (ref: string) => {
    const result = git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    return result.status === 0 ? result.stdout.trim() : undefined;
  };
  const release = resolve(releaseSha);
  if (!release) return [`the release commit ${releaseSha} is not a commit in this checkout`];
  const reviewed = resolve(reviewedCommit);
  if (!reviewed) return [`${reviewedCommit} is not a commit in this checkout; fetch the full history before checking the review`];
  const ancestor = git(cwd, ['merge-base', '--is-ancestor', reviewed, release]);
  if (ancestor.status === 1) return [`${reviewed} is not an ancestor of the release commit ${release}`];
  if (ancestor.status !== 0) return [`could not compare ${reviewed} with the release commit: ${ancestor.stderr.trim()}`];
  const changed = git(cwd, ['diff', '--name-only', reviewed, release, '--', '.', `:!${reviewFile}`]);
  if (changed.status !== 0) return [`could not list the files that changed after the review: ${changed.stderr.trim()}`];
  const files = changed.stdout.split('\n').filter(Boolean);
  if (files.length) return [`${files.length} file(s) changed between the reviewed commit and the release commit (only ${reviewFile} may change); re-review the new commit: ${files.slice(0, 5).join(', ')}${files.length > 5 ? ', ...' : ''}`];
  return [];
}

const isIsoDate = (value: unknown, today: string): boolean => {
  const match = typeof value === 'string' ? ISO_DATE.exec(value) : null;
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day && (value as string) <= today;
};
/** The reviewed deployment is one Cloudflare Pages deployment (`https://<8-hex>.<project>.pages.dev`), never a moving alias
 * such as `preview.` or the live domain, which a later push or release replaces. */
const isDeploymentUrl = (value: unknown): boolean => {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && /^[0-9a-f]{8}\.[a-z0-9-]+\.pages\.dev$/.test(url.hostname);
  } catch {
    return false;
  }
};

export function validateAccessibilityReview(record: ReviewRecord, options: ValidationOptions = {}): string[] {
  const { requireComplete = false, source = 'accessibility-review.yml' } = options;
  const errors: string[] = [];
  const issue = (field: string, message: string) => errors.push(`${source}:${field} [A11Y-REVIEW] ${message}`);
  const version = options.version ?? String(record.release);
  const recordId = options.recordId ?? (version === 'v0.1.0' ? 'm1-baseline-anvil' : '');
  if (!recordId) {
    issue('options.recordId', 'the current applicability record id (from release-candidate.json) is required');
    return errors;
  }
  let profile: ReviewProfile;
  try {
    profile = reviewProfile(version, recordId);
  } catch (error) {
    issue('release', (error as Error).message);
    return errors;
  }
  const validateResult = (field: string, entry: any, allowNotApplicable = true) => {
    if (!entry || !VALID_RESULTS.has(entry.result) || (!allowNotApplicable && entry.result === 'not-applicable')) issue(field, 'must have a valid review result');
    else if (requireComplete && entry.result === 'pending') issue(field, 'must be completed before release');
  };

  if (record.schemaVersion !== 2) issue('schemaVersion', 'must be 2');
  if (record.id !== profile.id) issue('id', 'must preserve the versioned evidence ID');
  if (record.release !== profile.release) issue('release', `must identify ${profile.release}`);
  for (const level of ['primary', 'supporting', 'disclosure', 'canonical-only']) {
    if (!record.presentationLevels?.[level]?.trim()) issue(`presentationLevels.${level}`, 'is required');
  }
  if (record.editorialHeuristicsPolicy?.enforcement !== 'human-review' || record.editorialHeuristicsPolicy?.approximateFirstWords !== 120 || record.editorialHeuristicsPolicy?.buildFailingWordCount !== false) {
    issue('editorialHeuristicsPolicy', 'must keep the approximate 120-word target human-reviewed and non-build-failing');
  }
  if (!Array.isArray(record.editorialHeuristics) || record.editorialHeuristics.length < 3) issue('editorialHeuristics', 'must record the human concision review');

  const automatedRoutes = new Set(record.automatedEvidence?.representativePages ?? []);
  const samples = new Map((record.manualRouteSamples ?? []).map((sample: any) => [sample.route, sample]));
  for (const [route, kind] of Object.entries(profile.routeSamples)) {
    if (!automatedRoutes.has(route)) issue('automatedEvidence.representativePages', `missing ${route}`);
    const sample = samples.get(route) as any;
    if (!sample || sample.kind !== kind) issue('manualRouteSamples', `missing ${kind} sample at ${route}`);
    else validateResult(`manualRouteSamples.${kind}`, sample, false);
  }

  const traces = new Map((record.canonicalDestinationTrace ?? []).map((trace: any) => [trace.subject, trace]));
  for (const [subject, destination] of Object.entries(profile.destinations)) {
    const trace = traces.get(subject) as any;
    if (!trace || trace.destination !== destination || !trace.notes?.trim()) issue(`canonicalDestinationTrace.${subject}`, `must trace requirement-bearing ${subject} information to ${destination}`);
    else validateResult(`canonicalDestinationTrace.${subject}`, trace, false);
  }

  const checks = new Map((record.checks ?? []).map((check: any) => [check.id, check]));
  for (const id of profile.requiredChecks) {
    const check = checks.get(id) as any;
    if (!check || !check.notes?.trim()) issue(`checks.${id}`, 'result and notes are required');
    else validateResult(`checks.${id}`, check);
  }
  if (requireComplete && (record.releaseReady !== true || record.reviewer === PLACEHOLDER || record.reviewedAt === PLACEHOLDER)) issue('releaseReady', 'reviewer, review date, and approval are required before release');
  if (profile.bindsReviewedBuild) validateReviewedBuild(record, profile, options, issue);
  return errors;
}

/** The review is only worth signing if it names what was reviewed: a commit and a deployment, both checkable at release. */
function validateReviewedBuild(record: ReviewRecord, profile: ReviewProfile, options: ValidationOptions, issue: (field: string, message: string) => void) {
  const requireComplete = options.requireComplete ?? false;
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const field = (name: string, ok: boolean, expectation: string) => {
    const value = record[name];
    if (value === undefined) issue(name, `is required: ${expectation}, or ${PLACEHOLDER} until the review is signed`);
    else if (value === PLACEHOLDER) { if (requireComplete) issue(name, `must be ${expectation} before release`); }
    else if (!ok) issue(name, `must be ${expectation}`);
  };
  field('reviewedCommit', COMMIT.test(String(record.reviewedCommit)), 'the 40-character hexadecimal commit that was reviewed');
  field('reviewedDeploymentUrl', isDeploymentUrl(record.reviewedDeploymentUrl), 'the per-deployment https://<8-hex>.<project>.pages.dev URL of the deployment that was reviewed, not an alias');
  if (!requireComplete) return;
  if (record.reviewedAt !== PLACEHOLDER && !isIsoDate(record.reviewedAt, today)) issue('reviewedAt', `must be a real YYYY-MM-DD date no later than today (${today}, UTC)`);
  else if (record.reviewedAt === PLACEHOLDER) issue('reviewedAt', 'must be a YYYY-MM-DD date no later than today (UTC) before release');
  if (!COMMIT.test(String(record.reviewedCommit))) return;
  if (!options.releaseSha) {
    issue('options.releaseSha', 'the release commit is required to check that nothing but the review changed after the reviewed commit');
    return;
  }
  for (const problem of reviewedBuildProblems(String(record.reviewedCommit), options.releaseSha, `releases/${profile.release}/accessibility-review.yml`, options.gitRoot ?? '.')) issue('reviewedCommit', problem);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--print-template')) {
      const releaseVersion = assertReleaseVersion(resolveReleaseVersion('.'));
      const recordId = currentRecordId(readReleaseCandidate('.', releaseVersion).evidenceIds);
      process.stdout.write(stringify(pendingReview(reviewProfile(releaseVersion, recordId)), { lineWidth: 0 }));
      process.exit(0);
    }
    const requireComplete = process.argv.includes('--require-complete');
    const argv = process.argv.slice(2);
    const fileArgument = argv.find((argument, index) => !argument.startsWith('--') && argv[index - 1] !== '--release-sha');
    // An explicit file is validated as the release named by its releases/<v>/ directory, and as the declared release only when the path has no such segment; otherwise the release comes from RELEASE_VERSION or the newest candidate record.
    const pathVersion = fileArgument?.match(/(?:^|[\\/])releases[\\/](v\d+\.\d+\.\d+)[\\/]accessibility-review\.yml$/)?.[1];
    const version = fileArgument ? pathVersion : assertReleaseVersion(resolveReleaseVersion('.'));
    const file = resolve(fileArgument ?? `releases/${version}/accessibility-review.yml`);
    const record = parse(readFileSync(file, 'utf8')) as ReviewRecord;
    const releaseVersion = assertReleaseVersion(version ?? String(record.release));
    const recordId = currentRecordId(readReleaseCandidate('.', releaseVersion).evidenceIds);
    const releaseSha = requireComplete ? resolveReleaseSha(argv, process.env, '.') : undefined;
    const errors = validateAccessibilityReview(record, { requireComplete, source: file, version: releaseVersion, recordId, releaseSha });
    if (errors.length) {
      console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
      process.exit(1);
    }
    console.log(requireComplete ? 'Accessibility and editorial release review is complete.' : 'Accessibility and editorial release-review evidence template is structurally valid.');
  } catch (error) {
    console.error(`ERROR: ${(error as Error).message}`);
    process.exit(1);
  }
}
