import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createArtifactManifest, sha256, validateBuiltOutput, verifyArtifactManifest } from './publication.mjs';

const root = resolve(process.argv[2] ?? '.');
const version = process.env.RELEASE_VERSION ?? 'v0.1.0';
const dist = join(root, 'site/dist');
const output = join(root, 'publication', version);
const errors = validateBuiltOutput(dist);
if (errors.length) {
  console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
  process.exit(1);
}
mkdirSync(output, { recursive: true });
const artifact = createArtifactManifest(dist);
const artifactPath = join(output, 'artifact-manifest.json');
writeFileSync(artifactPath, JSON.stringify(artifact, null, 2) + '\n');
const verification = verifyArtifactManifest(dist, artifact);
if (verification.length) throw new Error(verification.join('\n'));
const sourceCommit = process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const candidate = JSON.parse(readFileSync(join(root, 'releases', version, 'release-candidate.json'), 'utf8'));
const binding = {
  schemaVersion: 1,
  version,
  sourceCommit,
  repositoryTag: candidate.repositoryTag,
  canonicalOrigin: 'https://laptop-to-cluster.org',
  urlManifestSha256: sha256(readFileSync(join(dist, 'url-manifest.json'))),
  artifactSha256: artifact.artifactSha256,
  artifactFileManifestSha256: artifact.artifactFileManifestSha256,
  evidenceIds: candidate.evidenceIds,
  changes: candidate.changes,
  externalInputsRequired: ['cloudflareDeploymentId', 'pagesDevFallbackUrl'],
};
writeFileSync(join(output, 'release-binding.json'), JSON.stringify(binding, null, 2) + '\n');
console.log(`Prepared immutable ${version} publication artifact from one build at ${sourceCommit}.`);
