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

// Releases with a review profile, and the milestone page that renders each release record.
const MILESTONE_BY_RELEASE: Record<string, number> = { 'v0.1.0': 1, 'v0.2.0': 2 };

export type ReviewProfile = {
  release: string;
  id: string;
  routeSamples: Record<string, string>;
  destinations: Record<string, string>;
  requiredChecks: readonly string[];
};

/** The route samples, canonical destinations and checks a review of `version` must cover.
 *  `recordId` is the current applicability record (first non-review entry of evidenceIds). */
export function reviewProfile(version: string, recordId: string): ReviewProfile {
  const milestone = MILESTONE_BY_RELEASE[version];
  if (!milestone) throw new Error(`no accessibility-review profile for ${version}; add one before releasing it`);
  if (version === 'v0.1.0') {
    return { release: version, id: `accessibility-review-${version}`, routeSamples: { ...V010_ROUTE_SAMPLES }, destinations: { ...V010_DESTINATIONS }, requiredChecks: REQUIRED_CHECKS };
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
    reviewer: 'EXTERNAL_REQUIRED', reviewedAt: 'EXTERNAL_REQUIRED', releaseReady: false,
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
type ValidationOptions = { requireComplete?: boolean; source?: string; version?: string; recordId?: string };

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
  if (requireComplete && (record.releaseReady !== true || record.reviewer === 'EXTERNAL_REQUIRED' || record.reviewedAt === 'EXTERNAL_REQUIRED')) issue('releaseReady', 'reviewer, review date, and approval are required before release');
  return errors;
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
    const fileArgument = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
    // An explicit file is validated as the release named by its releases/<v>/ directory, and as the declared release only when the path has no such segment; otherwise the release comes from RELEASE_VERSION or the newest candidate record.
    const pathVersion = fileArgument?.match(/(?:^|[\\/])releases[\\/](v\d+\.\d+\.\d+)[\\/]accessibility-review\.yml$/)?.[1];
    const version = fileArgument ? pathVersion : assertReleaseVersion(resolveReleaseVersion('.'));
    const file = resolve(fileArgument ?? `releases/${version}/accessibility-review.yml`);
    const record = parse(readFileSync(file, 'utf8')) as ReviewRecord;
    const releaseVersion = assertReleaseVersion(version ?? String(record.release));
    const recordId = currentRecordId(readReleaseCandidate('.', releaseVersion).evidenceIds);
    const errors = validateAccessibilityReview(record, { requireComplete, source: file, version: releaseVersion, recordId });
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
