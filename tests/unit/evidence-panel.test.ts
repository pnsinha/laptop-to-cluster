import { describe, expect, it } from 'vitest';
import { EVIDENCE_ROW_LABELS } from '../../site/src/content/contracts.js';
import {
  currentBaselineRecord, currentRecord, formatMonthYear, namedVersion, projectApplicability, projectEvidencePanel, summarizeRecord,
} from '../../site/src/content/projections.js';
import { applicabilityRecordSchema, type ApplicabilityRecord } from '../../site/src/content/schema.js';

const digest = (character: string) => `sha256:${character.repeat(64)}`;
const negative = { id: 'fixture-timeout', path: 'evidence/fixture-timeout/manifest.json', integrity: digest('d'), role: 'negative-test' };
const plain = {
  tested: { text: 'It ran and every result was correct; a failure run stopped at the gate.', from: ['result.checks', 'related_evidence.0'] },
  you_need: [{ text: 'One node you can use.', from: ['assumptions.0'] }],
  depends_on_center: [{ text: 'How your center loads the runtime.', from: ['assumptions.1', 'portability_boundaries'] }],
};

function record(overrides: Record<string, unknown> = {}): ApplicabilityRecord {
  return applicabilityRecordSchema.parse({
    id: 'fixture-run', workflow_id: 'module-2-baseline', status: 'validated',
    environment: { public_name: 'Purdue Anvil', fallback: false, notes: 'Fixture environment.' },
    scheduler: { family: 'Slurm', version: 'slurm 9.9.9' }, runtime: { name: 'Apptainer', version: 'apptainer 8.8.8' },
    container_digest: digest('a'), workflow_revision: 'v0.1.0',
    validation_date: '2026-07-25', execution_date: '2026-07-25', submission_id: '424242',
    result: { terminal_state: 'COMPLETED', exit_code: 0, checks: ['check zero', 'check one'] },
    assumptions: ['assumption zero', 'assumption one'],
    limitations: ['limitation zero'],
    portability_boundaries: ['boundary zero', 'boundary one'],
    evidence: { id: 'fixture-success', path: 'evidence/fixture-success/manifest.json', integrity: digest('b') },
    provenance: [{ label: 'fixture', reference: { repository: 'https://github.com/example/project', release: 'v0.1.0', path: 'README.md', integrity: digest('c') } }],
    review_after: '2026-10-31',
    ...overrides,
  });
}
const failedResult = { terminal_state: 'FAILED', exit_code: 75, checks: ['check zero'] };

describe('formatMonthYear', () => {
  it('formats an ISO date as a US English month and year in UTC', () => {
    expect(formatMonthYear('2026-07-25')).toBe('Jul 2026');
    expect(formatMonthYear('2026-09-01')).toBe('Sep 2026');
    expect(formatMonthYear('2026-12-31')).toBe('Dec 2026');
    expect(formatMonthYear('2027-01-01')).toBe('Jan 2027');
  });

  it('rejects anything that is not an ISO date', () => {
    expect(() => formatMonthYear('July 2026')).toThrow(RangeError);
    expect(() => formatMonthYear('')).toThrow(/not an ISO date/);
  });
});

