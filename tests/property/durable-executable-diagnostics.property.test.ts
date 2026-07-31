import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { canonicalPath, validateRegistry } from '../../site/src/content/registry.js';

const suffix = fc.stringMatching(/^[A-Z0-9]{1,12}$/);
const diagnosticId = suffix.map((value) => `BSSW-${value}`);

const diagnostic = (id: string) => ({
  id,
  stable_slug: id.toLowerCase(),
  title: `${id}: generated failure`,
  summary: 'Durable recovery guidance for a generated executable failure.',
  artifact_type: 'diagnostic' as const,
  topics: ['diagnostics'], keywords: ['failure'], audiences: ['HPC learners'],
  milestone: 1 as const, status: 'published' as const, publication_date: '2026-07-31',
  related: [],
});

const runnable = (ids: string[]) => ({
  id: 'generated-runnable', stable_slug: 'generated-runnable', title: 'Generated runnable module',
  summary: 'Exercises generated executable prerequisites.', artifact_type: 'learning-module' as const,
  topics: ['workflow'], keywords: ['execution'], audiences: ['HPC learners'], milestone: 1 as const,
  status: 'published' as const, publication_date: '2026-07-31', module_number: 99,
  module_type: 'runnable' as const, learning_outcomes: ['Resolve executable failures.'],
  prerequisites: ids.map((id) => ({ id, check: `Check ${id}`, diagnostic_id: id })),
  section_kinds: ['concept', 'procedure', 'expected-result', 'limitations', 'next-steps'] as const,
  required_resources: ['One test allocation'], estimated_minutes: 5,
  completion_check: { kind: 'result' as const, text: 'Every generated check succeeds.' },
  validation_status: 'validated' as const, validation_date: '2026-07-25',
  applicability_records: ['generated-applicability'], schedulers: ['slurm'] as const,
  container_runtimes: ['apptainer'] as const, related: [], unvalidated_scopes: [],
});

const applicability = {
  id: 'generated-applicability', workflow_id: 'generated-runnable', status: 'validated' as const,
  environment: { public_name: 'Purdue Anvil' as const, fallback: false, notes: 'Generated valid source.' },
  scheduler: { family: 'Slurm', version: '1' }, runtime: { name: 'Apptainer', version: '1' },
  container_digest: `sha256:${'a'.repeat(64)}`, workflow_revision: 'v0.1.0',
  validation_date: '2026-07-25', execution_date: '2026-07-25', submission_id: '1',
  result: { terminal_state: 'COMPLETED', exit_code: 0, checks: ['generated check'] },
  assumptions: ['generated assumption'], limitations: ['generated limitation'],
  portability_boundaries: ['generated boundary'],
  evidence: { id: 'generated-evidence', path: 'evidence/README.md', integrity: `sha256:${'b'.repeat(64)}` },
  provenance: [{ label: 'Generated source', reference: { repository: 'https://github.com/example/project', release: 'v0.1.0', path: 'README.md', integrity: `sha256:${'c'.repeat(64)}` } }],
  review_after: '2026-10-31',
};

describe('Property 9: Executable failures resolve to durable diagnostics', () => {
  /** Validates: Requirements 5.5, 5.6 */
  it('assigns every executable failure a stable diagnostic ID and canonical URL', () => {
    fc.assert(fc.property(fc.uniqueArray(diagnosticId, { minLength: 1, maxLength: 8 }), (ids) => {
      const registry = validateRegistry({
        content: [runnable(ids), ...ids.map(diagnostic)],
        applicability: [applicability],
      });
      const module = registry.content.find(({ id }) => id === 'generated-runnable');
      expect(module?.artifact_type).toBe('learning-module');
      if (!module || module.artifact_type !== 'learning-module') return;

      for (const prerequisite of module.prerequisites) {
        expect(prerequisite.check).toBeTruthy();
        expect(prerequisite.diagnostic_id).toMatch(/^BSSW-[A-Z0-9-]+$/);
        const target = registry.content.find(({ id }) => id === prerequisite.diagnostic_id);
        expect(target?.artifact_type).toBe('diagnostic');
        expect(canonicalPath(target!)).toBe(`/diagnostics/#${prerequisite.diagnostic_id!.toLowerCase()}`);
      }
    }));
  });
});
