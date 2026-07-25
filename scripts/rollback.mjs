import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateDeploymentRecord, verifyArtifactManifest } from './publication.mjs';

const [artifactDirectory, artifactManifestPath, deploymentRecordPath] = process.argv.slice(2);
if (!artifactDirectory || !artifactManifestPath || !deploymentRecordPath) {
  console.error('Usage: rollback.mjs <retained-dist> <artifact-manifest.json> <deployment-record.json>');
  process.exit(2);
}
const artifact = JSON.parse(readFileSync(resolve(artifactManifestPath), 'utf8'));
const deployment = JSON.parse(readFileSync(resolve(deploymentRecordPath), 'utf8'));
const errors = [
  ...verifyArtifactManifest(resolve(artifactDirectory), artifact),
  ...validateDeploymentRecord(deployment, artifact),
];
if (errors.length) {
  console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
  process.exit(1);
}
console.log(JSON.stringify({
  release: deployment.release,
  artifactSha256: deployment.artifactSha256,
  cloudflareDeploymentId: deployment.cloudflareDeploymentId,
  recoveryUrl: deployment.pagesDevFallbackUrl,
  action: 'checksum-verified-direct-upload-without-rebuild',
}, null, 2));
