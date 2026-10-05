import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { currentRecordId, pendingReview, reviewProfile, validateAccessibilityReview, type ReviewProfile } from '../../scripts/validate-accessibility-review';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const RECORD = 'm2-baseline-anvil-2026-10';
const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

/** A review record that satisfies `profile`; `complete` controls whether it is signed. */
function review(profile: ReviewProfile, complete: boolean) {
  const result = complete ? 'pass' : 'pending';
  return {
    schemaVersion: 2, id: profile.id, release: profile.release,
    reviewer: complete ? 'Reviewer Name' : 'EXTERNAL_REQUIRED', reviewedAt: complete ? '2026-10-14' : 'EXTERNAL_REQUIRED', releaseReady: complete,
    automatedEvidence: { command: 'npm run test:accessibility:browser', representativePages: Object.keys(profile.routeSamples) },
    presentationLevels: { primary: 'p', supporting: 's', disclosure: 'd', 'canonical-only': 'c' },
    editorialHeuristicsPolicy: { enforcement: 'human-review', approximateFirstWords: 120, buildFailingWordCount: false },
    editorialHeuristics: ['one', 'two', 'three'],
    manualRouteSamples: Object.entries(profile.routeSamples).map(([route, kind]) => ({ route, kind, result, notes: 'checked' })),
    canonicalDestinationTrace: Object.entries(profile.destinations).map(([subject, destination]) => ({ subject, destination, result, notes: 'checked' })),
    checks: profile.requiredChecks.map((id) => ({ id, result, notes: 'checked' })),
  };
}

describe('reviewProfile', () => {
  it('keeps the frozen v0.1.0 constants', () => {
    const profile = reviewProfile('v0.1.0', 'ignored');
    expect(profile.id).toBe('accessibility-review-v0.1.0');
    expect(Object.keys(profile.routeSamples)).toHaveLength(13);
    expect(profile.routeSamples['/applicability/m1-baseline-anvil/']).toBe('applicability');
    expect(profile.destinations.release).toBe('/milestones/1/');
    expect(profile.requiredChecks).toHaveLength(19);
  });

  it('points v0.2.0 at milestone 2, the current record and the new routes', () => {
    const profile = reviewProfile('v0.2.0', RECORD);
    expect(profile.id).toBe('accessibility-review-v0.2.0');
    expect(profile.destinations).toEqual({
      applicability: `/applicability/${RECORD}/`, evidence: `/applicability/${RECORD}/`,
      authority: '/about/attribution/', provenance: '/about/attribution/', release: '/milestones/2/',
    });
    for (const route of ['/', '/guide/tour/', '/guide/compose-to-hpc-translation/', '/adoption/evaluate/', '/about/talks-and-papers/', `/applicability/${RECORD}/`, '/milestones/2/']) {
      expect(profile.routeSamples).toHaveProperty([route]);
    }
    expect(profile.routeSamples).not.toHaveProperty(['/milestones/1/']);
    expect(profile.routeSamples).not.toHaveProperty(['/applicability/m1-baseline-anvil/']);
    for (const check of ['theme-precedence', 'font-failure', 'evidence-badge-panel']) expect(profile.requiredChecks).toContain(check);
  });

  it('refuses a release that has no profile', () => {
    expect(() => reviewProfile('v9.9.9', RECORD)).toThrow(/no accessibility-review profile for v9\.9\.9/);
  });
});

describe('currentRecordId', () => {
  it('takes the first evidence id that is not a review id', () => {
    expect(currentRecordId(['accessibility-review-v0.2.0', RECORD, 'm1-baseline-anvil'])).toBe(RECORD);
    expect(() => currentRecordId(['accessibility-review-v0.2.0'])).toThrow(/applicability record/);
  });
});

describe('validateAccessibilityReview for v0.2.0', () => {
  const options = { version: 'v0.2.0', recordId: RECORD };
  const profile = reviewProfile('v0.2.0', RECORD);

  it('accepts a complete review as release-complete', () => {
    expect(validateAccessibilityReview(review(profile, true), { ...options, requireComplete: true })).toEqual([]);
  });

  it('accepts an unsigned draft as a structurally valid template, and rejects it as release-complete', () => {
    const draft = pendingReview(profile);
    expect(validateAccessibilityReview(draft, options)).toEqual([]);
    const errors = validateAccessibilityReview(draft, { ...options, requireComplete: true }).join('\n');
    expect(errors).toMatch(/must be completed before release/);
    expect(errors).toMatch(/reviewer, review date, and approval/);
  });

  it('rejects a v0.1.0 identity, a stale milestone destination and a stale record route', () => {
    const wrongId = { ...review(profile, true), id: 'accessibility-review-v0.1.0' };
    expect(validateAccessibilityReview(wrongId, options).join('\n')).toContain('id [A11Y-REVIEW]');

    const stale = review(profile, true);
    stale.canonicalDestinationTrace.find((trace) => trace.subject === 'release')!.destination = '/milestones/1/';
    expect(validateAccessibilityReview(stale, options).join('\n')).toContain('canonicalDestinationTrace.release');

    const oldRecord = review(profile, true);
    oldRecord.manualRouteSamples.find((sample) => sample.kind === 'applicability')!.route = '/applicability/m1-baseline-anvil/';
    expect(validateAccessibilityReview(oldRecord, options).join('\n')).toContain(`missing applicability sample at /applicability/${RECORD}/`);
  });

  it('requires the v0.2.0-only checks and the new route samples', () => {
    const noTheme = review(profile, true);
    noTheme.checks = noTheme.checks.filter((check) => check.id !== 'theme-precedence');
    expect(validateAccessibilityReview(noTheme, options).join('\n')).toContain('checks.theme-precedence');

    const noTour = review(profile, true);
    noTour.manualRouteSamples = noTour.manualRouteSamples.filter((sample) => sample.route !== '/guide/tour/');
    expect(validateAccessibilityReview(noTour, options).join('\n')).toContain('missing tour sample at /guide/tour/');
  });

  it('needs the current record id for any release but v0.1.0', () => {
    expect(validateAccessibilityReview(review(profile, true), { version: 'v0.2.0' }).join('\n')).toContain('options.recordId');
  });
});

