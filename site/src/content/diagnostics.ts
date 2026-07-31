export type DiagnosticIdentifier = `BSSW-${string}`;

/**
 * Stable diagnostic IDs are part of content references, URLs, workflow logs,
 * and published evidence. Keep the historical runtime spelling as an alias
 * while giving readers a short, stable display code.
 */
export const READINESS_TIMEOUT_ID = 'BSSW-READINESS-TIMEOUT' as const;
export const READINESS_TIMEOUT_LEGACY_ID = 'BSSW-READY-TIMEOUT' as const;

export function canonicalDiagnosticId(identifier: string): string {
  const normalized = identifier.trim().toUpperCase();
  return normalized === READINESS_TIMEOUT_LEGACY_ID ? READINESS_TIMEOUT_ID : normalized;
}

export function displayDiagnosticCode(identifier: string): string {
  return canonicalDiagnosticId(identifier).replace(/^BSSW-/, '');
}

export function diagnosticHref(identifier: string): string {
  return `/diagnostics/#${canonicalDiagnosticId(identifier).toLowerCase()}`;
}

export function isReadinessTimeoutDiagnostic(identifier: string | undefined): boolean {
  return identifier !== undefined && canonicalDiagnosticId(identifier) === READINESS_TIMEOUT_ID;
}
