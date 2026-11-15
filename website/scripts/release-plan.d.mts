export const FROZEN_RELEASES: string[];
export interface ReleasePlanInput {
  eventName: string; refType: string; refName: string; preview?: boolean;
  fallbackVersion?: string; commitDate: string; sha: string;
}
export interface ReleasePlan {
  mode: 'preview' | 'production'; version: string; date: string; sha: string; artifactName: string; recordArtifactName: string;
}
export function planRelease(input: ReleasePlanInput): ReleasePlan;
export function toOutputLines(plan: ReleasePlan): string[];
