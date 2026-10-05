import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentReleaseVersion } from '../../site/src/content/release';
import { resolveReleaseVersion as publicationResolve } from '../../scripts/publication.mjs';
import { assertReleaseVersion, resolveReleaseVersion } from '../../scripts/release-version.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const temporary: string[] = [];
let saved: string | undefined;
beforeEach(() => { saved = process.env.RELEASE_VERSION; delete process.env.RELEASE_VERSION; });
afterEach(() => {
  if (saved === undefined) delete process.env.RELEASE_VERSION; else process.env.RELEASE_VERSION = saved;
  temporary.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }));
});

function tree(candidates: Record<string, unknown>) {
  const root = mkdtempSync(join(tmpdir(), 'l2c-release-version-'));
  temporary.push(root);
  for (const [dir, body] of Object.entries(candidates)) {
    mkdirSync(join(root, 'releases', dir), { recursive: true });
    if (body !== null) writeFileSync(join(root, 'releases', dir, 'release-candidate.json'), JSON.stringify(body));
  }
  return root;
}

describe('release version rule (release.ts, publication.mjs and release-version.mjs agree)', () => {
  const fixtures: Array<[string, Record<string, unknown>, string]> = [
    ['picks the newest candidate', { 'v0.1.0': { version: 'v0.1.0' }, 'v0.2.0': { version: 'v0.2.0' } }, 'v0.2.0'],
    ['compares numerically, not as text', { 'v0.9.0': { version: 'v0.9.0' }, 'v0.10.0': { version: 'v0.10.0' } }, 'v0.10.0'],
    ['ignores a release directory without a candidate record', { 'v0.1.0': { version: 'v0.1.0' }, 'v0.3.0': null }, 'v0.1.0'],
    ['uses the version field inside the record', { 'v0.2.0': { version: 'v0.2.0' } }, 'v0.2.0'],
    ['accepts a release-candidate directory', { 'v0.1.0': { version: 'v0.1.0' }, 'v0.2.0-rc.1': { version: 'v0.2.0-rc.1' } }, 'v0.2.0-rc.1'],
  ];
  for (const [name, candidates, expected] of fixtures) {
    it(`${name}`, () => {
      const root = tree(candidates);
      expect(currentReleaseVersion(root)).toBe(expected);
      expect(publicationResolve(root)).toBe(expected);
      expect(resolveReleaseVersion(root)).toBe(expected);
    });
  }

  it('lets RELEASE_VERSION win and trims it', () => {
    const root = tree({ 'v0.1.0': { version: 'v0.1.0' } });
    process.env.RELEASE_VERSION = ' v9.9.9 ';
    expect(currentReleaseVersion(root)).toBe('v9.9.9');
    expect(publicationResolve(root)).toBe('v9.9.9');
    expect(resolveReleaseVersion(root)).toBe('v9.9.9');
  });

  it('fails loudly instead of defaulting to v0.1.0', () => {
    const root = tree({});
    expect(() => currentReleaseVersion(root)).toThrow(/RELEASE_VERSION/);
    expect(() => publicationResolve(root)).toThrow(/RELEASE_VERSION/);
    expect(() => resolveReleaseVersion(root)).toThrow(/RELEASE_VERSION/);
  });

  it('resolves the real repository to a candidate that exists', () => {
    expect(resolveReleaseVersion(repo)).toBe(currentReleaseVersion(repo));
  });
});

describe('assertReleaseVersion', () => {
  it('accepts exact semantic versions only', () => {
    expect(assertReleaseVersion('v0.2.0')).toBe('v0.2.0');
    for (const bad of ['0.2.0', 'v0.2', 'v0.2.0-rc.1', 'main', '', 'v0.2.0/../x']) expect(() => assertReleaseVersion(bad)).toThrow(/v1\.2\.3/);
  });
});

describe('release-version CLI', () => {
  const run = (args: string[], env: Record<string, string> = {}) =>
    spawnSync(process.execPath, [join(repo, 'scripts/release-version.mjs'), ...args], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', ...env } });

  it('prints the resolved version', () => {
    const root = tree({ 'v0.2.0': { version: 'v0.2.0' } });
    const result = run([root]);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('v0.2.0');
  });

  it('rejects a malformed override with a non-zero exit', () => {
    const root = tree({ 'v0.2.0': { version: 'v0.2.0' } });
    const result = run([root], { RELEASE_VERSION: 'not-a-version' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ERROR:');
  });
});
