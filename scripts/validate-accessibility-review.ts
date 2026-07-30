import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parse } from 'yaml';

const REQUIRED_CHECKS = [
  'keyboard', 'headings-landmarks', 'zoom-reflow', 'link-purpose', 'tables', 'alternatives',
  'media-captions-transcripts', 'light-dark-contrast', 'visual-hierarchy', 'typography',
  'static-figure', 'forced-colors-print', 'no-javascript', 'no-decorative-motion',
  'canonical-ownership', 'projection-count', 'pre-execution-warnings',
  'validation-source-agreement', 'editorial-concision',
] as const;

const ROUTE_SAMPLES = {
  '/': 'landing', '/resources/': 'resources',
  '/guide/scheduler-as-orchestrator/': 'conceptual-module',
  '/guide/baseline-single-node-pattern/': 'runnable-module', '/start/': 'start',
  '/diagnostics/': 'diagnostics-index',
  '/diagnostics/bssw-prereq-apptainer/': 'diagnostic-detail',
  '/applicability/m1-baseline-anvil/': 'applicability', '/milestones/1/': 'milestone',
  '/releases/v0-1-0/': 'release', '/about/accessibility/': 'accessibility',
  '/about/support/': 'support', '/about/attribution/': 'attribution',
  '/about/licenses/': 'licenses', '/about/glossary/': 'glossary', '/about/project/': 'about',
} as const;

const CANONICAL_DESTINATIONS = {
  applicability: '/applicability/m1-baseline-anvil/',
  evidence: '/applicability/m1-baseline-anvil/', authority: '/about/attribution/',
  provenance: '/about/licenses/', release: '/releases/v0-1-0/',
} as const;
const VALID_RESULTS = new Set(['pending', 'pass', 'not-applicable']);

type ReviewRecord = Record<string, any>;
type ValidationOptions = { requireComplete?: boolean; source?: string };

export function validateAccessibilityReview(record: ReviewRecord, options: ValidationOptions = {}): string[] {
  const { requireComplete = false, source = 'accessibility-review.yml' } = options;
  const errors: string[] = [];
  const issue = (field: string, message: string) => errors.push(`${source}:${field} [A11Y-REVIEW] ${message}`);
  const validateResult = (field: string, entry: any, allowNotApplicable = true) => {
    if (!entry || !VALID_RESULTS.has(entry.result) || (!allowNotApplicable && entry.result === 'not-applicable')) issue(field, 'must have a valid review result');
    else if (requireComplete && entry.result === 'pending') issue(field, 'must be completed before release');
  };

  if (record.schemaVersion !== 2) issue('schemaVersion', 'must be 2');
  if (record.id !== 'accessibility-review-v0.1.0') issue('id', 'must preserve the versioned evidence ID');
  if (record.release !== 'v0.1.0') issue('release', 'must identify v0.1.0');
  for (const level of ['primary', 'supporting', 'disclosure', 'canonical-only']) {
    if (!record.presentationLevels?.[level]?.trim()) issue(`presentationLevels.${level}`, 'is required');
  }
  if (record.editorialHeuristicsPolicy?.enforcement !== 'human-review' || record.editorialHeuristicsPolicy?.approximateFirstWords !== 120 || record.editorialHeuristicsPolicy?.buildFailingWordCount !== false) {
    issue('editorialHeuristicsPolicy', 'must keep the approximate 120-word target human-reviewed and non-build-failing');
  }
  if (!Array.isArray(record.editorialHeuristics) || record.editorialHeuristics.length < 3) issue('editorialHeuristics', 'must record the human concision review');

  const automatedRoutes = new Set(record.automatedEvidence?.representativePages ?? []);
  const samples = new Map((record.manualRouteSamples ?? []).map((sample: any) => [sample.route, sample]));
  for (const [route, kind] of Object.entries(ROUTE_SAMPLES)) {
    if (!automatedRoutes.has(route)) issue('automatedEvidence.representativePages', `missing ${route}`);
    const sample = samples.get(route) as any;
    if (!sample || sample.kind !== kind) issue('manualRouteSamples', `missing ${kind} sample at ${route}`);
    else validateResult(`manualRouteSamples.${kind}`, sample, false);
  }

  const traces = new Map((record.canonicalDestinationTrace ?? []).map((trace: any) => [trace.subject, trace]));
  for (const [subject, destination] of Object.entries(CANONICAL_DESTINATIONS)) {
    const trace = traces.get(subject) as any;
    if (!trace || trace.destination !== destination || !trace.notes?.trim()) issue(`canonicalDestinationTrace.${subject}`, `must trace requirement-bearing ${subject} information to ${destination}`);
    else validateResult(`canonicalDestinationTrace.${subject}`, trace, false);
  }

  const checks = new Map((record.checks ?? []).map((check: any) => [check.id, check]));
  for (const id of REQUIRED_CHECKS) {
    const check = checks.get(id) as any;
    if (!check || !check.notes?.trim()) issue(`checks.${id}`, 'result and notes are required');
    else validateResult(`checks.${id}`, check);
  }
  if (requireComplete && (record.releaseReady !== true || record.reviewer === 'EXTERNAL_REQUIRED' || record.reviewedAt === 'EXTERNAL_REQUIRED')) issue('releaseReady', 'reviewer, review date, and approval are required before release');
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = resolve(process.argv[2] ?? 'releases/v0.1.0/accessibility-review.yml');
  const requireComplete = process.argv.includes('--require-complete');
  const errors = validateAccessibilityReview(parse(readFileSync(file, 'utf8')) as ReviewRecord, { requireComplete, source: file });
  if (errors.length) {
    console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
    process.exit(1);
  }
  console.log(requireComplete ? 'Accessibility and editorial release review is complete.' : 'Accessibility and editorial release-review evidence template is structurally valid.');
}
