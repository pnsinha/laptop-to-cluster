import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveReleaseVersion } from './publication.mjs';

/* Script-side entry point for the release version. The rule lives in publication.mjs, so the site build
   (plugins/release-refs.mjs) and the scripts cannot disagree: RELEASE_VERSION, else v<version> from package.json. */
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
