import { describe, expect, it } from 'vitest';
import {
  COMPOSITION_PROFILES,
  assertCompositionProfile,
  assertKnownCompositionProfile,
  compositionProfileFor,
  projectApplicability,
  projectApplicabilityForProfile,
  projectApplicabilityForItem,
  projectDiagnosticApplicabilityContext,
  projectLandingPage,
  projectModuleNavigation,
} from '../../site/src/content/projections.js';
import type { ApplicabilityRecord, ContentItem } from '../../site/src/content/schema.js';

const common = { status: 'published', publication_date: '2026-07-31', milestone: 1 } as const;
const content = [
  { ...common, id: 'model', stable_slug: 'model', artifact_type: 'learning-module', module_number: 1, estimated_minutes: 10, title: 'Model', summary: 'Understand orchestration.' },
  { ...common, id: 'start', stable_slug: 'start', route_namespace: 'start', artifact_type: 'guidance-note', title: 'Start', summary: 'Check the center.' },
  { ...common, id: 'baseline', stable_slug: 'baseline', artifact_type: 'learning-module', module_number: 2, estimated_minutes: 30, title: 'Baseline', summary: 'Run and verify.', applicability_records: ['anvil'] },
  { ...common, id: 'milestone', stable_slug: 'one', artifact_type: 'milestone', title: 'Milestone 1', summary: 'Deliverables.' },
  { ...common, id: 'release', stable_slug: 'v0-1-0', artifact_type: 'release', title: 'Release v0.1.0', summary: 'Release.', applicability_records: ['anvil'] },
] as unknown as ContentItem[];
const anvil = {
  id: 'anvil', workflow_id: 'baseline', status: 'validated', validation_date: '2026-07-25',
  environment: { public_name: 'Purdue Anvil', fallback: false }, workflow_revision: 'v0.1.0',
  scheduler: { family: 'Slurm', version: '25.11.1' }, runtime: { name: 'Apptainer', version: '1.4.3' },
  portability_boundaries: ['Scheduler account and partition are supplied locally.'],
} as ApplicabilityRecord;

describe('module navigation projection', () => {
  it('derives pager neighbors from stage and module sequence rather than input order', () => {
    const modules = [
      { ...common, id: 'operations', stable_slug: 'operate', artifact_type: 'learning-module', title: 'Operate', summary: 'Operate.', module_number: 4, learning_stage: 'operations' },
      { ...common, id: 'baseline-two', stable_slug: 'run', artifact_type: 'learning-module', title: 'Run', summary: 'Run.', module_number: 2, learning_stage: 'baseline' },
      { ...common, id: 'baseline-one', stable_slug: 'model', artifact_type: 'learning-module', title: 'Model', summary: 'Model.', module_number: 1, learning_stage: 'baseline' },
    ] as unknown as ContentItem[];

    const navigation = projectModuleNavigation(modules);
    expect(navigation['baseline-one']).toEqual({
      previous: undefined,
      next: { id: 'baseline-two', title: 'Run', url: '/guide/run/' },
    });
    expect(navigation['baseline-two']).toEqual({
      previous: { id: 'baseline-one', title: 'Model', url: '/guide/model/' },
      next: { id: 'operations', title: 'Operate', url: '/guide/operate/' },
    });
    expect(navigation.operations).toEqual({
      previous: { id: 'baseline-two', title: 'Run', url: '/guide/run/' },
      next: undefined,
    });
  });
});

describe('landing page projection', () => {
  it('derives validation details, links, and duration from authoritative records', () => {
    const projection = projectLandingPage(content, [anvil]);
    expect(projection.applicability_projection).toEqual({
      projectionId: 'landing:anvil', consumer: 'landing', recordId: 'anvil',
      canonicalPath: '/applicability/anvil/',
      testedScope: 'The baseline workflow was validated on Purdue Anvil with Slurm and Apptainer.',
      supplement: { kind: 'boundary', text: 'Scheduler account and partition are supplied locally.' },
    });
    expect(projection.estimated_minutes).toBe(40);
    expect(projection.learning_path.map(({ url }) => url)).toEqual(['/guide/model/', '/start/', '/guide/baseline/']);
    expect(projection.release.url).toBe('/releases/v0-1-0/');
  });

  it('does not claim validation when latest applicability records conflict', () => {
    const conflicting = { ...anvil, id: 'second' };
    const changed = content.map((item) => item.id === 'baseline'
      ? { ...item, applicability_records: ['anvil', 'second'] } as ContentItem : item);
    const projection = projectLandingPage(changed, [anvil, conflicting]);
    expect(projection.applicability_projection).toBeUndefined();
    expect(projection.validation_unavailable_reason).toContain('Multiple applicability records');
  });
});


