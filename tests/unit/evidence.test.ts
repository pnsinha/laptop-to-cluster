import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applicabilityRecordSchema } from '../../site/src/content/schema.js';
import {
  evidenceManifestSchema, recordRun, recordRunMetadataSchema, sha256File,
  validateApplicabilityAgainstManifest, validateEvidenceBundle,
} from '../../scripts/evidence.js';

const digest = `sha256:${'a'.repeat(64)}`;
const timestamp = '2026-07-24T12:00:00Z';

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1, evidenceId: 'anvil-success-20260724', evidenceKind: 'success',
    workflowId: 'module-2-baseline', workflowRevision: 'v0.1.0', releaseCandidate: 'v0.1.0',
    environment: { publicName: 'Purdue Anvil', fallback: false }, schedulerVersion: 'Slurm 24.05',
    runtimeVersion: 'Apptainer 1.3.6', containerDigest: digest, submissionId: '12345',
    startedAt: timestamp, endedAt: '2026-07-24T12:05:00Z', nodes: 1, coordinatorCount: 1,
    workerCount: 2, terminalState: 'COMPLETED', exitCode: 0, reviewAfter: '2026-10-24',
    assumptions: ['single node'], limitations: ['not multi-node'], portabilityBoundaries: ['site storage'],
    reviewer: 'Project reviewer', redactValues: ['private-user'], ...overrides,
  };
}

function sourceRun(kind: 'success' | 'readiness-timeout' = 'success') {
  const root = mkdtempSync(join(tmpdir(), 'bssw-evidence-'));
  const run = join(root, 'run');
  mkdirSync(join(run, 'logs'), { recursive: true });
  const events = kind === 'success' ? [
    { event: 'job-start', at: timestamp }, { event: 'coordinator-start', at: timestamp },
    { event: 'coordinator-ready', at: timestamp }, { event: 'worker-start', at: timestamp },
    { event: 'verification-success', at: timestamp },
  ] : [
    { event: 'job-start', at: timestamp }, { event: 'coordinator-start', at: timestamp },
    { event: 'failure', at: timestamp, diagnosticId: 'BSSW-READY-TIMEOUT' },
  ];
  writeFileSync(join(run, 'events.jsonl'), `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
  writeFileSync(join(run, 'versions.txt'), 'slurm=24.05\napptainer=1.3.6\n');
  writeFileSync(join(run, 'logs/verification.log'), kind === 'success' ? '{"status":"verified"}\n' : 'BSSW-READY-TIMEOUT\n');
  if (kind === 'success') {
    writeFileSync(join(run, 'result.json'), '{"schemaVersion":1,"status":"success"}\n');
    writeFileSync(join(run, 'results.json'), '{"schemaVersion":1,"results":[]}\n');
  }
  const scheduler = join(root, 'slurm.out');
  writeFileSync(scheduler, 'account=private-account host=private.example /home/private-user/run\n');
  return { root, run, scheduler, output: join(root, 'evidence') };
}

describe('record-run evidence publisher', () => {
  it('publishes immutable redacted checksummed success evidence', () => {
    const paths = sourceRun();
    const bundle = recordRun({ metadata: metadata(), runDirectory: paths.run, schedulerLog: paths.scheduler, outputRoot: paths.output });
    expect(validateEvidenceBundle(bundle)).toMatchObject({ valid: true, evidenceId: 'anvil-success-20260724', kind: 'success' });
    const scheduler = readFileSync(join(bundle, 'scheduler.log'), 'utf8');
    expect(scheduler).not.toContain('private-account');
    expect(scheduler).not.toContain('private.example');
    expect(scheduler).not.toContain('/home/private-user');
    expect(() => recordRun({ metadata: metadata(), runDirectory: paths.run, schedulerLog: paths.scheduler, outputRoot: paths.output })).toThrow(/immutable evidence already exists/);
  });

  it('detects tampering and records bounded timeout ordering without a success marker', () => {
    const success = sourceRun();
    const bundle = recordRun({ metadata: metadata(), runDirectory: success.run, schedulerLog: success.scheduler, outputRoot: success.output });
    writeFileSync(join(bundle, 'scheduler.log'), 'tampered\n');
    expect(validateEvidenceBundle(bundle).errors.join('\n')).toMatch(/checksum mismatch/);

    const timeout = sourceRun('readiness-timeout');
    const timeoutBundle = recordRun({
      metadata: metadata({ evidenceId: 'anvil-timeout-20260724', evidenceKind: 'readiness-timeout', terminalState: 'FAILED', exitCode: 75 }),
      runDirectory: timeout.run, schedulerLog: timeout.scheduler, outputRoot: timeout.output,
    });
    expect(validateEvidenceBundle(timeoutBundle)).toMatchObject({ valid: true, kind: 'readiness-timeout' });
  });
});

describe('applicability and provenance validation', () => {
  it('enforces primary/fallback semantics', () => {
    expect(() => recordRunMetadataSchema.parse(metadata({
      environment: { publicName: 'SDSC Expanse', fallback: true },
    }))).toThrow(/primary-unavailable reason/);
    expect(recordRunMetadataSchema.parse(metadata({
      environment: { publicName: 'SDSC Expanse', fallback: true, primaryUnavailableReason: 'Anvil allocation was unavailable' },
    })).environment.fallback).toBe(true);
  });

  it('blocks validated status for stale or mismatched evidence', () => {
    const paths = sourceRun();
    const bundle = recordRun({ metadata: metadata(), runDirectory: paths.run, schedulerLog: paths.scheduler, outputRoot: paths.output });
    const manifest = evidenceManifestSchema.parse(JSON.parse(readFileSync(join(bundle, 'manifest.json'), 'utf8')));
    const record = applicabilityRecordSchema.parse({
      id: manifest.evidenceId, workflow_id: manifest.workflowId, status: 'validated',
      environment: { public_name: 'Purdue Anvil', fallback: false, notes: 'ACCESS environment' },
      scheduler: { family: 'Slurm', version: manifest.run.schedulerVersion }, runtime: { name: 'Apptainer', version: manifest.run.runtimeVersion },
      container_digest: manifest.run.containerDigest, workflow_revision: manifest.workflowRevision,
      validation_date: '2026-07-24', execution_date: '2026-07-24', submission_id: manifest.run.submissionId,
      result: { terminal_state: manifest.run.terminalState, exit_code: manifest.run.exitCode, checks: ['verified'] },
      assumptions: manifest.assumptions, limitations: manifest.limitations, portability_boundaries: manifest.portabilityBoundaries,
      evidence: { id: manifest.evidenceId, path: `evidence/${manifest.evidenceId}/manifest.json`, integrity: sha256File(join(bundle, 'manifest.json')) },
      provenance: [{ label: 'recorded workflow', reference: { repository: 'https://github.com/pnsinha/laptop-to-cluster', release: 'v0.1.0', path: 'README.md', integrity: digest } }],
      review_after: manifest.reviewAfter,
    });
    expect(validateApplicabilityAgainstManifest(record, manifest, paths.root, '2026-07-24')).toEqual([]);
    expect(validateApplicabilityAgainstManifest(record, manifest, paths.root, '2027-01-01').join('\n')).toMatch(/stale/);
    expect(validateApplicabilityAgainstManifest({ ...record, workflow_revision: 'v0.1.1' }, manifest, paths.root, '2026-07-24').join('\n')).toMatch(/workflow revision/);
  });
});
