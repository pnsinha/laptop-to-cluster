import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createArtifactManifest } from '../../scripts/publication.mjs';
import { readReleaseCandidate } from '../../scripts/release-version.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
const sandbox = () => { const dir = mkdtempSync(join(tmpdir(), 'l2c-release-scripts-')); temporary.push(dir); return dir; };
const write = (path: string, value: unknown) => { mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value, null, 2)); };
const node = (script: string, args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [join(repo, 'scripts', script), ...args], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', ...env } });

const sha = (char: string) => char.repeat(64);
const candidate = (version: string, extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1, version, status: 'candidate', repositoryTag: version, canonicalOrigin: 'https://laptop-to-cluster.org',
  evidenceIds: ['m1-baseline-anvil'], changes: [{ class: 'added', itemId: 'x' }], ...extra,
});

describe('no release script is hard-wired to v0.1.0', () => {
  for (const script of ['prepare-publication.mjs', 'generate-release-record.mjs', 'update-recovery-index.mjs', 'rollback.mjs', 'release-version.mjs']) {
    it(`${script} contains no version literal`, () => {
      expect(readFileSync(join(repo, 'scripts', script), 'utf8')).not.toMatch(/['"`]v\d+\.\d+\.\d+['"`]/);
    });
  }
});

describe('readReleaseCandidate', () => {
  it('returns a record that can bind a publication', () => {
    const root = sandbox();
    write(join(root, 'releases/v0.2.0/release-candidate.json'), candidate('v0.2.0'));
    expect(readReleaseCandidate(root, 'v0.2.0').repositoryTag).toBe('v0.2.0');
  });

  it('names a missing record', () => {
    expect(() => readReleaseCandidate(sandbox(), 'v0.2.0')).toThrow('releases/v0.2.0/release-candidate.json is missing');
  });

  it('lists every problem in one message', () => {
    const root = sandbox();
    write(join(root, 'releases/v0.2.0/release-candidate.json'), candidate('v0.2.0', { version: 'v0.1.0', repositoryTag: undefined, evidenceIds: [], changes: [] }));
    let message = '';
    try { readReleaseCandidate(root, 'v0.2.0'); } catch (error) { message = (error as Error).message; }
    for (const fragment of ['version "v0.1.0" must equal v0.2.0', 'repositoryTag undefined must equal v0.2.0', 'evidenceIds', 'changes']) expect(message).toContain(fragment);
  });

  it('refuses a malformed version before touching the disk', () => {
    expect(() => readReleaseCandidate(sandbox(), '../x')).toThrow(/v1\.2\.3/);
  });
});

describe('generate-release-record.mjs', () => {
  const env = { CLOUDFLARE_DEPLOYMENT_ID: 'deployment-1', PAGES_DEV_FALLBACK_URL: 'https://abc123.laptop-to-cluster.pages.dev', RELEASE_DATE: '2026-10-15' };
  function publication(version: string) {
    const root = sandbox();
    const directory = join(root, 'publication', version);
    write(join(directory, 'artifact-manifest.json'), { artifactSha256: sha('a'), artifactFileManifestSha256: sha('b') });
    write(join(directory, 'release-binding.json'), {
      schemaVersion: 1, version, sourceCommit: 'c'.repeat(40), repositoryTag: version, canonicalOrigin: 'https://laptop-to-cluster.org',
      urlManifestSha256: sha('d'), artifactSha256: sha('a'), artifactFileManifestSha256: sha('b'),
      evidenceIds: ['m1-baseline-anvil'], changes: [{ class: 'added', itemId: 'x' }],
    });
    return { root, directory };
  }

  it('writes checksum-bound deployment and release records for the requested version', () => {
    const { root, directory } = publication('v0.2.0');
    const result = node('generate-release-record.mjs', [root], { ...env, RELEASE_VERSION: 'v0.2.0' });
    expect(result.status, result.stderr).toBe(0);
    const release = JSON.parse(readFileSync(join(directory, 'release-manifest.json'), 'utf8'));
    expect(release).toMatchObject({ version: 'v0.2.0', repositoryTag: 'v0.2.0', publishedAt: '2026-10-15' });
    expect(JSON.parse(readFileSync(join(directory, 'deployment-record.json'), 'utf8')).release).toBe('v0.2.0');
  });

  it('takes the version from the newest candidate when RELEASE_VERSION is unset', () => {
    const { root, directory } = publication('v0.2.0');
    write(join(root, 'releases/v0.2.0/release-candidate.json'), candidate('v0.2.0'));
    expect(node('generate-release-record.mjs', [root], env).status).toBe(0);
    expect(existsSync(join(directory, 'release-manifest.json'))).toBe(true);
  });

  it('writes nothing on a preview run', () => {
    const { root, directory } = publication('v0.2.0');
    const result = node('generate-release-record.mjs', [root], { ...env, RELEASE_VERSION: 'v0.2.0', PREVIEW: '1' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Preview run');
    expect(existsSync(join(directory, 'release-manifest.json'))).toBe(false);
    expect(existsSync(join(directory, 'deployment-record.json'))).toBe(false);
  });

  it('refuses a binding that belongs to another version', () => {
    const { root } = publication('v0.2.0');
    mkdirSync(join(root, 'publication/v0.3.0'), { recursive: true });
    write(join(root, 'publication/v0.3.0/artifact-manifest.json'), { artifactSha256: sha('a'), artifactFileManifestSha256: sha('b') });
    writeFileSync(join(root, 'publication/v0.3.0/release-binding.json'), readFileSync(join(root, 'publication/v0.2.0/release-binding.json')));
    const result = node('generate-release-record.mjs', [root], { ...env, RELEASE_VERSION: 'v0.3.0' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('release-binding.json is for v0.2.0, not v0.3.0');
  });

  it('rejects a malformed RELEASE_VERSION', () => {
    const { root } = publication('v0.2.0');
    expect(node('generate-release-record.mjs', [root], { ...env, RELEASE_VERSION: 'v0.2' }).status).not.toBe(0);
  });
});

describe('update-recovery-index.mjs', () => {
  const record = (release: string, sha256: string) => ({
    release, sourceCommit: 'c'.repeat(40), artifactSha256: sha256, artifactFileManifestSha256: sha('b'), cloudflareDeploymentId: `d-${release}`, pagesDevFallbackUrl: 'https://abc.laptop-to-cluster.pages.dev',
  });

  it('keeps the earlier release as previous when a new one is recorded', () => {
    const root = sandbox();
    const index = join(root, 'recovery-index.json');
    write(index, { schemaVersion: 1, current: record('v0.1.0', sha('1')), previous: null });
    write(join(root, 'deployment-record.json'), record('v0.2.0', sha('2')));
    const result = node('update-recovery-index.mjs', [index, join(root, 'deployment-record.json')]);
    expect(result.status, result.stderr).toBe(0);
    const next = JSON.parse(readFileSync(index, 'utf8'));
    expect([next.current.release, next.previous.release]).toEqual(['v0.2.0', 'v0.1.0']);
  });

  it('is refused on a preview run and never writes', () => {
    const root = sandbox();
    const index = join(root, 'recovery-index.json');
    write(join(root, 'deployment-record.json'), record('v0.2.0', sha('2')));
    const result = node('update-recovery-index.mjs', [index, join(root, 'deployment-record.json')], { PREVIEW: '1' });
    expect(result.status).toBe(2);
    expect(existsSync(index)).toBe(false);
  });

  it('rejects a deployment record without a valid release', () => {
    const root = sandbox();
    write(join(root, 'deployment-record.json'), record('latest', sha('2')));
    expect(node('update-recovery-index.mjs', [join(root, 'recovery-index.json'), join(root, 'deployment-record.json')]).status).not.toBe(0);
  });
});

describe('rollback.mjs', () => {
  function retained(release: string) {
    const root = sandbox();
    const dist = join(root, 'dist');
    mkdirSync(join(dist, 'guide'), { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<h1>Home</h1>\n');
    writeFileSync(join(dist, 'guide/index.html'), '<h1>Guide</h1>\n');
    const manifest = createArtifactManifest(dist);
    write(join(root, 'artifact-manifest.json'), manifest);
    write(join(root, 'deployment-record.json'), {
      schemaVersion: 1, release, sourceCommit: 'c'.repeat(40), cloudflareDeploymentId: 'deployment-1',
      artifactSha256: manifest.artifactSha256, artifactFileManifestSha256: manifest.artifactFileManifestSha256,
      canonicalOrigin: 'https://laptop-to-cluster.org', pagesDevFallbackUrl: 'https://abc.laptop-to-cluster.pages.dev', builtOnce: true, deployedVia: 'cloudflare-pages-direct-upload',
    });
    return { dist, manifest: join(root, 'artifact-manifest.json'), deployment: join(root, 'deployment-record.json') };
  }

  it('verifies a retained artifact without a requested release', () => {
    const { dist, manifest, deployment } = retained('v0.1.0');
    const result = node('rollback.mjs', [dist, manifest, deployment]);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).release).toBe('v0.1.0');
  });

  it('accepts the requested release', () => {
    const { dist, manifest, deployment } = retained('v0.1.0');
    expect(node('rollback.mjs', [dist, manifest, deployment, 'v0.1.0']).status).toBe(0);
  });

  it('refuses an artifact that belongs to a different release than the one requested', () => {
    const { dist, manifest, deployment } = retained('v0.2.0');
    const result = node('rollback.mjs', [dist, manifest, deployment, 'v0.1.0']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('records v0.2.0, not the requested v0.1.0');
  });
});
