import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRegularFile, validateRepositoryDeclarations } from './license-provenance.js';
import { validateEvidenceRepository } from './evidence.js';

export function validateRepositoryFoundation(root: string): string[] {
  const errors = [...validateRepositoryDeclarations(root), ...validateEvidenceRepository(root)];
  const requiredFiles = [
    'LICENSE', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md',
    'MAINTENANCE.md', 'SUPPORT.md', 'RECOVERY.md', '.github/workflows/ci.yml',
    '.github/ISSUE_TEMPLATE/defect.yml', '.github/ISSUE_TEMPLATE/accessibility.yml',
    '.github/ISSUE_TEMPLATE/portability.yml', 'site/astro.config.mjs',
    '.github/workflows/publication.yml', '.github/workflows/rollback.yml',
    'infrastructure/cloudflare/hostname-redirects.v1.json',
    'releases/v0.1.0/release-candidate.json', 'releases/v0.1.0/accessibility-review.yml',
  ];
  for (const file of requiredFiles) {
    const error = assertRegularFile(root, file);
    if (error) errors.push(error);
  }
  for (const directory of ['site', 'workflows', 'evidence', 'licenses', '.github/workflows']) {
    try {
      if (!statSync(join(root, directory)).isDirectory()) errors.push(`${directory}: must be a directory`);
    } catch {
      errors.push(`${directory}: required directory is missing`);
    }
  }

  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
  for (const script of ['build', 'test:unit', 'test:property', 'test:integration', 'test:accessibility', 'test:accessibility:browser', 'record-run', 'validate:evidence', 'validate:repository', 'validate:release', 'validate:built', 'validate:policy', 'validate:accessibility-review', 'publication:prepare', 'publication:validate']) {
    if (!manifest.scripts?.[script]) errors.push(`package.json: required script ${script} is missing`);
  }
  const astroConfig = readFileSync(join(root, 'site/astro.config.mjs'), 'utf8');
  if (!astroConfig.includes("site: 'https://laptop-to-cluster.org'")) errors.push('site/astro.config.mjs: canonical site must be literal apex URL');
  if (!astroConfig.includes("output: 'static'")) errors.push('site/astro.config.mjs: output must be static');
  if (/adapter|server\s*:|session|auth/i.test(astroConfig)) errors.push('site/astro.config.mjs: server, auth, session, or adapter configuration is forbidden');
  return errors;
}

const root = fileURLToPath(new URL('..', import.meta.url));
const errors = validateRepositoryFoundation(root);
if (errors.length) {
  console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Repository foundation, license coverage, and third-party provenance are valid.');
}
