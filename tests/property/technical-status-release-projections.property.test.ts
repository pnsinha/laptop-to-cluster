import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applicabilityRecordSchema,
  contentItemSchema,
  releaseRecordSchema,
} from '../../site/src/content/schema.js';
import {
  projectApplicabilityForItem,
  projectReleaseChanges,
} from '../../site/src/content/projections.js';

const digest = `sha256:${'a'.repeat(64)}`;
const token = fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), {
  minLength: 1,
  maxLength: 10,
}).map((characters) => characters.join(''));
const isoDate = fc.integer({ min: 0, max: 365 }).map((offset) => {
  const date = new Date(Date.UTC(2026, 0, 1 + offset));
  return date.toISOString().slice(0, 10);
});
const maturity = fc.constantFrom('draft' as const, 'validated' as const, 'published' as const,
  'superseded' as const, 'archived' as const);
const validationStatus = fc.constantFrom('validated' as const, 'failed' as const,
  'unvalidated' as const, 'stale' as const);
const environment = fc.constantFrom('Purdue Anvil' as const, 'SDSC Expanse' as const);
const technicalKind = fc.constantFrom('workflow' as const, 'launch-template' as const);

const technicalSeed = fc.record({
  token, kind: technicalKind, maturity, validationStatus, validationDate: isoDate,
  lastReviewed: isoDate, environment,
  applicableRelease: fc.tuple(fc.nat(4), fc.nat(9), fc.nat(9))
    .map(([major, minor, patch]) => `v${major}.${minor}.${patch}`),
  schedulerVersion: fc.tuple(fc.nat(99), fc.nat(99)).map(([major, minor]) => `${major}.${minor}`),
  runtimeVersion: fc.tuple(fc.nat(9), fc.nat(99)).map(([major, minor]) => `${major}.${minor}`),
});

const technicalCases = fc.uniqueArray(technicalSeed, {
  minLength: 1,
  maxLength: 8,
  selector: ({ token: value }) => value,
}).map((seeds) => seeds.map((seed, index) => {
  const id = `${seed.kind}-${seed.token}`;
  const applicabilityId = `app-${seed.token}`;
  const published = ['published', 'superseded', 'archived'].includes(seed.maturity);
  const result = seed.validationStatus === 'validated'
    ? { terminal_state: 'COMPLETED', exit_code: 0, checks: ['result schema'] }
    : { terminal_state: 'FAILED', exit_code: 1, checks: ['diagnostic recorded'] };
  const common = {
    id, stable_slug: `${seed.kind}-${seed.token}`, title: `Technical ${index}`,
    summary: `Traceable technical item ${index}`, topics: ['hpc'], keywords: ['traceability'],
    audiences: ['practitioners'], milestone: 1 as const, status: seed.maturity,
    ...(published ? { publication_date: '2026-01-01' } : {}),
    ...(seed.maturity === 'superseded' ? { successor_id: `successor-${seed.token}` } : {}),
    last_reviewed: seed.lastReviewed, applicable_release: seed.applicableRelease,
    supporting_artifacts: [], schedulers: ['slurm' as const],
    container_runtimes: ['apptainer' as const], related: [],
    applicability_records: [applicabilityId], authority: [], revisions: [],
  };
  const rawItem = seed.kind === 'workflow' ? {
    ...common, artifact_type: 'learning-module' as const, module_number: index + 1,
    module_type: 'runnable' as const, learning_outcomes: ['Run the workflow'], prerequisites: [],
    section_kinds: ['concept', 'procedure', 'expected-result', 'limitations', 'next-steps'] as const,
    required_resources: ['one node'], estimated_minutes: 15,
    completion_check: { kind: 'result' as const, text: 'Verifier reports success' },
    validation_status: seed.validationStatus, validation_date: seed.validationDate,
    unvalidated_scopes: [],
  } : { ...common, artifact_type: 'template' as const };
  const rawApplicability = {
    id: applicabilityId, workflow_id: id, status: seed.validationStatus,
    environment: { public_name: seed.environment, fallback: seed.environment === 'SDSC Expanse', notes: 'Public test environment' },
    scheduler: { family: 'slurm', version: seed.schedulerVersion },
    runtime: { name: 'apptainer', version: seed.runtimeVersion },
    container_digest: digest, workflow_revision: seed.applicableRelease,
    validation_date: seed.validationDate, execution_date: seed.validationDate,
    submission_id: `submission-${seed.token}`, result,
    assumptions: ['single node'], limitations: ['site policy'], portability_boundaries: ['storage'],
    evidence: { id: `evidence-${seed.token}`, path: `evidence/${seed.token}/manifest.json`, integrity: digest },
    provenance: [{ label: 'generated source', reference: { repository: 'https://github.com/example/project', release: 'v0.1.0', path: 'README.md', integrity: digest } }],
    review_after: '2027-12-31',
  };
  return { item: contentItemSchema.parse(rawItem), applicability: applicabilityRecordSchema.parse(rawApplicability) };
}));

const changeClass = fc.constantFrom('added' as const, 'changed' as const,
  'deprecated' as const, 'corrected' as const);
