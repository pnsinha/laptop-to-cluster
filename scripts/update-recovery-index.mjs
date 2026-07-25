import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [indexPath, deploymentPath] = process.argv.slice(2).map((path) => resolve(path));
if (!indexPath || !deploymentPath) {
  console.error('Usage: update-recovery-index.mjs <recovery-index.json> <deployment-record.json>');
  process.exit(2);
}
const deployment = JSON.parse(readFileSync(deploymentPath, 'utf8'));
const old = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : { schemaVersion: 1, current: null, previous: null };
const entry = {
  release: deployment.release,
  sourceCommit: deployment.sourceCommit,
  artifactSha256: deployment.artifactSha256,
  artifactFileManifestSha256: deployment.artifactFileManifestSha256,
  cloudflareDeploymentId: deployment.cloudflareDeploymentId,
  pagesDevFallbackUrl: deployment.pagesDevFallbackUrl,
};
const next = { schemaVersion: 1, current: entry, previous: old.current?.artifactSha256 === entry.artifactSha256 ? old.previous : old.current };
writeFileSync(indexPath, JSON.stringify(next, null, 2) + '\n');
console.log(`Recovery index now retains current ${entry.release}${next.previous ? ` and previous ${next.previous.release}` : '; no earlier release exists'}.`);
