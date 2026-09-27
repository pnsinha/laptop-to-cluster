import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applicabilityRecordSchema } from '../../site/src/content/schema.js';
import {
  evidenceManifestSchema, recordRun, recordRunMetadataSchema, recomputeLayeredGate, sha256File,
  validateApplicabilityAgainstManifest, validateEvidenceBundle,
} from '../../scripts/evidence.js';

const layeredFixtures = fileURLToPath(new URL('../fixtures/layered-evidence', import.meta.url));
const zeroDigest = `sha256:${'0'.repeat(64)}`;

function layeredMetadata(overrides: Record<string, unknown> = {}) {
  const submission = (role: string, jobId: string, file: string, endedAt: string) => ({
    jobId, role, schedulerLog: join(layeredFixtures, file), terminalState: 'COMPLETED', exitCode: 0, endedAt,
  });
  return {
    schemaVersion: 1, profile: 'layered-install-trees', evidenceId: 'anvil-layered-dryrun',
    evidenceKind: 'success', workflowId: 'module-5-layered-install-trees',
    workflowRevision: 'v0.2.0', releaseCandidate: 'v0.2.0',
    environment: { publicName: 'Purdue Anvil', fallback: false },
    schedulerVersion: 'slurm UNKNOWN-DRYRUN', runtimeVersion: 'apptainer UNKNOWN-DRYRUN',
    secondaryRuntimeVersion: 'charliecloud 0.38', containerDigest: zeroDigest,
    submissionId: '19806294', startedAt: '2026-08-12T01:17:15Z', endedAt: '2026-08-12T01:17:20Z',
    terminalState: 'COMPLETED', exitCode: 0, reviewAfter: '2026-12-31',
    submissions: [
      submission('provider-build', '19747042', 'provider-19747042.out', '2026-08-08T15:50:00Z'),
      submission('specialized-build', '19747874', 'specialized-19747874.out', '2026-08-09T09:24:00Z'),
      submission('apptainer-compose-gpu', '19806294', 'gpu-compose-19806294.out', '2026-08-12T01:17:20Z'),
      submission('charliecloud-compose', '19831461', 'ch-compose2-19831461.out', '2026-08-12T13:52:29Z'),
      submission('charliecloud-gpu', '19831573', 'ch-cuda-fn-19831573.out', '2026-08-12T14:09:48Z'),
      submission('startup-cost', '20509657', 'r4-startup-20509657-1.out', '2026-09-08T22:40:49Z'),
    ],
    artifacts: [{ source: join(layeredFixtures, 'concretize-specialized.txt'), target: 'artifacts/concretize-specialized.txt' }],
    gates: [
      { name: 'spack-reuse', jobId: '19747874', artifact: 'artifacts/concretize-specialized.txt', passed: true, detail: 'declared', expected: { reused: 19, built: 1 } },
      { name: 'no-unresolved-symbols', jobId: '19806294', artifact: 'scheduler/apptainer-compose-gpu-19806294.log', passed: true, detail: 'declared' },
      { name: 'gpu-checksum', jobId: '19806294', artifact: 'scheduler/apptainer-compose-gpu-19806294.log', passed: true, detail: 'declared' },
      {
        name: 'runtime-replication', jobId: '19831573', artifact: 'scheduler/charliecloud-gpu-19831573.log',
        artifactSecondary: 'scheduler/charliecloud-compose-19831461.log', passed: true, detail: 'declared',
        allowedUnresolved: ['libmpi.so.12'],
        reason: 'container-external MPI absent from the minimal rootfs; not a mechanism failure',
      },
    ],
    assumptions: ['Anvil GPFS scratch persists the canonical trees'],
    limitations: ['Anvil evidence only'],
    portabilityBoundaries: ['site scratch, account, GPU partition, runtime modules'],
    reviewer: 'Project reviewer', redactValues: [], ...overrides,
  };
}

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