describe('projectEvidencePanel', () => {
  it('renders the validated badge, a collapsible panel, and three rows in contract order from plain_language', () => {
    const panel = projectEvidencePanel(record({ plain_language: plain, related_evidence: [negative] }));
    expect(panel).toMatchObject({
      recordId: 'fixture-run', canonicalPath: '/applicability/fixture-run/', status: 'validated',
      badgeText: 'Tested on Purdue Anvil · Jul 2026', collapsible: true, untestedHref: '/adoption/evaluate/#not-tested',
    });
    expect(panel.rows.map(({ label }) => label)).toEqual([...EVIDENCE_ROW_LABELS]);
    expect(panel.rows[0].items).toEqual([plain.tested]);
    expect(panel.rows[1].items).toEqual(plain.you_need);
    expect(panel.rows[2].items).toEqual(plain.depends_on_center);
  });

  it('falls back to every literal list item, each traced to its index, when plain_language is absent', () => {
    const panel = projectEvidencePanel(record());
    expect(panel.rows[0].items).toEqual([
      { text: 'check zero', from: ['result.checks.0'] }, { text: 'check one', from: ['result.checks.1'] },
    ]);
    expect(panel.rows[1].items).toEqual([
      { text: 'assumption zero', from: ['assumptions.0'] }, { text: 'assumption one', from: ['assumptions.1'] },
    ]);
    expect(panel.rows[2].items).toEqual([
      { text: 'boundary zero', from: ['portability_boundaries.0'] }, { text: 'boundary one', from: ['portability_boundaries.1'] },
    ]);
  });

  it('uses per-status badge text and never collapses an escalated state', () => {
    expect(projectEvidencePanel(record({ status: 'stale' }))).toMatchObject({
      badgeText: 'Review due: last tested on Purdue Anvil · Jul 2026', collapsible: false,
    });
    expect(projectEvidencePanel(record({ status: 'failed', result: failedResult }))).toMatchObject({
      badgeText: 'Last run failed: see the test record', collapsible: false,
    });
    expect(projectEvidencePanel(record({ status: 'unvalidated', result: failedResult }))).toMatchObject({
      badgeText: 'Not yet tested on a cluster', collapsible: false,
    });
  });

  it('keeps versions, exact dates, submission IDs, digests, and evidence paths out of the panel', () => {
    const json = JSON.stringify(projectEvidencePanel(record({ plain_language: plain, related_evidence: [negative] })));
    for (const forbidden of ['9.9.9', '8.8.8', '2026-07-25', '424242', 'sha256', 'manifest.json']) expect(json).not.toContain(forbidden);
  });

  it('is attached to every applicability projection as panel', () => {
    for (const consumer of ['landing', 'runnable-module', 'milestone', 'release'] as const) {
      expect(projectApplicability(record(), consumer).panel).toEqual(projectEvidencePanel(record()));
    }
  });
});

describe('currentRecord', () => {
  it('chooses the newest record that is not superseded', () => {
    const july = record({ id: 'july-run', superseded_by: 'october-run' });
    const october = record({ id: 'october-run', validation_date: '2026-10-08', execution_date: '2026-10-08', review_after: '2027-01-31' });
    expect(currentRecord([july, october])?.id).toBe('october-run');
    expect(currentRecord([october, july])?.id).toBe('october-run');
    expect(currentRecord([record({ id: 'only-run' })])?.id).toBe('only-run');
  });

  it('returns undefined when every record is superseded or the newest date is shared', () => {
    expect(currentRecord([])).toBeUndefined();
    expect(currentRecord([record({ superseded_by: 'other-run' })])).toBeUndefined();
    expect(currentRecord([record({ id: 'a-run' }), record({ id: 'b-run' })])).toBeUndefined();
  });
});

describe('summarizeRecord', () => {
  it('summarizes with the badge sentence and scope values copied verbatim from the record', () => {
    expect(summarizeRecord(record({ plain_language: plain, related_evidence: [negative] }))).toEqual({
      tested: 'Tested on Purdue Anvil · Jul 2026',
      scope: [
        'Scheduler: Slurm 9.9.9', 'Runtime: Apptainer 8.8.8', 'Workflow revision: v0.1.0',
        plain.tested.text, 'limitation zero',
      ],
    });
    expect(summarizeRecord(record()).scope).toContain('check one');
  });

  it('keeps a version that does not repeat the product name', () => {
    const scope = summarizeRecord(record({ scheduler: { family: 'Slurm', version: '25.11.1' }, runtime: { name: 'Apptainer', version: '1.4.3-1.el8' } })).scope;
    expect(scope.slice(0, 2)).toEqual(['Scheduler: Slurm 25.11.1', 'Runtime: Apptainer 1.4.3-1.el8']);
  });
});

describe('namedVersion', () => {
  it('drops a leading copy of the name, case-insensitively, and nothing else', () => {
    expect(namedVersion('Slurm', 'slurm 25.11.1')).toBe('Slurm 25.11.1');
    expect(namedVersion('Apptainer', 'Apptainer 1.4.3-1.el8')).toBe('Apptainer 1.4.3-1.el8');
    expect(namedVersion('Slurm', '25.11.1')).toBe('Slurm 25.11.1');
    expect(namedVersion('Slurm', 'slurm-25.11.1')).toBe('Slurm slurm-25.11.1');
  });
});

describe('currentBaselineRecord', () => {
  it('ignores newer records that belong to another workflow', () => {
    const baseline = record({ id: 'baseline-run' });
    const other = record({ id: 'other-run', workflow_id: 'layered-install-trees', validation_date: '2026-11-13', execution_date: '2026-11-13', review_after: '2027-02-13' });
    expect(currentRecord([baseline, other])?.id).toBe('other-run');
    expect(currentBaselineRecord([baseline, other])?.id).toBe('baseline-run');
    expect(currentBaselineRecord([other])).toBeUndefined();
  });
});
