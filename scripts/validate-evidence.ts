import { fileURLToPath } from 'node:url';
import { validateEvidenceBundle, validateEvidenceRepository } from './evidence.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const bundleIndex = process.argv.indexOf('--bundle');
if (bundleIndex >= 0) {
  const bundle = process.argv[bundleIndex + 1];
  if (!bundle) throw new Error('--bundle requires a path');
  const report = validateEvidenceBundle(bundle);
  console.log(JSON.stringify(report, null, 2));
  if (!report.valid) process.exitCode = 1;
} else {
  const errors = validateEvidenceRepository(root);
  if (errors.length) {
    console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Evidence, applicability, provenance, staleness, and representative-environment claims are valid.');
  }
}
