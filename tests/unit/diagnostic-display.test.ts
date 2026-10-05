import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  PRINTED_DIAGNOSTIC_IDS, canonicalDiagnosticId, diagnosticAliasAnchors, diagnosticAnchor, diagnosticHref,
  displayDiagnosticCode, isReadinessTimeoutDiagnostic, printedDiagnosticHref, printedDiagnosticId,
} from '../../site/src/content/diagnostics.js';

const printedIn = (path: string) => [...new Set([...readFileSync(path, 'utf8').matchAll(/\bBSSW-[A-Z]+(?:-[A-Z]+)+\b/g)].map(([id]) => id))];
const contentDir = 'site/src/content/content-items';
const diagnosticItems = readdirSync(contentDir).filter((name) => name.startsWith('diagnostic-'))
  .map((name) => parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(`${contentDir}/${name}`, 'utf8'))![1]) as { id: string; stable_slug: string });

describe('printed diagnostic IDs', () => {
  it('lists exactly the IDs the workflow scripts print, in first-printed order', () => {
    const sbatch = printedIn('workflows/baseline-slurm-apptainer/slurm/baseline.sbatch');
    const acquire = printedIn('workflows/baseline-slurm-apptainer/container/acquire.sh');
    expect([...new Set([...sbatch, ...acquire])]).toEqual([...PRINTED_DIAGNOSTIC_IDS]);
  });

  it('maps each canonical content ID to the ID a reader sees, and back', () => {
    expect(printedDiagnosticId('BSSW-PREREQ-SLURM')).toBe('BSSW-PREQ-SLURM');
    expect(printedDiagnosticId('BSSW-PREREQ-APPTAINER')).toBe('BSSW-PREQ-APPTAINER');
    expect(printedDiagnosticId('BSSW-STORAGE-UNAVAILABLE')).toBe('BSSW-PREQ-STORAGE');
    expect(printedDiagnosticId('BSSW-READINESS-TIMEOUT')).toBe('BSSW-READY-TIMEOUT');
    expect(printedDiagnosticId('BSSW-PREQ-INPUT')).toBe('BSSW-PREQ-INPUT');
    expect(canonicalDiagnosticId('BSSW-PREQ-SLURM')).toBe('BSSW-PREREQ-SLURM');
    expect(canonicalDiagnosticId(' bssw-preq-storage ')).toBe('BSSW-STORAGE-UNAVAILABLE');
    expect(canonicalDiagnosticId('BSSW-VERIFY-RESULT')).toBe('BSSW-VERIFY-RESULT');
  });

  it('shows the short code the workflow prints, whichever spelling is passed in', () => {
    for (const id of ['BSSW-PREREQ-SLURM', 'BSSW-PREQ-SLURM']) expect(displayDiagnosticCode(id)).toBe('PREQ-SLURM');
    for (const id of ['BSSW-READINESS-TIMEOUT', 'BSSW-READY-TIMEOUT']) expect(displayDiagnosticCode(id)).toBe('READY-TIMEOUT');
    expect(displayDiagnosticCode('BSSW-STORAGE-UNAVAILABLE')).toBe('PREQ-STORAGE');
    expect(displayDiagnosticCode('BSSW-VERIFY-RESULT')).toBe('VERIFY-RESULT');
  });

  it('keeps the canonical readiness ID that evidence validation depends on', () => {
    expect(canonicalDiagnosticId('BSSW-READY-TIMEOUT')).toBe('BSSW-READINESS-TIMEOUT');
    expect(isReadinessTimeoutDiagnostic('BSSW-READY-TIMEOUT')).toBe(true);
    expect(isReadinessTimeoutDiagnostic('BSSW-PREQ-STORAGE')).toBe(false);
  });
});

describe('diagnostic anchors', () => {
  it('uses the printed ID as the primary anchor and keeps the old anchor as an alias', () => {
    expect(diagnosticAnchor('BSSW-PREREQ-SLURM')).toBe('bssw-preq-slurm');
    expect(diagnosticAliasAnchors('BSSW-PREREQ-SLURM')).toEqual(['bssw-prereq-slurm']);
    expect(diagnosticAnchor('BSSW-READY-TIMEOUT')).toBe('bssw-ready-timeout');
    expect(diagnosticAliasAnchors('BSSW-READY-TIMEOUT')).toEqual(['bssw-readiness-timeout']);
    expect(diagnosticAliasAnchors('BSSW-PREQ-INPUT')).toEqual([]);
    expect(printedDiagnosticHref('BSSW-STORAGE-UNAVAILABLE')).toBe('/diagnostics/#bssw-preq-storage');
  });

  it('still resolves every published diagnostic anchor', () => {
    expect(diagnosticItems.length).toBeGreaterThan(0);
    for (const { id, stable_slug: slug } of diagnosticItems) {
      expect([diagnosticAnchor(id), ...diagnosticAliasAnchors(id)], id).toContain(slug);
      expect(diagnosticHref(id).slice('/diagnostics/#'.length), id).toBe(slug);
    }
  });
});
