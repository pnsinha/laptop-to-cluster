import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { accessibilityPages } from '../accessibility/browser-fixtures';
import { currentRecordId } from '../../scripts/validate-accessibility-review';
import { readReleaseCandidate } from '../../scripts/release-version.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const record = parse(readFileSync(`${root}/releases/v0.2.0/accessibility-review.yml`, 'utf8'));
const recordId = currentRecordId(readReleaseCandidate(root, 'v0.2.0').evidenceIds);
const REQUIRED_CHECKS = [
  'keyboard', 'headings-landmarks', 'zoom-reflow', 'link-purpose', 'tables', 'alternatives',
  'media-captions-transcripts', 'light-dark-contrast', 'visual-hierarchy', 'typography',
  'static-figure', 'forced-colors-print', 'no-javascript', 'no-decorative-motion',
  'canonical-ownership', 'projection-count', 'pre-execution-warnings',
  'validation-source-agreement', 'editorial-concision',
];

describe('v0.2.0 accessibility review draft', () => {
  it('identifies the release and leaves the sign-off to Parm', () => {
    expect(record.id).toBe('accessibility-review-v0.2.0');
    expect(record.release).toBe('v0.2.0');
    expect(record.reviewer).toBe('EXTERNAL_REQUIRED');
    expect(record.reviewedAt).toBe('EXTERNAL_REQUIRED');
    expect(record.releaseReady).toBe(false);
  });

  it('lists exactly the pages the scanner visits, except the 404 shell', () => {
    const scanned = accessibilityPages.map(({ path }) => path).filter((path) => path !== '/404');
    const listed: string[] = record.automatedEvidence.representativePages;
    for (const path of scanned) expect(listed, path).toContain(path);
    expect(listed).toContain(`/applicability/${recordId}/`);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('samples every new route by hand and every required check with real notes', () => {
    const sampled = new Set(record.manualRouteSamples.map(({ route }: { route: string }) => route));
    for (const route of ['/guide/tour/', '/guide/compose-to-hpc-translation/', '/adoption/evaluate/', '/about/talks-and-papers/', '/milestones/2/', '/events/iguide-forum-2026/', '/404']) {
      expect(sampled.has(route), route).toBe(true);
    }
    expect(sampled.has(`/applicability/${recordId}/`)).toBe(true);
    const checks = new Map(record.checks.map((check: { id: string }) => [check.id, check]));
    for (const id of [...REQUIRED_CHECKS, 'theme-precedence', 'font-failure', 'evidence-badge-panel', 'voiceover', 'keyboard-new-components']) {
      const check = checks.get(id) as { notes?: string } | undefined;
      expect(check?.notes?.trim().length ?? 0, id).toBeGreaterThan(40);
    }
  });

  it('records nothing as passed before a human has looked, and traces release facts to the current destinations', () => {
    const results = [...record.checks, ...record.manualRouteSamples, ...record.canonicalDestinationTrace].map(({ result }: { result: string }) => result);
    expect(results.every((result) => result === 'pending' || result === 'not-applicable')).toBe(true);
    const trace = (subject: string) => record.canonicalDestinationTrace.find((entry: { subject: string }) => entry.subject === subject);
    expect(trace('release').destination).toBe('/milestones/2/');
    expect(trace('applicability').destination).toBe(`/applicability/${recordId}/`);
    expect(trace('evidence').destination).toBe(`/applicability/${recordId}/`);
  });

  it('describes the timeline figure, not the removed workflow figure', () => {
    const text = JSON.stringify(record);
    expect(text).toContain('Timeline figure');
    expect(text).not.toMatch(/WorkflowFigure|workflow figure/i);
  });
});
