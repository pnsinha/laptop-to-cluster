import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { currentRecordId, pendingReview, resolveReleaseSha, reviewProfile, validateAccessibilityReview, type ReviewProfile } from '../../scripts/validate-accessibility-review';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const RECORD = 'm2-baseline-anvil-2026-10';
const REVIEWED = '0123456789abcdef0123456789abcdef01234567';
const SIGNED_URL = 'https://0a1b2c3d.laptop-to-cluster.pages.dev';
const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

const gitEnv = { PATH: process.env.PATH ?? '', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
function git(cwd: string, ...args: string[]) {
  const result = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', env: gitEnv });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}
/** Write one file and commit it; returns the new commit. */
function commitFile(root: string, path: string, content: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
  git(root, 'add', '--all');
  git(root, 'commit', '-q', '-m', `change ${path}`);
  return git(root, 'rev-parse', 'HEAD');
}
/** A temporary git repository holding the release candidate and one content file; returns its root and that first commit. */
function repository() {
  const root = mkdtempSync(join(tmpdir(), 'l2c-a11y-git-'));
  temporary.push(root);
  git(root, 'init', '-q', '-b', 'main');
  commitFile(root, 'site-content.txt', 'content as reviewed\n');
  mkdirSync(join(root, 'releases/v0.2.0'), { recursive: true });
  const reviewed = commitFile(root, 'releases/v0.2.0/release-candidate.json', JSON.stringify({
    schemaVersion: 1, version: 'v0.2.0', status: 'candidate', repositoryTag: 'v0.2.0', canonicalOrigin: 'https://laptop-to-cluster.org',
    evidenceIds: [RECORD, 'accessibility-review-v0.2.0'], changes: [{ class: 'added', itemId: 'x' }],
  }));
  return { root, reviewed };
}

/** A review record that satisfies `profile`; `complete` controls whether it is signed. */
function review(profile: ReviewProfile, complete: boolean) {
  const result = complete ? 'pass' : 'pending';
  return {
    schemaVersion: 2, id: profile.id, release: profile.release,
    reviewer: complete ? 'Reviewer Name' : 'EXTERNAL_REQUIRED', reviewedAt: complete ? '2026-10-01' : 'EXTERNAL_REQUIRED', releaseReady: complete,
    ...(profile.bindsReviewedBuild ? { reviewedCommit: complete ? REVIEWED : 'EXTERNAL_REQUIRED', reviewedDeploymentUrl: complete ? SIGNED_URL : 'EXTERNAL_REQUIRED' } : {}),
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
    const { root, reviewed } = repository();
    const release = commitFile(root, 'releases/v0.2.0/accessibility-review.yml', 'signed\n');
    const signed = { ...review(profile, true), reviewedCommit: reviewed };
    expect(validateAccessibilityReview(signed, { ...options, requireComplete: true, releaseSha: release, gitRoot: root })).toEqual([]);
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
    expect(complete.stderr).toContain('reviewer, review date, and approval');
    for (const field of ['reviewedAt', 'reviewedCommit', 'reviewedDeploymentUrl']) expect(complete.stderr, field).toContain(`${field} [A11Y-REVIEW]`);
  });

  /** A git checkout where the review file was signed on top of the reviewed content commit. */
  function signedCheckout() {
    const { root, reviewed } = repository();
    const release = commitFile(root, 'releases/v0.2.0/accessibility-review.yml', stringify({ ...review(reviewProfile('v0.2.0', RECORD), true), reviewedCommit: reviewed }));
    return { root, reviewed, release };
  }

  it('accepts a signed review with --require-complete', () => {
    const { root } = signedCheckout();
    const result = run(root, ['--require-complete']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('is complete');
  });

  it('takes the release commit from --release-sha and rejects content that changed after the review', () => {
    const { root, release } = signedCheckout();
    commitFile(root, 'site-content.txt', 'changed after the review\n');
    const head = run(root, ['--require-complete']);
    expect(head.status).toBe(1);
    expect(head.stderr).toContain('site-content.txt');
    const shipped = run(root, ['--require-complete', '--release-sha', release]);
    expect(shipped.status, shipped.stderr).toBe(0);
    const viaEnvironment = run(root, ['--require-complete'], { RELEASE_SHA: release });
    expect(viaEnvironment.status, viaEnvironment.stderr).toBe(0);
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
    const { root } = signedCheckout();
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

describe('a signed v0.2.0 review is tied to what ships', () => {
  const profile = reviewProfile('v0.2.0', RECORD);
  const REVIEW_FILE = 'releases/v0.2.0/accessibility-review.yml';
  const base = { version: 'v0.2.0', recordId: RECORD, requireComplete: true, today: '2026-10-14' };
  /** The content commit that was reviewed, and the commit that signs the review on top of it. */
  function shipped() {
    const { root, reviewed } = repository();
    const release = commitFile(root, REVIEW_FILE, 'signed\n');
    return { root, reviewed, release };
  }
  const check = (record: Record<string, unknown>, root: string, release: string | undefined, extra: Record<string, unknown> = {}) =>
    validateAccessibilityReview(record, { ...base, releaseSha: release, gitRoot: root, ...extra }).join('\n');
  const sign = (reviewed: string, overrides: Record<string, unknown> = {}) => ({ ...review(profile, true), reviewedCommit: reviewed, ...overrides });

  it('records both fields as placeholders in the unsigned template, and passes structure mode', () => {
    const draft = pendingReview(profile);
    expect(draft).toMatchObject({ reviewedCommit: 'EXTERNAL_REQUIRED', reviewedDeploymentUrl: 'EXTERNAL_REQUIRED' });
    expect(validateAccessibilityReview(draft, { version: 'v0.2.0', recordId: RECORD })).toEqual([]);
  });

  it('requires both fields to be present, and well formed once filled, even in structure mode', () => {
    for (const field of ['reviewedCommit', 'reviewedDeploymentUrl']) {
      const missing: Record<string, unknown> = pendingReview(profile);
      delete missing[field];
      expect(validateAccessibilityReview(missing, { version: 'v0.2.0', recordId: RECORD }).join('\n'), field).toContain(`${field} [A11Y-REVIEW]`);
    }
    const malformed = { ...pendingReview(profile), reviewedCommit: 'abc123', reviewedDeploymentUrl: 'http://x.pages.dev' };
    const errors = validateAccessibilityReview(malformed, { version: 'v0.2.0', recordId: RECORD }).join('\n');
    expect(errors).toContain('reviewedCommit [A11Y-REVIEW]');
    expect(errors).toContain('reviewedDeploymentUrl [A11Y-REVIEW]');
  });

  it('accepts a review of the commit that ships, signed on top of it', () => {
    const { root, reviewed, release } = shipped();
    expect(check(sign(reviewed), root, release)).toBe('');
  });

  it('accepts the reviewed commit being the release commit itself', () => {
    const { root, reviewed } = shipped();
    expect(check(sign(reviewed), root, reviewed)).toBe('');
  });

  it('rejects any change to another file between the reviewed commit and the release commit', () => {
    const { root, reviewed } = shipped();
    const release = commitFile(root, 'site-content.txt', 'changed after the review\n');
    const errors = check(sign(reviewed), root, release);
    expect(errors).toContain('reviewedCommit [A11Y-REVIEW]');
    expect(errors).toContain('site-content.txt');
  });

  it('allows the review file itself to change after the reviewed commit', () => {
    const { root, reviewed } = shipped();
    const release = commitFile(root, REVIEW_FILE, 'signed again\n');
    expect(check(sign(reviewed), root, release)).toBe('');
  });

  it('rejects a reviewed commit that is not an ancestor of the release commit', () => {
    const { root, reviewed, release } = shipped();
    git(root, 'checkout', '-q', '-b', 'elsewhere', reviewed);
    const sibling = commitFile(root, 'other.txt', 'a different line of history\n');
    git(root, 'checkout', '-q', 'main');
    expect(check(sign(sibling), root, release)).toContain('not an ancestor');
  });

  it('rejects a reviewed commit this checkout does not have, and a release commit it does not have', () => {
    const { root, reviewed, release } = shipped();
    expect(check(sign('f'.repeat(40)), root, release)).toContain('not a commit in this checkout');
    expect(check(sign(reviewed), root, 'e'.repeat(40))).toContain('release commit');
  });

  it('rejects a placeholder or a commit that is not 40 hexadecimal characters', () => {
    const { root, release } = shipped();
    for (const value of ['EXTERNAL_REQUIRED', 'abc123', 'g'.repeat(40), REVIEWED.slice(0, 39), `${REVIEWED}0`]) {
      expect(check(sign(value), root, release), value).toContain('reviewedCommit [A11Y-REVIEW]');
    }
  });

  it('requires the review date to be a real ISO date no later than today (UTC)', () => {
    const { root, reviewed, release } = shipped();
    for (const value of ['EXTERNAL_REQUIRED', 'not a date', '2026-02-31', '14/10/2026', '2026-10-15']) {
      expect(check(sign(reviewed, { reviewedAt: value }), root, release), value).toContain('reviewedAt [A11Y-REVIEW]');
    }
    for (const value of ['2026-10-14', '2026-10-01']) expect(check(sign(reviewed, { reviewedAt: value }), root, release), value).toBe('');
  });

  it('requires the deployment URL to be an https URL', () => {
    const { root, reviewed, release } = shipped();
    for (const value of ['EXTERNAL_REQUIRED', 'http://0a1b2c3d.laptop-to-cluster.pages.dev', 'not a url', 'https://', 'ftp://example.invalid/site']) {
      expect(check(sign(reviewed, { reviewedDeploymentUrl: value }), root, release), value).toContain('reviewedDeploymentUrl [A11Y-REVIEW]');
    }
  });

  it('cannot be checked without the release commit', () => {
    const { root, reviewed } = shipped();
    expect(check(sign(reviewed), root, undefined)).toContain('options.releaseSha');
  });

  it('leaves the frozen v0.1.0 review unaffected: no new fields, no date or commit rules', () => {
    const v010 = reviewProfile('v0.1.0', 'm1-baseline-anvil');
    expect(pendingReview(v010)).not.toHaveProperty('reviewedCommit');
    const signedV010 = { ...review(v010, true), reviewedAt: '2026-07-31' };
    expect(validateAccessibilityReview(signedV010, { version: 'v0.1.0', requireComplete: true })).toEqual([]);
    expect(validateAccessibilityReview({ ...signedV010, reviewedAt: 'July 31' }, { version: 'v0.1.0', requireComplete: true })).toEqual([]);
  });
});

describe('resolveReleaseSha', () => {
  it('takes --release-sha first, then RELEASE_SHA, then GITHUB_SHA, then HEAD', () => {
    const { root, reviewed } = repository();
    const env = { RELEASE_SHA: 'from-release-sha', GITHUB_SHA: 'from-github-sha' };
    expect(resolveReleaseSha(['--release-sha', 'from-argument'], env, root)).toBe('from-argument');
    expect(resolveReleaseSha(['--release-sha=from-equals'], env, root)).toBe('from-equals');
    expect(resolveReleaseSha(['--require-complete'], env, root)).toBe('from-release-sha');
    expect(resolveReleaseSha([], { RELEASE_SHA: '', GITHUB_SHA: 'from-github-sha' }, root)).toBe('from-github-sha');
    expect(resolveReleaseSha([], {}, root)).toBe(reviewed);
  });

  it('returns nothing outside a git checkout when no commit is named', () => {
    const root = mkdtempSync(join(tmpdir(), 'l2c-a11y-nogit-'));
    temporary.push(root);
    expect(resolveReleaseSha([], {}, root)).toBeUndefined();
  });
});