describe('artifact-aware composition and applicability projections', () => {
  it('selects every composition profile and rejects contradictory requests', () => {
    const fixtures = [
      [{ ...content[0], module_type: 'conceptual' }, 'learning-conceptual'],
      [{ ...content[2], module_type: 'runnable' }, 'learning-runnable'],
      [content[1], 'start'], [content[3], 'milestone'], [content[4], 'release'],
      [{ ...content[1], id: 'diagnostic', route_namespace: 'diagnostics', artifact_type: 'diagnostic' }, 'diagnostic'],
      [{ ...content[1], id: 'support', route_namespace: 'about', artifact_type: 'support' }, 'support'],
      [{ ...content[1], id: 'accessibility', route_namespace: 'about', artifact_type: 'accessibility' }, 'accessibility'],
      [{ ...content[1], id: 'about', route_namespace: 'about', artifact_type: 'report' }, 'about'],
      [{ ...content[1], id: 'event', route_namespace: 'events', artifact_type: 'event-assets' }, 'event'],
    ] as Array<[ContentItem, ReturnType<typeof compositionProfileFor>]>;
    for (const [item, expected] of fixtures) expect(compositionProfileFor(item)).toBe(expected);
    const represented = new Set(['landing', 'resources', 'applicability', 'not-found', ...fixtures.map(([, profile]) => profile)]);
    expect(represented).toEqual(new Set(COMPOSITION_PROFILES));
    expect(() => assertCompositionProfile(fixtures[0][0], 'release')).toThrow(/contradicts/);
    for (const profile of COMPOSITION_PROFILES) expect(assertKnownCompositionProfile(profile)).toBe(profile);
    expect(() => assertKnownCompositionProfile('metadata-heavy')).toThrow(/unknown composition profile/);
    expect(() => compositionProfileFor({ ...content[1], artifact_type: 'training-package', route_namespace: 'start' } as ContentItem)).toThrow(/start composition requires guidance-note/);
    expect(() => compositionProfileFor({ ...content[1], artifact_type: 'report', route_namespace: 'resources' } as ContentItem)).toThrow(/no composition profile/);
  });

  it('allows one concise projection only for landing, runnable, milestone, and release consumers', () => {
    const allowed: Partial<Record<(typeof COMPOSITION_PROFILES)[number], string>> = {
      landing: 'landing', 'learning-runnable': 'runnable-module', milestone: 'milestone', release: 'release',
    };
    for (const profile of COMPOSITION_PROFILES) {
      const projection = projectApplicabilityForProfile(profile, anvil);
      if (!allowed[profile]) {
        expect(projection, profile).toBeUndefined();
        continue;
      }
      expect(projection?.consumer, profile).toBe(allowed[profile]);
    }
    for (const consumer of ['landing', 'runnable-module', 'milestone', 'release'] as const) {
      const projection = projectApplicability(anvil, consumer);
      expect(Object.keys(projection).sort()).toEqual(['canonicalPath', 'consumer', 'projectionId', 'recordId', 'supplement', 'testedScope']);
      expect(projection.recordId).toBe('anvil');
      expect(projection.projectionId).toBe(`${consumer}:anvil`);
      expect(projection.canonicalPath).toBe('/applicability/anvil/');
      expect(projection.testedScope).toBe('The baseline workflow was validated on Purdue Anvil with Slurm and Apptainer.');
      expect(projection.supplement).toEqual({ kind: 'boundary', text: anvil.portability_boundaries[0] });
      expect(projection.testedScope).not.toMatch(/25\.11|1\.4\.3|2026-07-25|submission|sha256|evidence/i);
    }
    const conceptual = { ...content[0], module_type: 'conceptual', applicability_records: ['anvil'] } as ContentItem;
    expect(() => projectApplicabilityForItem(conceptual, [anvil], 'runnable-module')).toThrow(/not allowed/);
  });

  it('gives failed, unvalidated, and stale status precedence over a normal boundary', () => {
    for (const status of ['failed', 'unvalidated', 'stale'] as const) {
      expect(projectApplicability({ ...anvil, status }, 'landing').supplement.kind).toBe('status');
    }
  });

  it('propagates semantic source drift to every permitted consumer and keeps canonical-only fields out', () => {
    const consumers = ['landing', 'runnable-module', 'milestone', 'release'] as const;
    const all = (record: ApplicabilityRecord) => consumers.map((consumer) => projectApplicability(record, consumer));
    const environment = { ...anvil, environment: { public_name: 'SDSC Expanse', fallback: true, notes: 'Fallback validation.' } } as ApplicabilityRecord;
    const status = { ...anvil, status: 'stale' } as ApplicabilityRecord;
    const boundary = { ...anvil, portability_boundaries: ['Use the local scheduler account.'] } as ApplicabilityRecord;
    const renamed = { ...anvil, id: 'expanse-run' } as ApplicabilityRecord;

    expect(new Set(all(environment).map(({ testedScope }) => testedScope))).toEqual(new Set([
      'The baseline workflow was validated on SDSC Expanse with Slurm and Apptainer.',
    ]));
    expect(new Set(all(status).map(({ supplement }) => `${supplement.kind}:${supplement.text}`))).toEqual(new Set([
      'status:This validation is stale and requires review before reuse.',
    ]));
    expect(new Set(all(boundary).map(({ supplement }) => `${supplement.kind}:${supplement.text}`))).toEqual(new Set([
      'boundary:Use the local scheduler account.',
    ]));
    expect(all(renamed).map(({ projectionId }) => projectionId)).toEqual(consumers.map((consumer) => `${consumer}:expanse-run`));
    expect(new Set(all(renamed).map(({ canonicalPath }) => canonicalPath))).toEqual(new Set(['/applicability/expanse-run/']));

    for (const canonicalOnlyMutation of [
      { ...anvil, scheduler: { ...anvil.scheduler, version: '26.1' } },
      { ...anvil, runtime: { ...anvil.runtime, version: '2.0' } },
      { ...anvil, validation_date: '2026-08-01' },
    ] as ApplicabilityRecord[]) {
      expect(all(canonicalOnlyMutation)).toEqual(all(anvil));
      expect(JSON.stringify(all(canonicalOnlyMutation))).not.toContain('26.1');
      expect(JSON.stringify(all(canonicalOnlyMutation))).not.toContain('2.0');
      expect(JSON.stringify(all(canonicalOnlyMutation))).not.toContain('2026-08-01');
    }

    const runnable = { ...content[2], module_type: 'runnable' } as ContentItem;
    expect(() => projectApplicabilityForItem(runnable, [renamed], 'runnable-module')).toThrow(/missing applicability source anvil/);
    expect(() => projectApplicabilityForItem(
      { ...runnable, applicability_records: ['expanse-run'] } as ContentItem,
      [{ ...renamed, workflow_id: 'different-workflow' } as ApplicabilityRecord], 'runnable-module',
    )).toThrow(/belongs to different-workflow/);
  });

  it('authorizes diagnostic context only through a typed relationship', () => {
    const diagnostic = { ...content[1], id: 'BSSW-RUNTIME', artifact_type: 'diagnostic', route_namespace: 'diagnostics' } as ContentItem;
    expect(projectDiagnosticApplicabilityContext(diagnostic, [anvil])).toBeUndefined();
    const linked = {
      ...diagnostic, related: ['baseline'], container_runtimes: ['apptainer'],
      diagnostic_applicability: { record_id: 'anvil', discriminator: 'runtime' },
    } as ContentItem;
    const context = projectDiagnosticApplicabilityContext(linked, [anvil]);
    expect(context).toEqual({
      projectionId: 'diagnostic:BSSW-RUNTIME:anvil', diagnosticId: 'BSSW-RUNTIME', recordId: 'anvil',
      canonicalPath: '/applicability/anvil/', discriminator: 'runtime: Apptainer',
    });
    expect(Object.keys(context!).sort()).toEqual(['canonicalPath', 'diagnosticId', 'discriminator', 'projectionId', 'recordId']);
    for (const [discriminator, expected] of [
      ['environment', 'environment: Purdue Anvil'], ['scheduler', 'scheduler: Slurm'], ['runtime', 'runtime: Apptainer'],
    ] as const) {
      expect(projectDiagnosticApplicabilityContext({
        ...linked, diagnostic_applicability: { record_id: 'anvil', discriminator },
      } as ContentItem, [anvil])?.discriminator).toBe(expected);
    }
    expect(() => projectDiagnosticApplicabilityContext({ ...linked, related: [] } as ContentItem, [anvil]))
      .toThrow(/related workflow/);
  });
});