describe('validate-accessibility-review CLI', () => {
  const tsx = join(repo, 'node_modules/.bin/tsx');
  function checkout() {
    const root = mkdtempSync(join(tmpdir(), 'l2c-a11y-review-'));
    temporary.push(root);
    mkdirSync(join(root, 'releases/v0.2.0'), { recursive: true });
    writeFileSync(join(root, 'releases/v0.2.0/release-candidate.json'), JSON.stringify({
      schemaVersion: 1, version: 'v0.2.0', status: 'candidate', repositoryTag: 'v0.2.0', canonicalOrigin: 'https://laptop-to-cluster.org',
      evidenceIds: [RECORD, 'accessibility-review-v0.2.0'], changes: [{ class: 'added', itemId: 'x' }],
    }));
    return root;
  }
  const run = (root: string, args: string[], env: Record<string, string> = {}) =>
    spawnSync(tsx, [join(repo, 'scripts/validate-accessibility-review.ts'), ...args], { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH ?? '', ...env } });

  it('finds releases/<newest>/accessibility-review.yml without a path argument', () => {
    const root = checkout();
    writeFileSync(join(root, 'releases/v0.2.0/accessibility-review.yml'), stringify(pendingReview(reviewProfile('v0.2.0', RECORD))));
    const template = run(root, []);
    expect(template.status, template.stderr).toBe(0);
    expect(template.stdout).toContain('structurally valid');
    const complete = run(root, ['--require-complete']);
    expect(complete.status).toBe(1);
    expect(complete.stderr).toContain('[A11Y-REVIEW]');
  });

  it('accepts a signed review with --require-complete', () => {
    const root = checkout();
    writeFileSync(join(root, 'releases/v0.2.0/accessibility-review.yml'), stringify(review(reviewProfile('v0.2.0', RECORD), true)));
    const result = run(root, ['--require-complete']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('is complete');
  });

  it('rejects a review whose declared release differs from its releases/<v>/ directory', () => {
    const root = checkout();
    mkdirSync(join(root, 'releases/v0.1.0'), { recursive: true });
    writeFileSync(join(root, 'releases/v0.1.0/release-candidate.json'), JSON.stringify({
      schemaVersion: 1, version: 'v0.1.0', status: 'candidate', repositoryTag: 'v0.1.0', canonicalOrigin: 'https://laptop-to-cluster.org',
      evidenceIds: ['m1-baseline-anvil', 'accessibility-review-v0.1.0'], changes: [{ class: 'added', itemId: 'x' }],
    }));
    writeFileSync(join(root, 'releases/v0.2.0/accessibility-review.yml'), stringify(review(reviewProfile('v0.1.0', 'm1-baseline-anvil'), true)));
    const result = run(root, ['releases/v0.2.0/accessibility-review.yml', '--require-complete']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must identify v0.2.0');
  });

  it('validates an explicit releases/v0.2.0 path as v0.2.0', () => {
    const root = checkout();
    writeFileSync(join(root, 'releases/v0.2.0/accessibility-review.yml'), stringify(review(reviewProfile('v0.2.0', RECORD), true)));
    const result = run(root, ['releases/v0.2.0/accessibility-review.yml', '--require-complete']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('is complete');
  });

  it('prints an unsigned template that a reviewer can sign', () => {
    const root = checkout();
    const printed = run(root, ['--print-template']);
    expect(printed.status, printed.stderr).toBe(0);
    const template = parse(printed.stdout);
    expect(template).toMatchObject({ id: 'accessibility-review-v0.2.0', release: 'v0.2.0', releaseReady: false, reviewer: 'EXTERNAL_REQUIRED' });
    expect(validateAccessibilityReview(template, { version: 'v0.2.0', recordId: RECORD })).toEqual([]);
    expect(validateAccessibilityReview(template, { version: 'v0.2.0', recordId: RECORD, requireComplete: true }).length).toBeGreaterThan(0);
  });

  it('honours RELEASE_VERSION and fails clearly when that release has no review file', () => {
    const root = checkout();
    const result = run(root, [], { RELEASE_VERSION: 'v0.2.0' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ERROR:');
    expect(result.stderr).toContain('accessibility-review.yml');
  });
});
