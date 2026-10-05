import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { REQUIRED_SCRIPTS, isStrict, releaseFileIssues } from '../../scripts/validate-repository';
import { releaseWorkflowIssues } from '../../scripts/validate-release';
import { RELEASE } from './helpers/release-workflow-fixture';

const root = new URL('../..', import.meta.url).pathname;
const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
function tree(files: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), 'bssw-release-scripts-'));
  temporary.push(directory);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(directory, path, '..'), { recursive: true });
    writeFileSync(join(directory, path), content);
  }
  return directory;
}
const FROZEN = "on:\n  push:\n    tags: ['v0.1.0']\njobs:\n  build-once:\n    steps:\n      - uses: actions/checkout@v4.2.2\n        with: { fetch-depth: 0, ref: v0.1.0 }\n";

describe('validate-repository', () => {
  it('is strict only under CI or RELEASE_STRICT', () => {
    expect(isStrict({})).toBe(false);
    expect(isStrict({ CI: 'true' })).toBe(true);
    expect(isStrict({ RELEASE_STRICT: '1' })).toBe(true);
    expect(REQUIRED_SCRIPTS).toContain('validate:boundary');
  });

  it('always requires the frozen v0.1.0 record and the current candidate file', () => {
    const files = { 'releases/v0.1.0/release-candidate.json': '{}', 'releases/v0.1.0/accessibility-review.yml': 'a: 1' };
    const missing = releaseFileIssues(tree(files), 'v0.2.0', false);
    expect(missing.errors.join('\n')).toContain('releases/v0.2.0/release-candidate.json');
    const noHistory = releaseFileIssues(tree({ 'releases/v0.2.0/release-candidate.json': '{}' }), 'v0.2.0', false);
    expect(noHistory.errors.join('\n')).toContain('releases/v0.1.0/release-candidate.json');
  });

  it('downgrades the review, the notes and release.yml to warnings until strict', () => {
    const files = { 'releases/v0.1.0/release-candidate.json': '{}', 'releases/v0.1.0/accessibility-review.yml': 'a: 1', 'releases/v0.2.0/release-candidate.json': '{}' };
    const lenient = releaseFileIssues(tree(files), 'v0.2.0', false);
    expect(lenient.errors).toEqual([]);
    expect(lenient.warnings.join('\n')).toMatch(/accessibility-review\.yml[\s\S]*RELEASE_NOTES\.md[\s\S]*release\.yml/);
    const strict = releaseFileIssues(tree(files), 'v0.2.0', true);
    expect(strict.warnings).toEqual([]);
    expect(strict.errors).toHaveLength(3);
    expect(releaseFileIssues(tree(files), 'v0.1.0', true).errors).toEqual([]);
  });
});

describe('validate-release workflow gating', () => {
  it('warns before W8 and fails under CI, and accepts the real shape', () => {
    const none = tree({ '.github/workflows/publication.yml': FROZEN });
    expect(releaseWorkflowIssues(none, false).errors).toEqual([]);
    expect(releaseWorkflowIssues(none, false).warnings.join('\n')).toMatch(/release workflow is missing/);
    expect(releaseWorkflowIssues(none, true).errors.join('\n')).toMatch(/RELEASE-WORKFLOW/);
    const good = tree({ '.github/workflows/publication.yml': FROZEN, '.github/workflows/release.yml': RELEASE });
    expect(releaseWorkflowIssues(good, true)).toEqual({ errors: [], warnings: [] });
    const unpinned = tree({ '.github/workflows/publication.yml': FROZEN.replace(', ref: v0.1.0', ''), '.github/workflows/release.yml': RELEASE });
    expect(releaseWorkflowIssues(unpinned, true).errors.join('\n')).toMatch(/FROZEN-RELEASE/);
  });
});

describe('package scripts', () => {
  it('resolves the accessibility review path from the release version, not from v0.1.0', () => {
    const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;
    expect(scripts['validate:accessibility-review']).toBe('tsx scripts/validate-accessibility-review.ts releases/$(node scripts/publication.mjs release-version)/accessibility-review.yml');
    expect(scripts['validate:accessibility-review']).not.toContain('v0.1.0');
  });
});
