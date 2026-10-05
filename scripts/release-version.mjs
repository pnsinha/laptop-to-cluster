import { resolve } from 'node:path';
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(assertReleaseVersion(resolveReleaseVersion(resolve(process.argv[2] ?? '.'))));
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}
