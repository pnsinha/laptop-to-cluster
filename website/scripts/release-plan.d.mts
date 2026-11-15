export const SHOWCASE_BRANCH: string;
export const FROZEN_RELEASES: string[];
export interface ReleasePlanInput {
  eventName: string; refType: string; refName: string; dispatchRelease?: string;
  candidateVersion: string; commitDate: string; sha: string;
}
export interface ReleasePlan {
  mode: 'preview' | 'production'; version: string; date: string; sha: string; preview: '' | '1'; fullGate: boolean;
  deployBranch: 'preview' | 'main'; artifactName: string; recordArtifactName: string;
}
export function planRelease(input: ReleasePlanInput): ReleasePlan;
export function toOutputLines(plan: ReleasePlan): string[];
