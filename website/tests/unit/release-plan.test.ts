import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { planRelease, toOutputLines } from '../../scripts/release-plan.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const sha = 'a'.repeat(40);
const base = { candidateVersion: 'v0.2.0', commitDate: '2026-10-15', sha };
const plan = (input: Record<string, unknown>) => planRelease({ ...base, ...input } as any);

describe('planRelease: what a run may do', () => {
  it('previews a push to the showcase branch without the full gate', () => {
    expect(plan({ eventName: 'push', refType: 'branch', refName: 'v0.2.0-showcase' })).toMatchObject({
      mode: 'preview', version: 'v0.2.0', preview: '1', fullGate: false, deployBranch: 'preview', date: '2026-10-15', sha,
      artifactName: `validated-site-v0.2.0-${sha}`, recordArtifactName: `release-record-v0.2.0-${sha}`,
    });
  });

  it('previews a release-candidate tag with the full gate', () => {
    expect(plan({ eventName: 'push', refType: 'tag', refName: 'v0.2.0-rc.1' })).toMatchObject({ mode: 'preview', version: 'v0.2.0', preview: '1', fullGate: true, deployBranch: 'preview' });
  });

  it('publishes an exact release tag to production with the full gate', () => {
    expect(plan({ eventName: 'push', refType: 'tag', refName: 'v0.2.0' })).toMatchObject({ mode: 'production', version: 'v0.2.0', preview: '', fullGate: true, deployBranch: 'main' });
  });

  it('allows a post-merge dispatch for a release, only from main', () => {
    expect(plan({ eventName: 'workflow_dispatch', refType: 'branch', refName: 'main', dispatchRelease: 'v0.2.0' })).toMatchObject({ mode: 'production', version: 'v0.2.0' });
    expect(() => plan({ eventName: 'workflow_dispatch', refType: 'branch', refName: 'v0.2.0-showcase', dispatchRelease: 'v0.2.0' })).toThrow(/runs only from main/);
    expect(() => plan({ eventName: 'workflow_dispatch', refType: 'tag', refName: 'v0.2.0', dispatchRelease: 'v0.2.0' })).toThrow(/runs only from main/);
  });

  it('never deploys the frozen release', () => {
    expect(() => plan({ eventName: 'push', refType: 'tag', refName: 'v0.1.0', candidateVersion: 'v0.1.0' })).toThrow(/frozen/);
    expect(() => plan({ eventName: 'workflow_dispatch', refType: 'branch', refName: 'main', dispatchRelease: 'v0.1.0', candidateVersion: 'v0.1.0' })).toThrow(/frozen/);
  });

  it('refuses a tag that disagrees with the candidate record', () => {
    expect(() => plan({ eventName: 'push', refType: 'tag', refName: 'v0.3.0' })).toThrow(/says v0\.2\.0/);
    expect(() => plan({ eventName: 'push', refType: 'tag', refName: 'v0.3.0-rc.1' })).toThrow(/says v0\.2\.0/);
    expect(() => plan({ eventName: 'workflow_dispatch', refType: 'branch', refName: 'main', dispatchRelease: 'v0.3.0' })).toThrow(/says v0\.2\.0/);
  });

  it('refuses anything that is not a release ref', () => {
    for (const refName of ['v0.2.0-beta', 'v0.2', 'release-v0.2.0', 'v0.2.0-rc', 'V0.2.0']) {
      expect(() => plan({ eventName: 'push', refType: 'tag', refName })).toThrow(/not a release tag/);
    }
    expect(() => plan({ eventName: 'push', refType: 'branch', refName: 'main' })).toThrow(/not deployable/);
    expect(() => plan({ eventName: 'pull_request', refType: 'branch', refName: 'v0.2.0-showcase' })).toThrow(/not deployable/);
  });

  it('rejects a malformed dispatch input, including shell metacharacters', () => {
    for (const dispatchRelease of ['', 'v0.2', 'v0.2.0; rm -rf /', 'v0.2.0\nmode=production', '$(id)']) {
      expect(() => plan({ eventName: 'workflow_dispatch', refType: 'branch', refName: 'main', dispatchRelease })).toThrow(/must look like v1\.2\.3/);
    }
  });

  it('rejects incomplete identity', () => {
    expect(() => plan({ eventName: 'push', refType: 'branch', refName: 'v0.2.0-showcase', commitDate: 'today' })).toThrow(/YYYY-MM-DD/);
    expect(() => plan({ eventName: 'push', refType: 'branch', refName: 'v0.2.0-showcase', sha: 'abc' })).toThrow(/full commit SHA/);
    expect(() => plan({ eventName: 'push', refType: 'branch', refName: 'v0.2.0-showcase', candidateVersion: 'main' })).toThrow(/v1\.2\.3/);
  });
});

describe('toOutputLines', () => {
  it('prints one key=value line per output', () => {
    const lines = toOutputLines(plan({ eventName: 'push', refType: 'tag', refName: 'v0.2.0' }));
    expect(lines).toEqual([
      'mode=production', 'version=v0.2.0', 'date=2026-10-15', `sha=${sha}`, 'preview=', 'full-gate=true', 'deploy-branch=main',
      `artifact-name=validated-site-v0.2.0-${sha}`, `record-artifact-name=release-record-v0.2.0-${sha}`,
    ]);
  });
});

describe('release-plan CLI', () => {
  const temporary: string[] = [];
  afterEach(() => temporary.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
  function checkout() {
    const root = mkdtempSync(join(tmpdir(), 'l2c-release-plan-'));
    temporary.push(root);
    mkdirSync(join(root, 'releases/v0.2.0'), { recursive: true });
    writeFileSync(join(root, 'releases/v0.2.0/release-candidate.json'), JSON.stringify({ version: 'v0.2.0' }));
    const git = (...args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_AUTHOR_DATE: '2026-10-15T12:00:00Z', GIT_COMMITTER_DATE: '2026-10-15T12:00:00Z' } });
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'fixture');
    return root;
  }
  const run = (root: string, env: Record<string, string>) =>
    spawnSync(process.execPath, [join(repo, 'scripts/release-plan.mjs'), root], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', GITHUB_SHA: sha, ...env } });

  it('prints the plan for a production tag, taking the date from the commit and ignoring RELEASE_VERSION', () => {
    const root = checkout();
    const result = run(root, { GITHUB_EVENT_NAME: 'push', GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.2.0', RELEASE_VERSION: 'v0.1.0' });
    expect(result.status, result.stderr).toBe(0);
    const lines = result.stdout.trim().split('\n');
    expect(lines).toContain('mode=production');
    expect(lines).toContain('version=v0.2.0');
    expect(lines).toContain('date=2026-10-15');
    expect(lines).toContain(`sha=${sha}`);
  });

  it('names the checked-out commit from RELEASE_SHA when it differs from GITHUB_SHA (manual dispatch of a tag)', () => {
    const root = checkout();
    const tagged = 'b'.repeat(40);
    const result = run(root, { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main', INPUT_RELEASE: 'v0.2.0', RELEASE_SHA: tagged });
    expect(result.status, result.stderr).toBe(0);
    const lines = result.stdout.trim().split('\n');
    expect(lines).toContain(`sha=${tagged}`);
    expect(lines).toContain(`artifact-name=validated-site-v0.2.0-${tagged}`);
  });

  it('exits 1 with an ERROR line for a frozen tag', () => {
    const root = checkout();
    const result = run(root, { GITHUB_EVENT_NAME: 'push', GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.1.0' });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^ERROR: /);
  });
});