describe('layered-install-trees evidence profile', () => {
  const gate = (overrides: Record<string, unknown> = {}) => ({
    name: 'spack-reuse', jobId: '19747874', artifact: 'concretize-specialized.txt',
    passed: true, detail: 'declared', expected: { reused: 19, built: 1 }, ...overrides,
  } as Parameters<typeof recomputeLayeredGate>[0]);

  it('recomputes each gate from its artifact without trusting the declared flag', () => {
    expect(recomputeLayeredGate(gate(), layeredFixtures)).toMatchObject({ passed: true, detail: '19 of 20 buildable reused (95.0%)' });
    expect(recomputeLayeredGate(gate({ expected: { reused: 18, built: 1 } }), layeredFixtures).passed).toBe(false);
    expect(recomputeLayeredGate(gate({ name: 'no-unresolved-symbols', expected: undefined, artifact: 'gpu-compose-19806294.out' }), layeredFixtures).passed).toBe(true);
    expect(recomputeLayeredGate(gate({ name: 'no-unresolved-symbols', expected: undefined, artifact: 'ch-compose2-19831461.out' }), layeredFixtures).passed).toBe(false);
    expect(recomputeLayeredGate(gate({ name: 'gpu-checksum', expected: undefined, artifact: 'gpu-compose-19806294.out' }), layeredFixtures).passed).toBe(true);
    expect(recomputeLayeredGate(gate({ name: 'gpu-checksum', expected: undefined, artifact: 'ch-compose2-19831461.out' }), layeredFixtures).passed).toBe(false);
    const replication = gate({
      name: 'runtime-replication', expected: undefined, artifact: 'ch-cuda-fn-19831573.out',
      artifactSecondary: 'ch-compose2-19831461.out', allowedUnresolved: ['libmpi.so.12'],
    });
    expect(recomputeLayeredGate(replication, layeredFixtures).passed).toBe(true);
    expect(recomputeLayeredGate(gate({ ...replication, allowedUnresolved: [] }), layeredFixtures).passed).toBe(false);
  });

  it('parses both profiles and enforces layered-only invariants', () => {
    expect(recordRunMetadataSchema.parse(metadata()).profile).toBe('baseline-service-workers');
    expect(recordRunMetadataSchema.parse(layeredMetadata()).profile).toBe('layered-install-trees');
    expect(() => recordRunMetadataSchema.parse(layeredMetadata({ evidenceKind: 'readiness-timeout' }))).toThrow(/success evidence only/);
    expect(() => recordRunMetadataSchema.parse(metadata({ submissions: [] }))).toThrow();
    expect(() => recordRunMetadataSchema.parse(layeredMetadata({ secondaryRuntimeVersion: undefined }))).toThrow(/secondaryRuntimeVersion/);
    expect(() => recordRunMetadataSchema.parse(layeredMetadata({ submissionId: '999999' }))).toThrow(/apptainer-compose-gpu/);
    expect(() => recordRunMetadataSchema.parse(layeredMetadata({
      gates: [{ name: 'spack-reuse', jobId: '19747874', artifact: 'artifacts/concretize-specialized.txt', passed: true, detail: 'd', expected: { reused: 19, built: 1 } }],
    }))).toThrow();
  });

  it('records a layered bundle from a dry run and validates it', () => {
    const root = mkdtempSync(join(tmpdir(), 'bssw-layered-'));
    const bundle = recordRun({
      metadata: layeredMetadata(), runDirectory: root,
      schedulerLog: join(layeredFixtures, 'gpu-compose-19806294.out'), outputRoot: join(root, 'evidence'),
    });
    const manifest = evidenceManifestSchema.parse(JSON.parse(readFileSync(join(bundle, 'manifest.json'), 'utf8')));
    expect(manifest.profile).toBe('layered-install-trees');
    expect(manifest.run.submissionId).toBe('19806294');
    expect(manifest.run.secondaryRuntimeVersion).toBe('charliecloud 0.38');
    expect(manifest.run.submissions).toHaveLength(6);
    expect(manifest.gates).toHaveLength(4);
    expect(manifest.events.map((event) => event.type)).toEqual([
      'provider-built', 'specialized-built', 'composed', 'runtime-replicated', 'gpu-verified', 'composed',
    ]);
    expect(validateEvidenceBundle(bundle)).toMatchObject({ valid: true, evidenceId: 'anvil-layered-dryrun' });
  });

  it('rejects layered bundles with unknown gate jobIds or out-of-order events', () => {
    const root = mkdtempSync(join(tmpdir(), 'bssw-layered-'));
    expect(() => recordRun({
      metadata: layeredMetadata({ gates: [gate({ name: 'spack-reuse', jobId: '999999', artifact: 'artifacts/concretize-specialized.txt' }), ...layeredMetadata().gates.slice(1)] }),
      runDirectory: root, schedulerLog: join(layeredFixtures, 'gpu-compose-19806294.out'), outputRoot: join(root, 'evidence'),
    })).toThrow(/not a recorded submission/);
    const reversed = layeredMetadata().submissions;
    [reversed[0], reversed[1]] = [reversed[1], reversed[0]];
    expect(() => recordRun({
      metadata: layeredMetadata({ submissions: reversed }),
      runDirectory: mkdtempSync(join(tmpdir(), 'bssw-layered-')), schedulerLog: join(layeredFixtures, 'gpu-compose-19806294.out'),
      outputRoot: join(mkdtempSync(join(tmpdir(), 'bssw-layered-')), 'evidence'),
    })).toThrow(/event ordering/);
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
