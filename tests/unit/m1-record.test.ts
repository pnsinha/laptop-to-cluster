import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { projectEvidencePanel } from '../../site/src/content/projections.js';
import { applicabilityRecordSchema } from '../../site/src/content/schema.js';
import { sha256File, validateRelatedEvidence } from '../../scripts/evidence.js';

const record = applicabilityRecordSchema.parse(parse(readFileSync('site/src/content/applicability/m1-baseline-anvil.yml', 'utf8')));
const plain = record.plain_language!;
const allItems = [plain.tested, ...plain.you_need, ...plain.depends_on_center];

describe('m1-baseline-anvil record', () => {
  it('lists the deliberate readiness-timeout run as negative-test evidence with a manifest integrity', () => {
    expect(record.related_evidence).toHaveLength(1);
    const [related] = record.related_evidence;
    expect(related).toMatchObject({ id: 'anvil-v0-1-0-readiness-timeout-20260725', role: 'negative-test' });
    expect(related.path).toBe(`evidence/${related.id}/manifest.json`);
    expect(related.integrity).toBe(sha256File(related.path));
    expect(validateRelatedEvidence(record, '.')).toEqual([]);
  });

  it('keeps the literal lists that mirror the manifest', () => {
    expect(record.assumptions).toHaveLength(3);
    expect(record.portability_boundaries).toHaveLength(4);
    expect(record.result.checks).toHaveLength(4);
  });

  it('traces the tested row to the result checks and the failure run', () => {
    expect(plain.tested.from).toEqual(['result.checks', 'related_evidence.0']);
    expect(plain.tested.text).toMatch(/fail/i);
    expect(plain.tested.text).toMatch(/readiness gate/i);
  });

  it('states the loopback boundary in plain language, traced to the loopback assumption and boundary', () => {
    const loopback = plain.depends_on_center.find(({ text }) => /loopback/i.test(text));
    expect(loopback?.from).toEqual(['assumptions.2', 'portability_boundaries.3']);
    expect(loopback?.text).toContain('127.0.0.1');
    expect(loopback?.text).toMatch(/center approves/);
  });

  it('names no system, version, date, or job ID in plain language', () => {
    for (const { text } of allItems) {
      expect(text.replace('127.0.0.1', 'loopback address')).not.toMatch(/Anvil|Expanse|Purdue|\d{4}-\d{2}-\d{2}|\d+\.\d+\.\d+|19500\d{3}|sha256/i);
    }
  });

  it('produces the validated badge from the record', () => {
    expect(projectEvidencePanel(record).badgeText).toBe(`Tested on ${record.environment.public_name} · Jul 2026`);
  });
});
