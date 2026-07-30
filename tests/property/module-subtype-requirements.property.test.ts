import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { contentItemSchema } from '../../site/src/content/schema.js';

type ModuleType = 'conceptual' | 'runnable' | 'hybrid';
type CheckKind = 'result' | 'review-question' | 'mapping-checklist' | 'decision-exercise';

const word = fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'), { minLength: 3, maxLength: 12 })
  .map((characters) => characters.join(''));
const conceptualKind = fc.constantFrom<CheckKind>('review-question', 'mapping-checklist', 'decision-exercise');
const optionalCheckKind = fc.option(
  fc.oneof(fc.constant<CheckKind>('result'), conceptualKind),
  { nil: undefined },
);

const moduleCase = fc.record({
  moduleType: fc.constantFrom<ModuleType>('conceptual', 'runnable', 'hybrid'),
  outcome: word,
  hasLimitations: fc.boolean(),
  hasProcedure: fc.boolean(),
  hasExpectedResult: fc.boolean(),
  hasResources: fc.boolean(),
  hasEstimatedTime: fc.boolean(),
  completionKind: optionalCheckKind,
  conceptualCheckKind: optionalCheckKind,
});

const makeCheck = (kind: CheckKind | undefined, outcome: string) => kind === undefined ? undefined : ({
  kind,
  text: kind === 'result' ? `Verify the result for ${outcome}` : `Apply learning outcome: ${outcome}`,
});

const isConceptualCheck = (kind: CheckKind | undefined) => kind !== undefined && kind !== 'result';

describe('Property 2: Module subtype requirements follow module type', () => {
  it('accepts each module exactly when its subtype-specific requirements are complete', () => {
    // Feature: bssw-fellowship-resource-site, Property 2: Module subtype requirements follow module type
    // **Validates: Requirements 3.2, 3.4, 3.5**
    fc.assert(fc.property(moduleCase, (candidate) => {
      const sectionKinds = ['concept', 'next-steps'];
      if (candidate.hasLimitations) sectionKinds.push('limitations');
      if (candidate.hasProcedure) sectionKinds.push('procedure');
      if (candidate.hasExpectedResult) sectionKinds.push('expected-result');
      const record = {
        id: `module-${candidate.outcome}`, stable_slug: `module-${candidate.outcome}`,
        title: `Module ${candidate.outcome}`, summary: 'Generated module subtype case',
        artifact_type: 'learning-module' as const, topics: ['hpc'], keywords: ['workflow'],
        audiences: ['learners'], milestone: 1 as const, status: 'draft' as const,
        module_number: 1, module_type: candidate.moduleType, learning_outcomes: [candidate.outcome],
        prerequisites: [], section_kinds: sectionKinds,
        required_resources: candidate.hasResources ? ['one compute node'] : undefined,
        estimated_minutes: candidate.hasEstimatedTime ? 15 : undefined,
        completion_check: makeCheck(candidate.completionKind, candidate.outcome),
        conceptual_check: makeCheck(candidate.conceptualCheckKind, candidate.outcome),
        validation_status: 'validated' as const, validation_date: '2026-07-31',
        applicability_records: ['generated-environment'],
      };

      const runnableComplete = candidate.hasProcedure
        && candidate.hasExpectedResult
        && candidate.hasLimitations
        && candidate.hasResources
        && candidate.hasEstimatedTime
        && candidate.completionKind === 'result';
      const conceptualComplete = candidate.hasLimitations && (
        candidate.moduleType === 'hybrid'
          ? isConceptualCheck(candidate.conceptualCheckKind)
          : isConceptualCheck(candidate.completionKind)
      );
      const expected = candidate.moduleType === 'runnable'
        ? runnableComplete
        : candidate.moduleType === 'conceptual'
          ? conceptualComplete
          : runnableComplete && conceptualComplete;

      const result = contentItemSchema.safeParse(record);
      expect(result.success).toBe(expected);
      if (!result.success || result.data.artifact_type !== 'learning-module') return;

      if (candidate.moduleType !== 'conceptual') {
        expect(result.data.section_kinds).toEqual(expect.arrayContaining(['procedure', 'expected-result', 'limitations']));
        expect(result.data.required_resources).not.toHaveLength(0);
        expect(result.data.estimated_minutes).toBeGreaterThan(0);
        expect(result.data.completion_check?.kind).toBe('result');
      }
      if (candidate.moduleType !== 'runnable') {
        const exercise = candidate.moduleType === 'hybrid' ? result.data.conceptual_check : result.data.completion_check;
        expect(exercise?.kind).toMatch(/^(review-question|mapping-checklist|decision-exercise)$/);
        expect(exercise?.text).toContain(candidate.outcome);
      }
    }), { numRuns: 300, seed: 2030405 });
  });
});
