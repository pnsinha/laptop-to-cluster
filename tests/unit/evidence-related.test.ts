import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applicabilityRecordSchema, type ApplicabilityRecord } from '../../site/src/content/schema.js';
import {
  evidenceManifestSchema, recordRun, reviewDeadline, sha256File, supersessionErrors,
  validateApplicabilityAgainstManifest, validateEvidenceRepository, validateRelatedEvidence,
} from '../../scripts/evidence.js';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const digest = `sha256:${'a'.repeat(64)}`;
const timestamp = '2026-07-24T12:00:00Z';

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1, evidenceId: 'fixture-success', evidenceKind: 'success',
    workflowId: 'module-2-baseline', workflowRevision: 'v0.1.0', releaseCandidate: 'v0.1.0',
    environment: { publicName: 'Purdue Anvil', fallback: false }, schedulerVersion: 'slurm 1.0',
    runtimeVersion: 'apptainer 1.0', containerDigest: digest, submissionId: '1001',
    startedAt: timestamp, endedAt: '2026-07-24T12:05:00Z', nodes: 1, coordinatorCount: 1,
    workerCount: 2, terminalState: 'COMPLETED', exitCode: 0, reviewAfter: '2026-10-24',
    assumptions: ['single node'], limitations: ['not multi-node'], portabilityBoundaries: ['site storage'],
    reviewer: 'Project reviewer', redactValues: [], ...overrides,
  };
}

