import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  applicabilityRecordSchema,
  attributionSchema,
  contentItemSchema,
  parseContentItem,
  publicationMediaSchema,
  releaseRecordSchema,
} from '../../site/src/content/schema.js';
import {
  RegistryValidationError,
  canonicalPath,
  generateCanonicalRoutes,
  resolveRepoRef,
  validateRedirects,
  validateRegistry,
} from '../../site/src/content/registry.js';
import {
  projectDiscovery,
  projectMilestones,
  projectModuleNavigation,
  projectApplicabilityForItem,
  projectNoResultState,
  projectReleaseChanges,
} from '../../site/src/content/projections.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const digest = `sha256:${'a'.repeat(64)}`;
const evidence = { id: 'evidence-1', path: 'evidence/run-1/manifest.json', integrity: digest };

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'guide-1', stable_slug: 'guide-one', title: 'Guide one', summary: 'A useful guide',
    artifact_type: 'guidance-note', topics: ['scheduling'], keywords: ['hpc'], audiences: ['learners'],
    milestone: 1, status: 'published', publication_date: '2026-07-01', supporting_artifacts: [],
    schedulers: [], container_runtimes: [], related: [], applicability_records: [], authority: [], revisions: [],
    ...overrides,
  };
}

function moduleItem(overrides: Record<string, unknown> = {}) {
  return item({
    id: 'module-1', stable_slug: 'module-one', artifact_type: 'learning-module', module_number: 1,
    module_type: 'runnable', learning_outcomes: ['Run the workflow'], prerequisites: [],
    validation_status: 'validated', validation_date: '2026-06-30', applicability_records: ['anvil-run'],
    schedulers: ['slurm'], container_runtimes: ['apptainer'],
    section_kinds: ['concept', 'procedure', 'expected-result', 'limitations', 'next-steps'],
    required_resources: ['one compute node'], estimated_minutes: 15,
    completion_check: { kind: 'result', text: 'Verifier reports success' }, unvalidated_scopes: [],
    ...overrides,
  });
}

function applicability() {
  return applicabilityRecordSchema.parse({
    id: 'anvil-run', workflow_id: 'module-1', status: 'validated',
    environment: { public_name: 'Purdue Anvil', fallback: false, notes: 'ACCESS environment' },
    scheduler: { family: 'slurm', version: '24.05' }, runtime: { name: 'apptainer', version: '1.3' },
    container_digest: digest, workflow_revision: 'v0.1.0', validation_date: '2026-06-30', execution_date: '2026-06-30', submission_id: 'public-1',
    result: { terminal_state: 'COMPLETED', exit_code: 0, checks: ['result schema'] },
    assumptions: ['single node'], limitations: ['site policy'], portability_boundaries: ['storage'],
    evidence,
    provenance: [{ label: 'fixture source', reference: { repository: 'https://github.com/example/project', release: 'v0.1.0', path: 'README.md', integrity: digest } }],
    review_after: '2026-12-30',
  });
}

describe('target-state content schemas and release gates', () => {
  it('accepts compatibility keys while rejecting unknown or absent M1 fields', () => {
    expect(contentItemSchema.parse(item({ last_updated: '2026-06-01' })).last_updated).toBe('2026-06-01');
    expect(() => contentItemSchema.parse(item({ title: undefined }))).toThrow(/title/);
    expect(() => contentItemSchema.parse(item({ unexpected: true }))).toThrow(/unrecognized/i);
  });

  it('progressively requires review, maintainer, and complete v1 metadata', () => {
    const technical = moduleItem();
    expect(() => parseContentItem(technical, 'm2')).toThrow(/last_reviewed/);
    expect(() => parseContentItem({ ...technical, last_reviewed: '2026-07-02' }, 'm3')).toThrow(/responsible_maintainer/);
    expect(() => parseContentItem({
      ...technical, last_reviewed: '2026-07-02', responsible_maintainer: 'Project maintainer',
    }, 'v1.0')).toThrow(/description/);
    expect(parseContentItem({
      ...technical, description: 'Full description', last_reviewed: '2026-07-02',
      responsible_maintainer: 'Project maintainer', applicable_release: 'v1.0.0',
    }, 'v1.0').id).toBe('module-1');
  });
});

