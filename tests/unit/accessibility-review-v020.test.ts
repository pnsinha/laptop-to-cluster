import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { afterAll, describe, expect, it } from 'vitest';
import { accessibilityPages } from '../accessibility/browser-fixtures';
import { currentRecordId, validateAccessibilityReview } from '../../scripts/validate-accessibility-review';
import { readReleaseCandidate } from '../../scripts/release-version.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const load = (path: string) => parse(readFileSync(path, 'utf8'));
const recordId = currentRecordId(readReleaseCandidate(root, 'v0.2.0').evidenceIds);
const REQUIRED_CHECKS = [
  'keyboard', 'headings-landmarks', 'zoom-reflow', 'link-purpose', 'tables', 'alternatives',
  'media-captions-transcripts', 'light-dark-contrast', 'visual-hierarchy', 'typography',
  'static-figure', 'forced-colors-print', 'no-javascript', 'no-decorative-motion',
  'canonical-ownership', 'projection-count', 'pre-execution-warnings',
  'validation-source-agreement', 'editorial-concision',
];

// The checked-in review is read as it is. A signed copy, derived from it and kept in a temporary directory,
// proves the same assertions hold once a reviewer has signed: nothing here depends on the file's current state.
const scratch = mkdtempSync(join(tmpdir(), 'l2c-a11y-review-v020-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const signResult = (entry: { result: string }) => ({ ...entry, result: entry.result === 'pending' ? 'pass' : entry.result });
const checkedIn = load(`${root}/releases/v0.2.0/accessibility-review.yml`);
const signedPath = join(scratch, 'accessibility-review.yml');
writeFileSync(signedPath, stringify({
  ...checkedIn, reviewer: 'Reviewer Name', reviewedAt: '2026-10-01', releaseReady: true,
  reviewedCommit: '0123456789abcdef0123456789abcdef01234567', reviewedDeploymentUrl: 'https://0a1b2c3d.laptop-to-cluster.pages.dev',
  checks: checkedIn.checks.map(signResult),
  manualRouteSamples: checkedIn.manualRouteSamples.map(signResult),
  canonicalDestinationTrace: checkedIn.canonicalDestinationTrace.map(signResult),
}, { lineWidth: 0 }));
const signedCopy = load(signedPath);

describe.each([['the checked-in review', checkedIn], ['a signed copy of it', signedCopy]])('v0.2.0 accessibility review: %s', (_label, record) => {
  const signed = record.releaseReady === true;

  it('identifies the release', () => {
    expect(record.id).toBe('accessibility-review-v0.2.0');
    expect(record.release).toBe('v0.2.0');
    expect(typeof record.releaseReady).toBe('boolean');
  });

  it(signed ? 'names the reviewer and the review date once signed' : 'leaves the sign-off to the reviewer while unsigned', () => {
    if (signed) {
      expect(record.reviewer).not.toBe('EXTERNAL_REQUIRED');
      expect(String(record.reviewer).trim().length).toBeGreaterThan(0);
      expect(record.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(record.reviewedCommit).toMatch(/^[0-9a-f]{40}$/);
      expect(record.reviewedDeploymentUrl).toMatch(/^https:\/\/\S+$/);
    } else {
      expect(record.reviewer).toBe('EXTERNAL_REQUIRED');
      expect(record.reviewedAt).toBe('EXTERNAL_REQUIRED');
      expect(record.reviewedCommit).toBe('EXTERNAL_REQUIRED');
      expect(record.reviewedDeploymentUrl).toBe('EXTERNAL_REQUIRED');
    }
  });

  it('passes the structure check in either state', () => {
    expect(validateAccessibilityReview(record, { version: 'v0.2.0', recordId })).toEqual([]);
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

  it(signed ? 'leaves nothing pending once signed' : 'records nothing as passed before a human has looked', () => {
    const results = [...record.checks, ...record.manualRouteSamples, ...record.canonicalDestinationTrace].map(({ result }: { result: string }) => result);
    if (signed) expect(results.every((result) => result === 'pass' || result === 'not-applicable')).toBe(true);
    else expect(results.every((result) => result === 'pending' || result === 'not-applicable')).toBe(true);
  });

  it('traces release facts to the current destinations', () => {
    const trace = (subject: string) => record.canonicalDestinationTrace.find((entry: { subject: string }) => entry.subject === subject);
    expect(trace('release').destination).toBe('/milestones/2/');
    expect(trace('applicability').destination).toBe(`/applicability/${recordId}/`);
    expect(trace('evidence').destination).toBe(`/applicability/${recordId}/`);
  });

  const note = (id: string): string => record.checks.find((check: { id: string }) => check.id === id).notes;

  it('describes the home reading order the scanner checks: hero, evidence projection, doors, big idea, crosswalk', () => {
    expect(note('zoom-reflow')).toContain('hero, evidence projection, doors, big idea and crosswalk reading order at 320 px');
  });

  it('describes the single theme toggle and its precedence rules, not three theme buttons', () => {
    const text = note('theme-precedence');
    expect(text).toContain('accessible name "Dark theme"');
    expect(text).toContain('aria-pressed');
    expect(text).toContain('a stored light or dark choice beats the OS');
    expect(text).toContain('a click that lands on the OS value clears the stored choice');
    expect(text).toContain('with nothing stored the page follows a live OS change');
    expect(text).not.toMatch(/\bSystem\b|three (theme )?(buttons|choices)|Light or Dark/);
  });

  it('places the timeline on module pages only, as the scanner and the manual checklist do', () => {
    const mentions = record.checks.filter((check: { notes: string }) => /timeline/i.test(check.notes));
    expect(mentions.length).toBeGreaterThan(0);
    for (const check of mentions) expect(check.notes, check.id).toMatch(/Module 2|module pages?|learning-module/i);
    expect(note('no-javascript')).toContain('the six timeline steps on Module 2');
  });

  it('describes the timeline figure, not the removed workflow figure', () => {
    const text = JSON.stringify(record);
    expect(text).toContain('Timeline figure');
    expect(text).not.toMatch(/WorkflowFigure|workflow figure/i);
  });
});
