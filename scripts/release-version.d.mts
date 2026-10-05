export const RELEASE_VERSION_PATTERN: RegExp;
export function assertReleaseVersion(version: string): string;
export function resolveReleaseVersion(root?: string, env?: Record<string, string | undefined>): string;