describe('cross-record validation and lifecycle', () => {
  it('resolves valid references and rejects duplicate relations and draft dependencies', () => {
    const draft = item({ id: 'draft-1', stable_slug: 'draft-one', status: 'draft', publication_date: undefined });
    expect(() => validateRegistry({ content: [item({ related: ['draft-1'], topics: ['HPC', 'hpc'] }), draft] }))
      .toThrow(/duplicate value hpc[\s\S]*cannot depend on draft/);
    const normalized = validateRegistry({ content: [item({ topics: ['zeta', 'alpha'] }), draft] });
    expect(normalized.content[0].topics).toEqual(['alpha', 'zeta']);
  });

  it('rejects missing IDs, duplicate stable paths, and backward maturity transitions', () => {
    expect(() => validateRegistry({ content: [item({ related: ['missing'] })] })).toThrow(/missing content reference missing/);
    expect(() => generateCanonicalRoutes([
      contentItemSchema.parse(item()), contentItemSchema.parse(item({ id: 'guide-2' })),
    ], true)).toThrow(/duplicate canonical route/);
    expect(() => validateRegistry({
      content: [item({ status: 'draft', publication_date: undefined })], previousContent: [item()],
    })).toThrow(/invalid transition published -> draft/);
  });

  it('validates diagnostic applicability only for a record owned by a related workflow', () => {
    const diagnostic = item({
      id: 'BSSW-RUNTIME', stable_slug: 'bssw-runtime', artifact_type: 'diagnostic',
      related: ['module-1'], container_runtimes: ['apptainer'],
      diagnostic_applicability: { record_id: 'anvil-run', discriminator: 'runtime' },
    });
    expect(validateRegistry({ content: [moduleItem(), diagnostic], applicability: [applicability()] })
      .content.find(({ id }) => id === 'BSSW-RUNTIME')?.diagnostic_applicability?.record_id).toBe('anvil-run');
    expect(() => validateRegistry({
      content: [moduleItem(), { ...diagnostic, related: [] }], applicability: [applicability()],
    })).toThrow(/must belong to a related workflow/);
  });

  it('rejects conflicting or duplicate explicit milestone ownership', () => {
    const deliverable = item({ sow_deliverable_id: 'M1-D1' });
    const owner = (id: string, number: 1 | 2) => ({
      id, number, due_date: '2026-07-31',
      deliverables: [{ sow_id: 'M1-D1', item_id: 'guide-1', status: 'complete', public_url: '/guide/guide-one/', completion_evidence: evidence, revisions: [] }],
    });
    expect(() => validateRegistry({ content: [deliverable], milestones: [owner('m1', 1), owner('m2', 2)] }))
      .toThrow(/conflicts with owner 2|exactly one primary milestone owner/);
  });
});

describe('immutable companion repository references', () => {
  const reference = { repository: 'https://github.com/example/project', release: 'v0.1.0', path: 'README.md', integrity: digest };

  it('resolves immutable public references to existing local paths', () => {
    const resolved = resolveRepoRef(reference, root, { artifact_type: 'learning-module' });
    expect(resolved.href).toBe('https://github.com/example/project/blob/v0.1.0/README.md');
  });

  it('limits branches to support/contribution pages and rejects missing paths', () => {
    expect(() => resolveRepoRef({ ...reference, release: 'main' }, root, { artifact_type: 'learning-module' }))
      .toThrow(/branches are limited/);
    expect(resolveRepoRef({ ...reference, release: 'main' }, root, { artifact_type: 'support' }).local_path)
      .toMatch(/README\.md$/);
    expect(() => resolveRepoRef({ ...reference, path: 'missing.file' }, root, { artifact_type: 'support' }))
      .toThrow(/does not exist/);
  });
});

describe('canonical routes and redirects', () => {
  it('generates every designed namespace deterministically', () => {
    expect(canonicalPath(contentItemSchema.parse(moduleItem()))).toBe('/guide/module-one/');
    expect(canonicalPath(contentItemSchema.parse(item({ artifact_type: 'diagnostic' })))).toBe('/diagnostics/guide-one/');
    expect(canonicalPath(contentItemSchema.parse(item({ artifact_type: 'milestone' })))).toBe('/milestones/1/');
    expect(canonicalPath(contentItemSchema.parse(item({ route_namespace: 'start' })))).toBe('/start/');
  });

  it('accepts one-hop moves and rejects chains, missing targets, reuse, and removals', () => {
    const valid = [{ id: 'move', from: '/old/', to: '/guide/guide-one/', reason: 'moved', active_from: '2026-07-02' }];
    expect(validateRedirects({ redirects: valid, currentPaths: ['/guide/guide-one/'], previousPaths: ['/old/'] })).toHaveLength(1);
    expect(() => validateRedirects({
      redirects: [...valid, { id: 'chain', from: '/older/', to: '/old/', reason: 'moved', active_from: '2026-07-01' }],
      currentPaths: ['/guide/guide-one/'], previousPaths: ['/old/', '/removed/'],
    })).toThrow(/redirect chain[\s\S]*removed public URL is unaccounted/);
    expect(() => validateRedirects({ redirects: valid, currentPaths: ['/old/'] })).toThrow(/retired path reused|target is missing/);
    expect(() => validateRedirects({ redirects: [{ ...valid[0], from: 'https:\/\/example.com\/old\/' }], currentPaths: [] }))
      .toThrow(/origin-relative/);
  });
});

