import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { REPOSITORY_URL, provenanceIntegrityErrors, validateEvidenceRepository } from '../../scripts/evidence.js';
import { applicabilityRecordSchema, type ApplicabilityRecord } from '../../site/src/content/schema.js';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

const sha = (content: string) => `sha256:${createHash('sha256').update(content).digest('hex')}`;
const gitEnv = { PATH: process.env.PATH ?? '', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
function git(cwd: string, ...args: string[]) {
  const result = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', env: gitEnv });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

const TAGGED = 'The README as it was tagged.\n';
const LATER = 'The README after the tag moved on.\n';
/** A repository whose v0.1.0 tag holds one README, and whose working tree has since moved on. */
function repository() {
  const root = mkdtempSync(join(tmpdir(), 'l2c-provenance-'));
  temporary.push(root);
  git(root, 'init', '-q', '-b', 'main');
  mkdirSync(join(root, 'workflows/example'), { recursive: true });
  writeFileSync(join(root, 'workflows/example/README.md'), TAGGED);
  git(root, 'add', '--all');
  git(root, 'commit', '-q', '-m', 'tagged content');
  git(root, 'tag', 'v0.1.0');
  writeFileSync(join(root, 'workflows/example/README.md'), LATER);
  git(root, 'commit', '-q', '-am', 'later content');
  return root;
}

const reference = (overrides: Record<string, string> = {}) => ({
  repository: REPOSITORY_URL, release: 'v0.1.0', path: 'workflows/example/README.md', integrity: sha(TAGGED), ...overrides,
});
const recordWith = (...references: Array<ReturnType<typeof reference>>) => ({
  id: 'fixture-record', provenance: references.map((entry, index) => ({ label: `source ${index + 1}`, reference: entry })),
}) as unknown as ApplicabilityRecord;

describe('provenance integrity against the tagged files', () => {
  it('accepts a provenance hash that matches the file at its release, not the working tree', () => {
    const root = repository();
    const warnings: string[] = [];
    expect(provenanceIntegrityErrors(recordWith(reference()), { root, ci: true, warn: (message) => warnings.push(message) })).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('rejects a planted mismatch and names the record, entry, release, path and both hashes', () => {
    const root = repository();
    const errors = provenanceIntegrityErrors(recordWith(reference(), reference({ integrity: sha(LATER) })), { root, ci: true, warn: () => undefined });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('fixture-record.provenance.1');
    expect(errors[0]).toContain('v0.1.0:workflows/example/README.md');
    expect(errors[0]).toContain(sha(TAGGED));
    expect(errors[0]).toContain(sha(LATER));
  });

  it('rejects a path that does not exist at the release', () => {
    const root = repository();
    const errors = provenanceIntegrityErrors(recordWith(reference({ path: 'workflows/example/MISSING.md' })), { root, ci: true, warn: () => undefined });
    expect(errors.join('\n')).toMatch(/fixture-record\.provenance\.0.*workflows\/example\/MISSING\.md.*not in v0\.1\.0/);
  });

  it('checks the repository URL however it is written, and ignores other repositories', () => {
    const root = repository();
    const wrong = sha(LATER);
    for (const repo of [`${REPOSITORY_URL}.git`, `${REPOSITORY_URL}/`, REPOSITORY_URL.toUpperCase().replace('HTTPS', 'https')]) {
      expect(provenanceIntegrityErrors(recordWith(reference({ repository: repo, integrity: wrong })), { root, ci: true, warn: () => undefined }), repo).toHaveLength(1);
    }
    const warnings: string[] = [];
    expect(provenanceIntegrityErrors(recordWith(reference({ repository: 'https://github.com/example/project', integrity: wrong, release: 'v9.9.9' })), { root, ci: true, warn: (message) => warnings.push(message) })).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('fails under CI when the release is missing locally, and only warns elsewhere', () => {
    const root = repository();
    const entry = recordWith(reference({ release: 'v9.9.9' }));
    const inCi = provenanceIntegrityErrors(entry, { root, ci: true, warn: () => undefined });
    expect(inCi).toHaveLength(1);
    expect(inCi[0]).toMatch(/fixture-record\.provenance\.0.*v9\.9\.9 is not available in this checkout.*fetch/i);
    const warnings: string[] = [];
    expect(provenanceIntegrityErrors(entry, { root, ci: false, warn: (message) => warnings.push(message) })).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('v9.9.9');
  });

  it('is part of the repository evidence validation, with CI taken from the environment by default', () => {
    expect(validateEvidenceRepository(repositoryRoot, '2026-10-04', { warn: () => undefined })).toEqual([]);
  });

  it('keeps every published record in step with the files at the release it cites', () => {
    const directory = join(repositoryRoot, 'site/src/content/applicability');
    const records = readdirSync(directory).filter((name) => /\.ya?ml$/.test(name))
      .map((name) => applicabilityRecordSchema.parse(parse(readFileSync(join(directory, name), 'utf8'))));
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) expect(provenanceIntegrityErrors(record, { root: repositoryRoot, warn: () => undefined }), record.id).toEqual([]);
  });
});
