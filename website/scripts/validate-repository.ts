import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEvidenceRepository } from './evidence.js';
import { REPO_ROOT } from './repo-root.mjs';

export function assertRegularFile(root: string, path: string): string | undefined {
  try {
    return statSync(join(root, path)).isFile() ? undefined : `${path}: must be a file`;
  } catch {
    return `${path}: required file is missing`;
  }
}

export const REQUIRED_SCRIPTS = [
  'build', 'check', 'test:unit', 'test:integration:built', 'test:accessibility:browser', 'record-run',
  'validate:evidence', 'validate:repository', 'validate:release', 'validate:built', 'validate:policy', 'validate:boundary',
  'publication:prepare', 'publication:validate',
];

export function validateRepositoryFoundation(root: string): string[] {
  const errors = validateEvidenceRepository(root);
  const requiredFiles = [
    'LICENSE', '.github/CONTRIBUTING.md', '.github/CODE_OF_CONDUCT.md', '.github/SECURITY.md',
    'website/MAINTENANCE.md', '.github/SUPPORT.md', 'website/RECOVERY.md', '.github/workflows/ci.yml',
    '.github/ISSUE_TEMPLATE/defect.yml', '.github/ISSUE_TEMPLATE/accessibility.yml',
    '.github/ISSUE_TEMPLATE/portability.yml', 'website/astro.config.mjs',
    '.github/workflows/publication.yml', '.github/workflows/release.yml', '.github/workflows/rollback.yml',
    'website/infrastructure/cloudflare/hostname-redirects.v1.json',
  ];
  for (const file of requiredFiles) {
    const error = assertRegularFile(root, file);
    if (error) errors.push(error);
  }
  for (const directory of ['website', 'workflows', 'evidence', '.github/workflows']) {
    try {
      if (!statSync(join(root, directory)).isDirectory()) errors.push(`${directory}: must be a directory`);
    } catch {
      errors.push(`${directory}: required directory is missing`);
    }
  }

  const manifest = JSON.parse(readFileSync(join(root, 'website/package.json'), 'utf8')) as { scripts?: Record<string, string> };
  for (const script of REQUIRED_SCRIPTS) {
    if (!manifest.scripts?.[script]) errors.push(`website/package.json: required script ${script} is missing`);
  }
  const astroConfig = readFileSync(join(root, 'website/astro.config.mjs'), 'utf8');
  if (!astroConfig.includes("site: 'https://laptop-to-cluster.org'")) errors.push('website/astro.config.mjs: canonical site must be literal apex URL');
  if (!astroConfig.includes("output: 'static'")) errors.push('website/astro.config.mjs: output must be static');
  if (/adapter|server\s*:|session|auth/i.test(astroConfig)) errors.push('website/astro.config.mjs: server, auth, session, or adapter configuration is forbidden');
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = REPO_ROOT;
  const errors = validateRepositoryFoundation(root);
  if (errors.length) {
    console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Repository foundation and evidence are valid.');
  }
}