const changeSeed = fc.record({
  class: changeClass,
  token,
  material: fc.boolean(),
  reason: token,
  environment: token,
  migration: token,
}).map((seed) => seed.class === 'changed' && seed.material ? {
  class: seed.class, item_id: `item-${seed.token}`, material: true,
  reason: `Reason ${seed.reason}`, affected_environments: [`Environment ${seed.environment}`],
  migration: `Migration ${seed.migration}`,
} : {
  class: seed.class, item_id: `item-${seed.token}`, material: false,
  affected_environments: [],
});
const releaseSeed = fc.record({
  version: fc.tuple(fc.nat(9), fc.nat(9), fc.nat(9))
    .map(([major, minor, patch]) => `v${major}.${minor}.${patch}`),
  changes: fc.uniqueArray(changeSeed, {
    minLength: 1,
    maxLength: 16,
    selector: (change) => `${change.class}:${change.item_id}`,
  }),
});
const releaseCases = fc.uniqueArray(releaseSeed, {
  minLength: 1,
  maxLength: 6,
  selector: ({ version }) => version,
}).map((seeds) => seeds.map(({ version, changes }, index) => releaseRecordSchema.parse({
  id: `release-${version}`, version, published_at: '2026-07-31', site_commit: `${index}`.repeat(40),
  repository: { repository: 'https://github.com/example/project', release: `refs/tags/${version}`, path: 'README.md', integrity: digest },
  url_manifest_sha256: digest, site_artifact_sha256: digest, artifact_file_manifest_sha256: digest,
  cloudflare_deployment_id: `deployment-${index}`, pages_dev_fallback_url: `https://release-${index}.pages.dev`,
  canonical_origin: 'https://laptop-to-cluster.org', evidence_ids: [`evidence-${index}`], changes,
})));

// Mirror the projection's documented entry shape exactly. The `class` discriminator
// is intentionally omitted here because the projection represents it as the map key
// (classes.added, classes.changed, ...), not as a field on each entry. Spreading the
// parsed change object would leak `class` and diverge from ReleaseChangeProjection.
const normalizeChange = (change: {
  item_id: string; reason?: string; affected_environments: string[]; migration?: string; material: boolean;
}) => ({
  item_id: change.item_id,
  reason: change.reason,
  affected_environments: [...change.affected_environments].sort(),
  migration: change.migration,
  material: change.material,
});

describe('Property 16: Technical status and release projections are traceable', () => {
  it('preserves technical status/applicability and classifies each release change exactly once', () => {
    // Feature: bssw-fellowship-resource-site, Property 16: Technical status and release projections are traceable
    // **Validates: Requirements 12.1, 12.2, 12.3, 13.7**
    fc.assert(fc.property(technicalCases, releaseCases, (technical, releases) => {
      for (const { item, applicability } of technical) {
        expect(item).toMatchObject({
          status: item.status, applicable_release: item.applicable_release, last_reviewed: item.last_reviewed,
        });
        if (item.artifact_type === 'learning-module') {
          const projected = projectApplicabilityForItem(item, [applicability], 'runnable-module')!;
          expect(projected).toMatchObject({
            projectionId: `runnable-module:${applicability.id}`,
            consumer: 'runnable-module', recordId: applicability.id,
            canonicalPath: `/applicability/${applicability.id}/`,
          });
          expect(Object.keys(projected).sort()).toEqual([
            'canonicalPath', 'consumer', 'projectionId', 'recordId', 'supplement', 'testedScope',
          ]);
          expect(projected.supplement.kind).toBe(
            applicability.status === 'validated' ? 'boundary' : 'status',
          );
          expect(JSON.stringify(projected)).not.toContain(applicability.scheduler.version);
          expect(JSON.stringify(projected)).not.toContain(applicability.runtime.version);
          expect(JSON.stringify(projected)).not.toContain(applicability.evidence.path);
        } else {
          expect(() => projectApplicabilityForItem(item, [applicability], 'runnable-module'))
            .toThrow(/not allowed/);
        }
      }

      const releaseProjection = projectReleaseChanges(releases);
      expect(releaseProjection).toHaveLength(releases.length);
      const projectedReleaseByVersion = new Map(releaseProjection.map((entry) => [entry.release, entry]));
      for (const release of releases) {
        const projected = projectedReleaseByVersion.get(release.version)!;
        let projectedCount = 0;
        for (const classification of ['added', 'changed', 'deprecated', 'corrected'] as const) {
          const expected = release.changes.filter((change) => change.class === classification)
            .map(normalizeChange).sort((left, right) => left.item_id.localeCompare(right.item_id));
          expect(projected.classes[classification]).toEqual(expected);
          projectedCount += projected.classes[classification].length;
        }
        expect(projectedCount).toBe(release.changes.length);
        for (const change of projected.classes.changed.filter(({ material }) => material)) {
          expect(change.reason).toBeTruthy();
          expect(change.affected_environments.length).toBeGreaterThan(0);
          expect(change.migration).toBeTruthy();
        }
      }
    }), { numRuns: 200 });
  });
});
