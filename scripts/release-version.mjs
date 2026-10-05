import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveReleaseVersion } from './publication.mjs';

/* Script-side release version entry point. The rule itself lives in publication.mjs (A12/R9) and is kept
   identical to site/src/content/release.ts by tests/unit/release-version.test.ts.
   Rule: RELEASE_VERSION env, else the newest releases/<v>/release-candidate.json. Never defaults to v0.1.0. */
export { resolveReleaseVersion };
export const RELEASE_VERSION_PATTERN = /^v\d+\.\d+\.\d+$/;

export function assertReleaseVersion(version) {
  if (typeof version !== 'string' || !RELEASE_VERSION_PATTERN.test(version)) {
    throw new Error(`release version must look like v1.2.3 (received ${JSON.stringify(version)})`);
  }
  return version;
}

/* Reads releases/<version>/release-candidate.json and refuses a record that cannot bind a publication.
   Throws one Error whose message lists every problem, one per line. */
export function readReleaseCandidate(root, version) {
  assertReleaseVersion(version);
  const path = join(root, 'releases', version, 'release-candidate.json');
  if (!existsSync(path)) throw new Error(`releases/${version}/release-candidate.json is missing`);
  const candidate = JSON.parse(readFileSync(path, 'utf8'));
  const problems = [];
  if (candidate.version !== version) problems.push(`version ${JSON.stringify(candidate.version)} must equal ${version}`);
  if (candidate.repositoryTag !== version) problems.push(`repositoryTag ${JSON.stringify(candidate.repositoryTag)} must equal ${version}`);
  if (candidate.canonicalOrigin !== 'https://laptop-to-cluster.org') problems.push('canonicalOrigin must be the apex origin');
  if (!Array.isArray(candidate.evidenceIds) || candidate.evidenceIds.length === 0) problems.push('evidenceIds must list at least one identifier');
  if (!Array.isArray(candidate.changes) || candidate.changes.length === 0) problems.push('changes must list at least one classified change');
  if (problems.length) throw new Error(`releases/${version}/release-candidate.json: ${problems.join('; ')}`);
  return candidate;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(assertReleaseVersion(resolveReleaseVersion(resolve(process.argv[2] ?? '.'))));
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}
