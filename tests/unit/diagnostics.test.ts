import { describe, expect, it } from 'vitest';
import {
  canonicalDiagnosticId,
  diagnosticHref,
  displayDiagnosticCode,
  isReadinessTimeoutDiagnostic,
} from '../../site/src/content/diagnostics.js';

describe('diagnostic identifiers', () => {
  it('keeps the published stable IDs while normalizing the legacy readiness spelling', () => {
    expect(canonicalDiagnosticId('BSSW-PREREQ-SLURM')).toBe('BSSW-PREREQ-SLURM');
    expect(canonicalDiagnosticId('BSSW-READY-TIMEOUT')).toBe('BSSW-READINESS-TIMEOUT');
    expect(canonicalDiagnosticId(' bssw-ready-timeout ')).toBe('BSSW-READINESS-TIMEOUT');
  });

  it('presents short reader codes without changing stable route identity', () => {
    expect(displayDiagnosticCode('BSSW-PREREQ-SLURM')).toBe('PREREQ-SLURM');
    expect(displayDiagnosticCode('BSSW-READY-TIMEOUT')).toBe('READINESS-TIMEOUT');
    expect(diagnosticHref('BSSW-READY-TIMEOUT')).toBe('/diagnostics/#bssw-readiness-timeout');
  });

  it('recognizes both current and historical readiness-timeout evidence IDs', () => {
    expect(isReadinessTimeoutDiagnostic('BSSW-READINESS-TIMEOUT')).toBe(true);
    expect(isReadinessTimeoutDiagnostic('BSSW-READY-TIMEOUT')).toBe(true);
    expect(isReadinessTimeoutDiagnostic('BSSW-PREREQ-SLURM')).toBe(false);
    expect(isReadinessTimeoutDiagnostic(undefined)).toBe(false);
  });
});
