import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { projectEvidencePanel } from '../../site/src/content/projections.js';
import { applicabilityRecordSchema } from '../../site/src/content/schema.js';
import { validateEvidenceRepository, validateRelatedEvidence } from '../../scripts/evidence.js';

const read = (name: string) => applicabilityRecordSchema.parse(parse(readFileSync(`site/src/content/applicability/${name}.yml`, 'utf8')));
const m1 = read('m1-baseline-anvil');
const m2 = read('m2-baseline-anvil-2026-10');
const plain = m2.plain_language!;

describe('m2-baseline-anvil-2026-10', () => {
  it('is a validated primary-environment record for the same workflow, run from the v0.1.0 tag', () => {
    expect(m2).toMatchObject({ workflow_id: m1.workflow_id, status: 'validated', workflow_revision: 'v0.1.0' });
    expect(m2.environment).toMatchObject({ public_name: 'Purdue Anvil', fallback: false });
    expect(m2.validation_date > m1.validation_date).toBe(true);
  });

  it('supersedes the July record and leaves that record\'s manifest reference untouched', () => {
    expect(m1.superseded_by).toBe(m2.id);
    expect(m1.evidence).toEqual({
      id: 'anvil-v0-1-0-success-20260725', path: 'evidence/anvil-v0-1-0-success-20260725/manifest.json',
      integrity: 'sha256:c92906581d8bc31e6238eff8ce90ea8073dbe3316afb67d5369f08d064ee26e3',
    });
  });

  it('names its bundles by date and lists the deliberate failure run', () => {
    expect(m2.evidence.id).toMatch(/^anvil-baseline-\d{8}-success$/);
    expect(m2.related_evidence).toHaveLength(1);
    expect(m2.related_evidence[0]).toMatchObject({ role: 'negative-test' });
    expect(m2.related_evidence[0].id).toMatch(/^anvil-baseline-\d{8}-readiness-timeout$/);
    expect(validateRelatedEvidence(m2, '.')).toEqual([]);
  });

  it('links both manifests at the commit that added the bundles, never at a release tag', () => {
    for (const { path } of [m2.evidence, ...m2.related_evidence]) {
      const entry = m2.provenance.find(({ reference }) => reference.path === path);
      expect(entry, path).toBeDefined();
      expect(entry!.reference.release).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it('states the acquisition-script boundary in plain language without a job ID or allocation', () => {
    const boundary = m2.portability_boundaries.findIndex((text) => /acquisition script cannot rebuild the image without privileges/.test(text));
    expect(boundary).toBeGreaterThanOrEqual(0);
    expect(plain.depends_on_center.some(({ from }) => from.includes(`portability_boundaries.${boundary}`))).toBe(true);
  });

  it('passes every repository evidence check as of today', () => {
    expect(validateEvidenceRepository('.', new Date().toISOString().slice(0, 10))).toEqual([]);
  });

  it('shows a month-and-year badge and names no system, version, date, or job ID in plain language', () => {
    expect(projectEvidencePanel(m2).badgeText).toMatch(/^Tested on Purdue Anvil · [A-Z][a-z]{2} 2026$/);
    for (const { text } of [plain.tested, ...plain.you_need, ...plain.depends_on_center]) {
      expect(text.replace('127.0.0.1', 'loopback address')).not.toMatch(/Anvil|Expanse|Purdue|\d{4}-\d{2}-\d{2}|\d+\.\d+\.\d+|sha256/i);
    }
  });
});
