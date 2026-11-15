import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRepositoryFoundation } from './validate-repository.js';
import { validateBuiltOutput, validateCanonicalConfig, validateDeploymentWorkflow, validateHostnamePolicy } from './publication.mjs';
import { REPO_ROOT } from './repo-root.mjs';

export function validateRelease(root: string): string[] {
  const errors = validateRepositoryFoundation(root);
  const dist = join(root, 'website/dist');
  const index = join(dist, 'index.html');
  if (!existsSync(index)) return [...errors, 'website/dist/index.html: static build output is missing'];
  errors.push(
    ...validateBuiltOutput(dist),
    ...validateCanonicalConfig(readFileSync(join(root, 'website/astro.config.mjs'), 'utf8')),
    ...validateDeploymentWorkflow(readFileSync(join(root, '.github/workflows/publication.yml'), 'utf8')),
    ...validateHostnamePolicy(JSON.parse(readFileSync(join(root, 'website/infrastructure/cloudflare/hostname-redirects.v1.json'), 'utf8'))),
  );
  const htmlFiles = readdirSync(dist, { recursive: true })
    .filter((path) => String(path).endsWith('.html'))
    .map((path) => join(dist, String(path)));
  if (htmlFiles.length === 0) errors.push('website/dist: release output contains no HTML');
  for (const file of htmlFiles) {
    const html = readFileSync(file, 'utf8');
    if (!html.includes('https://laptop-to-cluster.org')) errors.push(`${file}: canonical apex URL is missing`);
    if (/https:\/\/(www\.laptop-to-cluster\.org|laptoptocluster\.org|laptop-to-cluster\.pnsinha\.com|[^/]+\.pages\.dev)/.test(html)) {
      errors.push(`${file}: noncanonical origin leaked into static output`);
    }
    if (/<form[^>]+(?:login|password)|Set-Cookie|\/api\/auth/i.test(html)) errors.push(`${file}: authentication or runtime state is forbidden`);
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = REPO_ROOT;
  const errors = validateRelease(root);
  if (errors.length) {
    console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Static release output and repository policy checks are valid.');
  }
}
