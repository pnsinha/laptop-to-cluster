import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FROZEN_RELEASES, planRelease, toOutputLines } from '../../scripts/release-plan.mjs';
import { resolveReleaseVersion } from '../../scripts/release-version.mjs';

const sha = 'a'.repeat(40);
const base = { commitDate: '2026-11-15', sha, fallbackVersion: 'v0.2.0' };

describe('what a release run may do', () => {
  it('treats a pushed vX.Y.Z tag as production and names the artifacts after version and commit', () => {
    const plan = planRelease({ ...base, eventName: 'push', refType: 'tag', refName: 'v0.3.1' });
    expect(plan).toMatchObject({ mode: 'production', version: 'v0.3.1', artifactName: `validated-site-v0.3.1-${sha}`, recordArtifactName: `release-record-v0.3.1-${sha}` });
    expect(toOutputLines(plan)).toContain('mode=production');
  });

  it('refuses a branch push, a release-candidate tag and the frozen release', () => {
    expect(() => planRelease({ ...base, eventName: 'push', refType: 'branch', refName: 'main' })).toThrow(/not a release tag/);
    expect(() => planRelease({ ...base, eventName: 'push', refType: 'tag', refName: 'v0.3.0-rc.1' })).toThrow(/not a release tag/);
    expect(FROZEN_RELEASES).toEqual(['v0.1.0']);
    expect(() => planRelease({ ...base, eventName: 'push', refType: 'tag', refName: 'v0.1.0' })).toThrow(/frozen/);
  });

  it('previews any ref by hand, and redeploys to production only from a tag', () => {
    expect(planRelease({ ...base, eventName: 'workflow_dispatch', refType: 'branch', refName: 'feature', preview: true })).toMatchObject({ mode: 'preview', version: 'v0.2.0' });
    expect(planRelease({ ...base, eventName: 'workflow_dispatch', refType: 'tag', refName: 'v0.2.0', preview: false }).mode).toBe('production');
    expect(() => planRelease({ ...base, eventName: 'workflow_dispatch', refType: 'branch', refName: 'main', preview: false })).toThrow(/only on a vX\.Y\.Z tag/);
    expect(() => planRelease({ ...base, eventName: 'schedule', refType: 'branch', refName: 'main' })).toThrow(/not deployable/);
  });
});

describe('release version rule', () => {
  const saved = process.env.RELEASE_VERSION;
  const dirs: string[] = [];
  afterEach(() => {
    if (saved === undefined) delete process.env.RELEASE_VERSION; else process.env.RELEASE_VERSION = saved;
    dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  });
  const project = (version: unknown) => {
    const dir = mkdtempSync(join(tmpdir(), 'l2c-version-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ version }));
    return dir;
  };

  it('uses RELEASE_VERSION when set, else v plus the package.json version, and never guesses', () => {
    delete process.env.RELEASE_VERSION;
    expect(resolveReleaseVersion(project('1.2.3'))).toBe('v1.2.3');
    process.env.RELEASE_VERSION = ' v9.9.9 ';
    expect(resolveReleaseVersion(project('1.2.3'))).toBe('v9.9.9');
    delete process.env.RELEASE_VERSION;
    expect(() => resolveReleaseVersion(project('next'))).toThrow(/RELEASE_VERSION/);
  });
});