function sourceRun(root: string, name: string, kind: 'success' | 'readiness-timeout') {
  const run = join(root, name);
  mkdirSync(join(run, 'logs'), { recursive: true });
  const events = kind === 'success'
    ? ['coordinator-start', 'coordinator-ready', 'worker-start', 'verification-success'].map((event) => ({ event, at: timestamp }))
    : [{ event: 'coordinator-start', at: timestamp }, { event: 'failure', at: timestamp, diagnosticId: 'BSSW-READY-TIMEOUT' }];
  writeFileSync(join(run, 'events.jsonl'), `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
  writeFileSync(join(run, 'versions.txt'), 'slurm=1.0\napptainer=1.0\n');
  writeFileSync(join(run, 'logs/coordinator.log'), 'started\n');
  if (kind === 'success') {
    writeFileSync(join(run, 'result.json'), '{"schemaVersion":1,"status":"success"}\n');
    writeFileSync(join(run, 'results.json'), '{"schemaVersion":1,"results":[]}\n');
  }
  const scheduler = join(root, `${name}.out`);
  writeFileSync(scheduler, `${kind}\n`);
  return { run, scheduler };
}

/** A success bundle, a timeout bundle from a different submission and date, and a record that links both. */
function fixture(timeoutOverrides: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bssw-related-'));
  const output = join(root, 'evidence');
  const success = sourceRun(root, 'success-run', 'success');
  const timeout = sourceRun(root, 'timeout-run', 'readiness-timeout');
  const successBundle = recordRun({ metadata: metadata(), runDirectory: success.run, schedulerLog: success.scheduler, outputRoot: output });
  const timeoutBundle = recordRun({
    metadata: metadata({
      evidenceId: 'fixture-timeout', evidenceKind: 'readiness-timeout', terminalState: 'FAILED', exitCode: 75,
      submissionId: '2002', startedAt: '2026-07-26T09:00:00Z', endedAt: '2026-07-26T09:00:02Z', reviewAfter: '2026-12-31',
      ...timeoutOverrides,
    }),
    runDirectory: timeout.run, schedulerLog: timeout.scheduler, outputRoot: output,
  });
  const manifest = evidenceManifestSchema.parse(JSON.parse(readFileSync(join(successBundle, 'manifest.json'), 'utf8')));
  const reference = (bundle: string, id: string) => ({
    id, path: relative(root, join(bundle, 'manifest.json')), integrity: sha256File(join(bundle, 'manifest.json')),
  });
  const record = applicabilityRecordSchema.parse({
    id: 'fixture-run', workflow_id: manifest.workflowId, status: 'validated',
    environment: { public_name: 'Purdue Anvil', fallback: false, notes: 'Fixture environment.' },
    scheduler: { family: 'Slurm', version: manifest.run.schedulerVersion }, runtime: { name: 'Apptainer', version: manifest.run.runtimeVersion },
    container_digest: manifest.run.containerDigest, workflow_revision: manifest.workflowRevision,
    validation_date: '2026-07-24', execution_date: '2026-07-24', submission_id: manifest.run.submissionId,
    result: { terminal_state: 'COMPLETED', exit_code: 0, checks: ['verified'] },
    assumptions: manifest.assumptions, limitations: manifest.limitations, portability_boundaries: manifest.portabilityBoundaries,
    evidence: reference(successBundle, 'fixture-success'),
    related_evidence: [{ ...reference(timeoutBundle, 'fixture-timeout'), role: 'negative-test' }],
    provenance: [{ label: 'fixture', reference: { repository: 'https://github.com/pnsinha/laptop-to-cluster', release: 'v0.1.0', path: 'README.md', integrity: digest } }],
    review_after: manifest.reviewAfter,
  });
  return { root, record, manifest, timeoutBundle };
}

describe('related negative-test evidence', () => {
  it('accepts a matching timeout bundle without comparing submission, terminal state, dates, or review date', () => {
    const { root, record } = fixture();
    expect(validateRelatedEvidence(record, root)).toEqual([]);
  });

  it('rejects tampered, misidentified, or wrong-kind bundles', () => {
    const { root, record, timeoutBundle } = fixture();
    const related = record.related_evidence[0];
    expect(validateRelatedEvidence({ ...record, related_evidence: [{ ...related, integrity: digest }] }, root).join('\n'))
      .toMatch(/related_evidence\.0\.integrity does not match manifest/);
    expect(validateRelatedEvidence({ ...record, related_evidence: [{ ...related, id: 'renamed' }] }, root).join('\n'))
      .toMatch(/evidence ID does not match manifest/);
    expect(validateRelatedEvidence({ ...record, related_evidence: [{ ...related, path: record.evidence.path, integrity: record.evidence.integrity, id: 'fixture-success' }] }, root).join('\n'))
      .toMatch(/requires readiness-timeout evidence/);
    writeFileSync(join(timeoutBundle, 'scheduler.log'), 'tampered\n');
    expect(validateRelatedEvidence(record, root).join('\n')).toMatch(/checksum mismatch/);
  });

  it('requires the workflow, revision, image digest, and environment to agree with the record', () => {
    const { root, record } = fixture();
    const cases: Array<[Partial<ApplicabilityRecord>, RegExp]> = [
      [{ workflow_id: 'module-9-other' }, /workflow ID does not match the record/],
      [{ workflow_revision: 'v0.1.1' }, /workflow revision does not match the record/],
      [{ container_digest: `sha256:${'f'.repeat(64)}` }, /container digest does not match the record/],
      [{ environment: { public_name: 'SDSC Expanse', fallback: true, notes: 'Fallback.' } }, /representative environment does not match the record/],
    ];
    for (const [change, message] of cases) expect(validateRelatedEvidence({ ...record, ...change }, root).join('\n')).toMatch(message);
  });
});

describe('review deadline and supersession', () => {
  it('exempts a superseded record from staleness and honours a review extension', () => {
    const { root, record, manifest } = fixture();
    expect(validateApplicabilityAgainstManifest(record, manifest, root, '2027-01-01').join('\n')).toMatch(/stale after 2026-10-24/);
    expect(validateApplicabilityAgainstManifest({ ...record, superseded_by: 'fixture-run-2' }, manifest, root, '2027-01-01')).toEqual([]);
    const extended = { ...record, review_extension: { reviewed_by: 'Project reviewer', reviewed_on: '2026-10-13', review_by: '2027-03-01', scope_note: 'Describes the July run.' } };
    expect(reviewDeadline(extended)).toBe('2027-03-01');
    expect(validateApplicabilityAgainstManifest(extended, manifest, root, '2027-01-01')).toEqual([]);
    expect(validateApplicabilityAgainstManifest(extended, manifest, root, '2027-04-01').join('\n')).toMatch(/stale after 2027-03-01/);
    expect(validateApplicabilityAgainstManifest({ ...extended, review_after: '2026-11-30' }, manifest, root, '2027-01-01').join('\n'))
      .toMatch(/review-after date does not match manifest/);
  });

  it('requires superseded_by to name a later record for the same workflow', () => {
    const { record } = fixture();
    const successor = { ...record, id: 'fixture-run-2', validation_date: '2026-10-08', execution_date: '2026-10-08' };
    expect(supersessionErrors([{ ...record, superseded_by: 'fixture-run-2' }, successor])).toEqual([]);
    expect(supersessionErrors([{ ...record, superseded_by: 'missing-run' }]).join('\n')).toMatch(/missing applicability record missing-run/);
    expect(supersessionErrors([{ ...record, superseded_by: 'fixture-run-2' }, { ...successor, workflow_id: 'other' }]).join('\n')).toMatch(/belongs to other/);
    expect(supersessionErrors([{ ...record, superseded_by: 'fixture-run-2' }, { ...successor, validation_date: '2026-07-01' }]).join('\n')).toMatch(/was validated before/);
    expect(supersessionErrors([{ ...record, superseded_by: 'fixture-run-2' }, { ...successor, superseded_by: 'fixture-run' }]).join('\n')).toMatch(/supersede each other/);
  });

  it('keeps the published repository evidence valid', () => {
    expect(validateEvidenceRepository(repositoryRoot, '2026-10-04')).toEqual([]);
  });
});
