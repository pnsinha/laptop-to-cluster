import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateDeploymentRecord, validateReleaseManifest } from './publication.mjs';

const root = resolve(process.argv[2] ?? '.');
const version = process.env.RELEASE_VERSION ?? 'v0.1.0';
const directory = join(root, 'publication', version);
const artifact = JSON.parse(readFileSync(join(directory, 'artifact-manifest.json'), 'utf8'));
const binding = JSON.parse(readFileSync(join(directory, 'release-binding.json'), 'utf8'));
const deployment = {
  schemaVersion: 1,
  release: version,
  sourceCommit: binding.sourceCommit,
  cloudflareDeploymentId: process.env.CLOUDFLARE_DEPLOYMENT_ID ?? '',
  artifactSha256: binding.artifactSha256,
  artifactFileManifestSha256: binding.artifactFileManifestSha256,
  canonicalOrigin: binding.canonicalOrigin,
  pagesDevFallbackUrl: process.env.PAGES_DEV_FALLBACK_URL ?? '',
  builtOnce: true,
  deployedVia: 'cloudflare-pages-direct-upload',
};
const release = {
  schemaVersion: 1,
  version,
  publishedAt: process.env.RELEASE_DATE ?? new Date().toISOString().slice(0, 10),
  repositoryTag: binding.repositoryTag,
  urlManifestSha256: binding.urlManifestSha256,
  evidenceIds: binding.evidenceIds,
  changes: binding.changes,
  deployment,
};
const errors = [...validateDeploymentRecord(deployment, artifact), ...validateReleaseManifest(release, artifact)];
if (errors.length) {
  console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
  process.exit(1);
}
mkdirSync(directory, { recursive: true });
writeFileSync(join(directory, 'deployment-record.json'), JSON.stringify(deployment, null, 2) + '\n');
writeFileSync(join(directory, 'release-manifest.json'), JSON.stringify(release, null, 2) + '\n');
console.log(`Generated checksum-bound deployment and release records for ${version}.`);
