import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isStrict, validateRepositoryFoundation } from './validate-repository.js';
import {
  diagnostic, resolveReleaseVersion, validateBuiltOutput, validateCanonicalConfig, validateDeploymentWorkflow,
  validateFrozenPublicationWorkflow, validateHostnamePolicy, validateReleaseWorkflow,
} from './publication.mjs';

/** The release workflow and the frozen publication workflow. Errors when strict (CI), warnings before W8's workflows exist. */
export function releaseWorkflowIssues(root: string, strict: boolean): { errors: string[]; warnings: string[] } {
  const releasePath = join(root, '.github/workflows/release.yml');
  const issues = [
    ...(existsSync(releasePath)
      ? validateReleaseWorkflow(readFileSync(releasePath, 'utf8'))
      : [diagnostic('.github/workflows/release.yml', 'file', 'RELEASE-WORKFLOW', 'the release workflow is missing')]),
    ...validateFrozenPublicationWorkflow(readFileSync(join(root, '.github/workflows/publication.yml'), 'utf8')),
  ];
  return strict ? { errors: issues, warnings: [] } : { errors: [], warnings: issues };
}

export function validateReleaseCandidate(
  root: string,
  strict: boolean = isStrict(),
  warn: (message: string) => void = (message) => console.warn(`WARNING: ${message}`),
): string[] {
  const version = resolveReleaseVersion(root);
  const errors = validateRepositoryFoundation(root, version, strict, warn);
  const candidatePath = join(root, 'releases', version, 'release-candidate.json');
  if (existsSync(candidatePath) && JSON.parse(readFileSync(candidatePath, 'utf8')).version !== version) {
    errors.push(`releases/${version}/release-candidate.json: version must equal the resolved release version ${version}`);
  }
  const dist = join(root, 'site/dist');
  const index = join(dist, 'index.html');
  if (!existsSync(index)) return [...errors, 'site/dist/index.html: static build output is missing'];
  errors.push(
    ...validateBuiltOutput(dist),
    ...validateCanonicalConfig(readFileSync(join(root, 'site/astro.config.mjs'), 'utf8')),
    ...validateDeploymentWorkflow(readFileSync(join(root, '.github/workflows/publication.yml'), 'utf8')),
    ...validateHostnamePolicy(JSON.parse(readFileSync(join(root, 'infrastructure/cloudflare/hostname-redirects.v1.json'), 'utf8'))),
  );
  const workflows = releaseWorkflowIssues(root, strict);
  errors.push(...workflows.errors);
  workflows.warnings.forEach(warn);
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const errors = validateReleaseCandidate(root);
  if (errors.length) {
    console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Static release candidate and repository policy checks are valid.');
  }
}
