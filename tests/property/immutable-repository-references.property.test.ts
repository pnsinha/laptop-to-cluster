import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { resolveRepoRef } from '../../site/src/content/registry.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const hex = [...'0123456789abcdef'];
const safeSegment = fc.array(fc.constantFrom(...[...'abcdefghijklmnopqrstuvwxyz0123456789-_']), {
  minLength: 1,
  maxLength: 20,
}).map((characters) => characters.join(''));
const commit = fc.array(fc.constantFrom(...hex), { minLength: 40, maxLength: 40 })
  .map((characters) => characters.join(''));
const semverTag = fc.tuple(fc.boolean(), fc.nat(99), fc.nat(99), fc.nat(99))
  .map(([prefixed, major, minor, patch]) => `${prefixed ? 'v' : ''}${major}.${minor}.${patch}`);
const taggedRelease = fc.array(safeSegment, { minLength: 1, maxLength: 3 })
  .map((segments) => `refs/tags/${segments.join('/')}`);
const immutableRelease = fc.oneof(commit, semverTag, taggedRelease);
const mutableRelease = fc.oneof(
  fc.constantFrom('main', 'master', 'develop', 'development'),
  safeSegment.map((branch) => `refs/heads/${branch}`),
);
const repository = fc.tuple(safeSegment, safeSegment, fc.boolean())
  .map(([owner, project, trailingSlash]) => `https://github.com/${owner}/${project}${trailingSlash ? '/' : ''}`);
const path = fc.constantFrom('README.md', 'package.json', 'site/src/content/registry.ts');
const integrity = fc.array(fc.constantFrom(...hex), { minLength: 64, maxLength: 64 })
  .map((characters) => `sha256:${characters.join('')}`);
const lineAnchor = fc.option(
  fc.tuple(fc.integer({ min: 1, max: 300 }), fc.integer({ min: 0, max: 20 }))
    .map(([start, span]) => span === 0 ? `#L${start}` : `#L${start}-L${start + span}`),
  { nil: undefined },
);
const releasedContext = fc.constantFrom('learning-module' as const, 'release' as const);

describe('Property 3: Released repository references are immutable', () => {
  it('accepts only public immutable revisions while preserving repository paths', () => {
    // **Validates: Requirements 3.3, 7.5**
    fc.assert(fc.property(
      repository, immutableRelease, mutableRelease, path, integrity, lineAnchor, releasedContext,
      (repositoryUrl, release, branch, repositoryPath, digest, anchor, artifactType) => {
        const reference = { repository: repositoryUrl, release, path: repositoryPath, integrity: digest, line_anchor: anchor };
        const resolved = resolveRepoRef(reference, root, { artifact_type: artifactType });
        const revision = release.startsWith('refs/tags/') ? release.slice('refs/tags/'.length) : release;

        expect(resolved.path).toBe(repositoryPath);
        expect(resolved.release).toBe(release);
        expect(resolved.href).toBe(`${repositoryUrl.replace(/\/$/, '')}/blob/${encodeURIComponent(revision)}/${repositoryPath}${anchor ?? ''}`);
        expect(new URL(resolved.href).protocol).toBe('https:');
        expect(() => resolveRepoRef({ ...reference, release: branch }, root, { artifact_type: artifactType }))
          .toThrow(/release tag or full 40-character commit/);
        expect(() => resolveRepoRef({ ...reference, repository: 'https://localhost/example/project' }, root, { artifact_type: artifactType }))
          .toThrow(/public hostname/);
      },
    ), { numRuns: 200 });
  });
});
