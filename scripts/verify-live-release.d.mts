export interface LiveReleaseOptions {
  origin: string; distDir: string; fetchImpl?: typeof fetch; attempts?: number; delayMs?: number; wait?: (ms: number) => Promise<void>;
}
export function checkOnce(options: Pick<LiveReleaseOptions, 'origin' | 'distDir' | 'fetchImpl'>): Promise<string[]>;
export function verifyLiveRelease(options: LiveReleaseOptions): Promise<{ ok: boolean; attempts: number; problems: string[] }>;
