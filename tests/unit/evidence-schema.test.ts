import { describe, expect, it } from 'vitest';
import { applicabilityRecordSchema } from '../../site/src/content/schema.js';

const digest = (character: string) => `sha256:${character.repeat(64)}`;
const negative = { id: 'fixture-timeout', path: 'evidence/fixture-timeout/manifest.json', integrity: digest('d'), role: 'negative-test' };

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fixture-run', workflow_id: 'module-2-baseline', status: 'validated',
    environment: { public_name: 'Purdue Anvil', fallback: false, notes: 'Fixture environment.' },
    scheduler: { family: 'Slurm', version: 'slurm 1.0' }, runtime: { name: 'Apptainer', version: 'apptainer 1.0' },
    container_digest: digest('a'), workflow_revision: 'v0.1.0',
    validation_date: '2026-07-25', execution_date: '2026-07-25', submission_id: '1',
    result: { terminal_state: 'COMPLETED', exit_code: 0, checks: ['check zero', 'check one'] },
    assumptions: ['assumption zero', 'assumption one'],
    limitations: ['limitation zero'],
    portability_boundaries: ['boundary zero', 'boundary one'],
    evidence: { id: 'fixture-success', path: 'evidence/fixture-success/manifest.json', integrity: digest('b') },
    provenance: [{ label: 'fixture', reference: { repository: 'https://github.com/example/project', release: 'v0.1.0', path: 'README.md', integrity: digest('c') } }],
    review_after: '2026-10-31',
    ...overrides,
  };
}

function plain(overrides: Record<string, unknown> = {}) {
  return {
    tested: { text: 'It ran and every result was correct; a failure run stopped at the gate.', from: ['result.checks', 'related_evidence.0'] },
    you_need: [{ text: 'Need zero.', from: ['assumptions.0'] }],
    depends_on_center: [{ text: 'Depends on one.', from: ['assumptions.1', 'portability_boundaries.0', 'portability_boundaries.1'] }],
    ...overrides,
  };
}

describe('applicability record: plain-language trace', () => {
  it('accepts plain language whose every reference resolves and that covers every assumption and boundary', () => {
    const parsed = applicabilityRecordSchema.parse(record({ plain_language: plain(), related_evidence: [negative] }));
    expect(parsed.plain_language?.depends_on_center[0].from).toEqual(['assumptions.1', 'portability_boundaries.0', 'portability_boundaries.1']);
    expect(parsed.related_evidence).toEqual([negative]);
  });

  it('treats a bare list reference as covering the whole list', () => {
    const bare = plain({
      you_need: [{ text: 'Need everything listed.', from: ['assumptions'] }],
      depends_on_center: [{ text: 'Depends on everything listed.', from: ['portability_boundaries', 'limitations'] }],
    });
    expect(applicabilityRecordSchema.parse(record({ plain_language: bare, related_evidence: [negative] })).plain_language).toBeDefined();
  });

  it('rejects a reference to an index that does not exist', () => {
    const outOfRange = plain({ you_need: [{ text: 'Need zero.', from: ['assumptions.0', 'assumptions.5'] }] });
    expect(() => applicabilityRecordSchema.parse(record({ plain_language: outOfRange, related_evidence: [negative] })))
      .toThrow(/assumptions\.5 does not resolve to an existing assumptions entry/);
  });

  it('rejects a related_evidence reference when the record lists no related evidence', () => {
    expect(() => applicabilityRecordSchema.parse(record({ plain_language: plain() })))
      .toThrow(/related_evidence\.0 does not resolve to an existing related_evidence entry/);
  });

  it('requires the tested row to cite the record result checks', () => {
    const uncited = plain({ tested: { text: 'It ran and every result was correct.', from: ['assumptions.0'] } });
    expect(() => applicabilityRecordSchema.parse(record({ plain_language: uncited, related_evidence: [negative] })))
      .toThrow(/plain_language\.tested\.from: must cite result\.checks|must cite result\.checks/);
    const single = plain({ tested: { text: 'It ran and every result was correct.', from: ['result.checks.1'] } });
    expect(applicabilityRecordSchema.parse(record({ plain_language: single, related_evidence: [negative] })).plain_language).toBeDefined();
  });

  it('rejects plain language that silently drops an assumption or a boundary', () => {
    const dropped = plain({ depends_on_center: [{ text: 'Depends on one.', from: ['assumptions.1', 'portability_boundaries.0'] }] });
    expect(() => applicabilityRecordSchema.parse(record({ plain_language: dropped, related_evidence: [negative] })))
      .toThrow(/portability_boundaries\.1 is not covered by any plain-language item/);
  });

  it('keeps the plain-language block strict and its references to known lists', () => {
    expect(() => applicabilityRecordSchema.parse(record({ plain_language: { ...plain(), extra: true }, related_evidence: [negative] })))
      .toThrow(/unrecognized/i);
    const unknownList = plain({ you_need: [{ text: 'Need zero.', from: ['steps.0'] }] });
    expect(() => applicabilityRecordSchema.parse(record({ plain_language: unknownList, related_evidence: [negative] })))
      .toThrow(/must reference a record list/);
  });
});

describe('applicability record: related evidence, supersession, and review extension', () => {
  it('requires related evidence to be distinct negative-test references', () => {
    expect(() => applicabilityRecordSchema.parse(record({ related_evidence: [{ ...negative, id: 'fixture-success' }] })))
      .toThrow(/must differ from the primary evidence reference/);
    expect(() => applicabilityRecordSchema.parse(record({ related_evidence: [negative, { ...negative, path: 'evidence/other/manifest.json' }] })))
      .toThrow(/duplicate related evidence fixture-timeout/);
    expect(() => applicabilityRecordSchema.parse(record({ related_evidence: [{ ...negative, role: 'success' }] }))).toThrow();
  });

  it('rejects self-supersession and accepts a successor ID', () => {
    expect(() => applicabilityRecordSchema.parse(record({ superseded_by: 'fixture-run' }))).toThrow(/cannot supersede itself/);
    expect(applicabilityRecordSchema.parse(record({ superseded_by: 'fixture-run-2026-10' })).superseded_by).toBe('fixture-run-2026-10');
  });

  it('requires a review extension to end after review_after', () => {
    const extension = { reviewed_by: 'Project reviewer', reviewed_on: '2026-10-13', review_by: '2026-10-31', scope_note: 'Describes the July run.' };
    expect(() => applicabilityRecordSchema.parse(record({ review_extension: extension })))
      .toThrow(/must be later than review_after/);
    expect(applicabilityRecordSchema.parse(record({ review_extension: { ...extension, review_by: '2027-01-31' } })).review_extension?.review_by)
      .toBe('2027-01-31');
  });
});
