import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRepositoryFoundation } from './validate-repository.js';
import { validateBuiltOutput, validateCanonicalConfig, validateDeploymentWorkflow, validateHostnamePolicy } from './publication.mjs';

export function validateReleaseCandidate(root: string): string[] {
  const errors = validateRepositoryFoundation(root);
  const dist = join(root, 'site/dist');
  const index = join(dist, 'index.html');
  if (!existsSync(index)) return [...errors, 'site/dist/index.html: static build output is missing'];
  errors.push(
    ...validateBuiltOutput(dist),
    ...validateCanonicalConfig(readFileSync(join(root, 'site/astro.config.mjs'), 'utf8')),
    ...validateDeploymentWorkflow(readFileSync(join(root, '.github/workflows/publication.yml'), 'utf8')),
    ...validateHostnamePolicy(JSON.parse(readFileSync(join(root, 'infrastructure/cloudflare/hostname-redirects.v1.json'), 'utf8'))),
  );
  const htmlFiles = readdirSync(dist, { recursive: true })
    .filter((path) => String(path).endsWith('.html'))
    .map((path) => join(dist, String(path)));
  if (htmlFiles.length === 0) errors.push('site/dist: release candidate contains no HTML');
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

const root = fileURLToPath(new URL('..', import.meta.url));
const errors = validateReleaseCandidate(root);
if (errors.length) {
  console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Static release candidate and repository policy checks are valid.');
}