describe('milestone and discovery projections', () => {
  it('projects one milestone owner with immutable completion evidence and revisions', () => {
    const parsed = contentItemSchema.parse(item({
      sow_deliverable_id: 'M1-D1', deliverable_status: 'complete', completion_evidence: evidence,
      revisions: [{ date: '2026-07-15', summary: 'Clarified wording', evidence: { ...evidence, id: 'revision-1' } }],
    }));
    const projection = projectMilestones([parsed]);
    expect(projection[0].deliverables[0]).toMatchObject({ sow_id: 'M1-D1', public_url: '/guide/guide-one/' });
    expect(() => validateRegistry({ content: [{ ...parsed, completion_evidence: { ...evidence, id: 'changed' } }], previousContent: [parsed] }))
      .toThrow(/original completion evidence is immutable/);
  });

  it('builds additive no-JS indexes, search, relations, sitemap, feed, and URL manifest', () => {
    const published = contentItemSchema.parse(item({ related: ['module-1'], learning_stage: 'baseline' }));
    const draft = contentItemSchema.parse(item({ id: 'draft-1', stable_slug: 'draft-one', status: 'draft', publication_date: undefined }));
    const projection = projectDiscovery([draft, published]);
    expect(projection.resources.map(({ id }) => id)).toEqual(['guide-1']);
    expect(projection.resource_groups).toEqual([{ artifact_type: 'guidance-note', item_ids: ['guide-1'] }]);
    expect(projection.sequential_path[0]).toEqual({ stage: 'baseline', item_ids: ['guide-1'] });
    expect(projection.search[0]).toMatchObject({ title: 'Guide one', summary: 'A useful guide' });
    expect(projection.relationships['guide-1'].related).toEqual(['module-1']);
    expect(projection.url_manifest[0].url).toBe('https://laptop-to-cluster.org/guide/guide-one/');
    expect(projection.no_js_html).toContain('<a href="/guide/guide-one/">Guide one</a>');
    expect(projection).not.toHaveProperty('no_result');
    expect(projectNoResultState(['topic:mpi']).active_filters).toEqual(['topic:mpi']);
  });

  it('derives previous and next module links from stage and module-number sequence', () => {
    const first = contentItemSchema.parse(moduleItem({
      id: 'module-1', stable_slug: 'model', module_number: 1, module_type: 'conceptual',
      learning_stage: 'baseline', validation_status: undefined, validation_date: undefined,
      applicability_records: [], required_resources: undefined, estimated_minutes: 10,
      section_kinds: ['concept', 'limitations', 'next-steps'],
      completion_check: { kind: 'decision-exercise', text: 'Map the workflow outcome' },
    }));
    const second = contentItemSchema.parse(moduleItem({
      id: 'module-2', stable_slug: 'run', module_number: 2, learning_stage: 'baseline',
    }));
    const navigation = projectModuleNavigation([second, first]);
    expect(navigation['module-1']).toEqual({
      previous: undefined,
      next: { id: 'module-2', title: 'Guide one', url: '/guide/run/' },
    });
    expect(navigation['module-2'].previous).toEqual({ id: 'module-1', title: 'Guide one', url: '/guide/model/' });
    expect(navigation['module-2'].next).toBeUndefined();
  });
});

describe('applicability and release change projections', () => {
  it('projects only one source-derived scope, one supplement, and the canonical link', () => {
    const technical = contentItemSchema.parse(moduleItem({ applicable_release: 'v0.1.0', last_reviewed: '2026-07-01' }));
    const projected = projectApplicabilityForItem(technical, [applicability()], 'runnable-module');
    expect(projected).toMatchObject({
      projectionId: 'runnable-module:anvil-run', consumer: 'runnable-module', recordId: 'anvil-run',
      canonicalPath: '/applicability/anvil-run/', supplement: { kind: 'boundary', text: 'storage' },
    });
    expect(Object.keys(projected!).sort()).toEqual(['canonicalPath', 'consumer', 'projectionId', 'recordId', 'supplement', 'testedScope']);
    expect(JSON.stringify(projected)).not.toMatch(/24\.05|1\.3|2026-06-30|public-1|manifest\.json|sha256/);
  });

  it('classifies release changes and requires material-change traceability', () => {
    const baseRelease = {
      id: 'release-v010', version: 'v0.1.0', published_at: '2026-07-31', site_commit: 'b'.repeat(40),
      repository: { repository: 'https://github.com/example/project', release: 'v0.1.0', path: 'README.md', integrity: digest },
      url_manifest_sha256: digest, site_artifact_sha256: digest, artifact_file_manifest_sha256: digest,
      cloudflare_deployment_id: 'deployment-1', pages_dev_fallback_url: 'https://example.pages.dev',
      canonical_origin: 'https://laptop-to-cluster.org', evidence_ids: ['evidence-1'],
    };
    expect(() => releaseRecordSchema.parse({
      ...baseRelease, changes: [{ class: 'changed', item_id: 'module-1', material: true }],
    })).toThrow(/reason|affected_environments|migration/);
    const release = releaseRecordSchema.parse({
      ...baseRelease,
      changes: [
        { class: 'added', item_id: 'guide-1' },
        { class: 'changed', item_id: 'module-1', material: true, reason: 'Runtime update', affected_environments: ['Anvil'], migration: 'Rebuild image' },
      ],
    });
    const projected = projectReleaseChanges([release])[0];
    expect(projected.classes.added[0].item_id).toBe('guide-1');
    expect(projected.classes.changed[0]).toMatchObject({ reason: 'Runtime update', migration: 'Rebuild image' });
  });
});