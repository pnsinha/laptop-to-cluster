import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { currentReleaseVersion } from '../../site/src/content/release.js';
import { ELISION_LINE, IMPLEMENTATION_REFERENCE, verbatimExcerptIssues } from '../../site/src/content/implementation.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const SBATCH = 'workflows/baseline-slurm-apptainer/slurm/baseline.sbatch';
const tagged = (): string[] | undefined => {
  try {
    return execFileSync('git', ['show', `${IMPLEMENTATION_REFERENCE.release}:${SBATCH}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n');
  } catch {
    return undefined;
  }
};
const sbatchExcerpts = IMPLEMENTATION_REFERENCE.excerpts.filter((excerpt) => excerpt.sourcePath === SBATCH);

describe('implementation reference carries code excerpts only', () => {
  it('has no expected-output payload and no digest values anywhere', () => {
    expect(IMPLEMENTATION_REFERENCE).not.toHaveProperty('expectedOutput');
    const serialized = JSON.stringify(IMPLEMENTATION_REFERENCE);
    expect(serialized).not.toMatch(/"sha256"\s*:/);
    expect(serialized).not.toMatch(/[a-f0-9]{64}/);
  });

  it('keeps the six release-pinned excerpts and the package links', () => {
    expect(IMPLEMENTATION_REFERENCE.excerpts).toHaveLength(6);
    const release = currentReleaseVersion();
    expect(IMPLEMENTATION_REFERENCE.packageUrl).toContain(`/tree/${release}/workflows/baseline-slurm-apptainer`);
    expect(IMPLEMENTATION_REFERENCE.readmeUrl).toContain(`/blob/${release}/workflows/baseline-slurm-apptainer/README.md`);
    expect(IMPLEMENTATION_REFERENCE.primarySourceUrl).toContain('/blob/v0.1.0/workflows/baseline-slurm-apptainer/slurm/baseline.sbatch');
  });

  it('shows the baseline.sbatch excerpts as the script’s own lines, in the working tree and at the tag', () => {
    expect(sbatchExcerpts.map(({ id }) => id)).toEqual(['sbatch-configuration', 'sbatch-readiness-gate', 'sbatch-worker-verification']);
    const sources = [readFileSync(resolve(root, SBATCH), 'utf8').split('\n'), tagged()].filter((lines): lines is string[] => lines !== undefined);
    expect(sources.length).toBeGreaterThan(0);
    for (const lines of sources) {
      for (const excerpt of sbatchExcerpts) expect(verbatimExcerptIssues(excerpt.code, lines, excerpt.lineStart, excerpt.lineEnd), excerpt.id).toEqual([]);
    }
  });

  it('keeps the endpoint wait bounded and waits on worker process ids, never a bare wait', () => {
    const gate = sbatchExcerpts.find(({ id }) => id === 'sbatch-readiness-gate')!.code;
    const workers = sbatchExcerpts.find(({ id }) => id === 'sbatch-worker-verification')!.code;
    expect(gate).toContain('ENDPOINT_DEADLINE=$((SECONDS + READINESS_TIMEOUT))');
    expect(gate).toContain('BSSW-COORDINATOR-EXIT');
    expect(gate).toContain('BSSW-READY-TIMEOUT');
    expect(workers).toContain('wait "$worker_pid"');
    expect(workers).not.toMatch(/^wait\s*$/m);
    expect(workers).toContain('result is in the job-scoped runtime directory.');
  });

  it('rejects an excerpt line that is missing, reordered or edited', () => {
    const source = ['a', 'b', 'c', 'd', 'e'];
    expect(verbatimExcerptIssues('b\nc\nd', source, 2, 4)).toEqual([]);
    expect(verbatimExcerptIssues(`a\n${ELISION_LINE}\ne`, source, 1, 5)).toEqual([]);
    expect(verbatimExcerptIssues('a\nc', source, 1, 5)).toHaveLength(1);
    expect(verbatimExcerptIssues('b\na', source, 1, 5)).toHaveLength(1);
    expect(verbatimExcerptIssues('b\nc edited', source, 2, 4)).toHaveLength(1);
    expect(verbatimExcerptIssues('b\nc\nd\ne', source, 2, 4)).toHaveLength(1);
  });
});
