export type DiagnosticIdentifier = `BSSW-${string}`;

/**
 * Stable diagnostic IDs are part of content references, URLs, workflow logs,
 * and published evidence. Keep the historical runtime spelling as an alias
 * while giving readers a short, stable display code.
 */
export const READINESS_TIMEOUT_ID = 'BSSW-READINESS-TIMEOUT' as const;
export const READINESS_TIMEOUT_LEGACY_ID = 'BSSW-READY-TIMEOUT' as const;

/** Every diagnostic ID the workflow scripts print (slurm/baseline.sbatch, then container/acquire.sh), in first-printed order. */
export const PRINTED_DIAGNOSTIC_IDS = [
  'BSSW-CLEANUP-CHILD', 'BSSW-CLEANUP-SIGNAL', 'BSSW-PREQ-SLURM', 'BSSW-PREQ-APPTAINER', 'BSSW-PREQ-COMMAND',
  'BSSW-PREQ-VALUE', 'BSSW-PREQ-IMAGE', 'BSSW-PREQ-INPUT', 'BSSW-INTEGRITY-INPUT', 'BSSW-INTEGRITY-IMAGE',
  'BSSW-PREQ-STORAGE', 'BSSW-COORDINATOR-EXIT', READINESS_TIMEOUT_LEGACY_ID, 'BSSW-WORKER-EXIT', 'BSSW-VERIFY-RESULT',
] as const;
export type PrintedDiagnosticId = typeof PRINTED_DIAGNOSTIC_IDS[number];

/** Canonical content IDs whose printed spelling differs. Canonical IDs stay the route and evidence identity. */
const PRINTED_BY_CANONICAL: Readonly<Record<string, PrintedDiagnosticId>> = {
  'BSSW-PREREQ-SLURM': 'BSSW-PREQ-SLURM',
  'BSSW-PREREQ-APPTAINER': 'BSSW-PREQ-APPTAINER',
  'BSSW-STORAGE-UNAVAILABLE': 'BSSW-PREQ-STORAGE',
  [READINESS_TIMEOUT_ID]: READINESS_TIMEOUT_LEGACY_ID,
};
const CANONICAL_BY_PRINTED: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(PRINTED_BY_CANONICAL).map(([canonical, printed]) => [printed, canonical]),
);

export function canonicalDiagnosticId(identifier: string): string {
  const normalized = identifier.trim().toUpperCase();
  return CANONICAL_BY_PRINTED[normalized] ?? normalized;
}

export function displayDiagnosticCode(identifier: string): string {
  return printedDiagnosticId(identifier).replace(/^BSSW-/, '');
}

export function diagnosticHref(identifier: string): string {
  return `/diagnostics/#${canonicalDiagnosticId(identifier).toLowerCase()}`;
}

export function isReadinessTimeoutDiagnostic(identifier: string | undefined): boolean {
  return identifier !== undefined && canonicalDiagnosticId(identifier) === READINESS_TIMEOUT_ID;
}

/** The ID exactly as the workflow prints it; diagnostic headings show this. */
export function printedDiagnosticId(identifier: string): string {
  const canonical = canonicalDiagnosticId(identifier);
  return PRINTED_BY_CANONICAL[canonical] ?? canonical;
}

/** Primary fragment id for a diagnostic section: the printed ID, lower-cased. */
export function diagnosticAnchor(identifier: string): string {
  return printedDiagnosticId(identifier).toLowerCase();
}

/** Older fragment ids that must keep resolving (the canonical ID, lower-cased) when they differ from the primary anchor. */
export function diagnosticAliasAnchors(identifier: string): string[] {
  const legacy = canonicalDiagnosticId(identifier).toLowerCase();
  return legacy === diagnosticAnchor(identifier) ? [] : [legacy];
}

/** Link to a diagnostic section by its primary (printed) anchor. */
export function printedDiagnosticHref(identifier: string): string {
  return `/diagnostics/#${diagnosticAnchor(identifier)}`;
}
