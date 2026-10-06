import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { verifyArtifactManifest } from '../../scripts/publication.mjs';

/* Needs a built site (`npm run build`), like every test in this folder. It copies the real
   site/dist and the real v0.2.0 candidate into a temporary root, so no tracked or ignored path in the repo is written. */
const repo = fileURLToPath(new URL('../..', import.meta.url));
const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
beforeAll(() => { if (!existsSync(join(repo, 'site/dist/index.html'))) throw new Error('site/dist is missing: run `npm run build` first'); });

const run = (script: string, root: string, env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [join(repo, 'scripts', script), root], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', GITHUB_SHA: 'f'.repeat(40), RELEASE_SHA: 'a'.repeat(40), ...env } });

function release() {
  const root = mkdtempSync(join(tmpdir(), 'l2c-release-records-'));
  temporary.push(root);
  cpSync(join(repo, 'site/dist'), join(root, 'site/dist'), { recursive: true });
  mkdirSync(join(root, 'releases/v0.2.0'), { recursive: true });
  cpSync(join(repo, 'releases/v0.2.0/release-candidate.json'), join(root, 'releases/v0.2.0/release-candidate.json'));
  return root;
}
const deploy = { CLOUDFLARE_DEPLOYMENT_ID: 'deployment-1', PAGES_DEV_FALLBACK_URL: 'https://abc123.laptop-to-cluster.pages.dev', RELEASE_DATE: '2026-10-15' };

describe('release records for the real build', () => {
  it('binds the v0.2.0 candidate to the built artifact without RELEASE_VERSION being set', () => {
    const root = release();
    const prepared = run('prepare-publication.mjs', root);
    expect(prepared.status, prepared.stderr).toBe(0);
    const directory = join(root, 'publication/v0.2.0');
    const candidate = JSON.parse(readFileSync(join(root, 'releases/v0.2.0/release-candidate.json'), 'utf8'));
    const binding = JSON.parse(readFileSync(join(directory, 'release-binding.json'), 'utf8'));
    expect(binding).toMatchObject({ version: 'v0.2.0', repositoryTag: 'v0.2.0', sourceCommit: 'a'.repeat(40), evidenceIds: candidate.evidenceIds, changes: candidate.changes });
    const manifest = JSON.parse(readFileSync(join(directory, 'artifact-manifest.json'), 'utf8'));
    expect(verifyArtifactManifest(join(root, 'site/dist'), manifest)).toEqual([]);
  });

  it('records the planned commit, not GITHUB_SHA, when a dispatch builds a tag behind the tip of main', () => {
    const root = release();
    const prepared = run('prepare-publication.mjs', root, { GITHUB_SHA: 'c'.repeat(40), RELEASE_SHA: 'b'.repeat(40) });
    expect(prepared.status, prepared.stderr).toBe(0);
    const binding = JSON.parse(readFileSync(join(root, 'publication/v0.2.0/release-binding.json'), 'utf8'));
    expect(binding.sourceCommit).toBe('b'.repeat(40));
  });

  it('generates a release record that agrees with that binding', () => {
    const root = release();
    expect(run('prepare-publication.mjs', root).status).toBe(0);
    const generated = run('generate-release-record.mjs', root, deploy);
    expect(generated.status, generated.stderr).toBe(0);
    const record = JSON.parse(readFileSync(join(root, 'publication/v0.2.0/release-manifest.json'), 'utf8'));
    expect(record).toMatchObject({ version: 'v0.2.0', repositoryTag: 'v0.2.0', publishedAt: '2026-10-15' });
    expect(record.deployment.release).toBe('v0.2.0');
  });

  it('produces no record on a preview run', () => {
    const root = release();
    expect(run('prepare-publication.mjs', root, { PREVIEW: '1' }).status).toBe(0);
    const generated = run('generate-release-record.mjs', root, { ...deploy, PREVIEW: '1' });
    expect(generated.status).toBe(0);
    expect(existsSync(join(root, 'publication/v0.2.0/release-manifest.json'))).toBe(false);
  });

  it('refuses to prepare when the candidate disagrees with the requested version, and writes nothing', () => {
    const root = release();
    const path = join(root, 'releases/v0.2.0/release-candidate.json');
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), repositoryTag: 'v0.2.1' }));
    const prepared = run('prepare-publication.mjs', root);
    expect(prepared.status).not.toBe(0);
    expect(prepared.stderr).toContain('repositoryTag');
    expect(existsSync(join(root, 'publication'))).toBe(false);
  });
});
