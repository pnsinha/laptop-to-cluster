import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { validateAccessibilityReview } from '../../scripts/validate-accessibility-review';

const root = fileURLToPath(new URL('../..', import.meta.url));
const record = parse(readFileSync(`${root}/releases/v0.1.0/accessibility-review.yml`, 'utf8'));

describe('versioned accessibility and editorial review record', () => {
  it('accepts the complete pending review template without treating editorial word counts as a build gate', () => {
    expect(record.editorialHeuristicsPolicy).toEqual({
      enforcement: 'human-review', approximateFirstWords: 120, buildFailingWordCount: false,
    });
    expect(validateAccessibilityReview(record)).toEqual([]);
  });

  it('requires every presentation level, route profile, canonical trace, and release check', () => {
    const cases = [
      { mutate: (copy: any) => delete copy.presentationLevels['canonical-only'], expected: 'presentationLevels.canonical-only' },
      { mutate: (copy: any) => copy.manualRouteSamples.pop(), expected: 'manualRouteSamples' },
      { mutate: (copy: any) => { copy.canonicalDestinationTrace[0].destination = '/guide/baseline-single-node-pattern/'; }, expected: 'canonicalDestinationTrace.applicability' },
      { mutate: (copy: any) => { copy.checks = copy.checks.filter(({ id }: any) => id !== 'validation-source-agreement'); }, expected: 'checks.validation-source-agreement' },
    ];
    for (const { mutate, expected } of cases) {
      const copy = structuredClone(record);
      mutate(copy);
      expect(validateAccessibilityReview(copy).join('\n')).toContain(expected);
    }
  });

  it('keeps pending human review from being approved as release-complete', () => {
    expect(validateAccessibilityReview(record, { requireComplete: true }).join('\n')).toMatch(/must be completed before release|reviewer, review date, and approval/);
  });
});
