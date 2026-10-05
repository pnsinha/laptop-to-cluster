export const RELEASE_VERSION_PATTERN: RegExp;
export function assertReleaseVersion(version: string): string;
export function resolveReleaseVersion(root?: string, env?: Record<string, string | undefined>): string;
export function readReleaseCandidate(root: string, version: string): {
  version: string; repositoryTag: string; canonicalOrigin: string; evidenceIds: string[];
  changes: { class: string; itemId: string }[]; [key: string]: unknown;
};
