import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CANONICAL_ORIGIN = 'https://laptop-to-cluster.org';
export const REDIRECT_HOSTS = Object.freeze([
  'www.laptop-to-cluster.org',
  'laptoptocluster.org',
  'laptop-to-cluster.pnsinha.com',
]);
const FORBIDDEN_ORIGIN = /https:\/\/(?:www\.laptop-to-cluster\.org|laptoptocluster\.org|laptop-to-cluster\.pnsinha\.com|[^/\s"'<>]+\.pages\.dev)/i;
const SHA256 = /^[a-f0-9]{64}$/;

export function diagnostic(source, field, check, message) {
  return `${source}:${field} [${check}] ${message}`;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(absolute) : [absolute];
  }).sort();
}

export function createArtifactManifest(directory) {
  const root = resolve(directory);
  const files = filesUnder(root).map((absolute) => {
    const path = relative(root, absolute).replaceAll('\\', '/');
    const content = readFileSync(absolute);
    return { path, bytes: content.byteLength, sha256: sha256(content) };
  });
  const normalized = files.map(({ path, bytes, sha256: digest }) => `${path}\0${bytes}\0${digest}\n`).join('');
  const fileManifest = JSON.stringify({ schemaVersion: 1, files }, null, 2) + '\n';
  return {
    schemaVersion: 1,
    algorithm: 'sha256',
    files,
    artifactSha256: sha256(normalized),
    artifactFileManifestSha256: sha256(fileManifest),
  };
}
export function verifyArtifactManifest(directory, expected) {
  const errors = [];
  const actual = createArtifactManifest(directory);
  if (expected.schemaVersion !== 1 || expected.algorithm !== 'sha256') {
    errors.push(diagnostic('artifact-manifest.json', 'schemaVersion', 'ARTIFACT-IDENTITY', 'unsupported manifest format'));
  }
  if (expected.artifactSha256 !== actual.artifactSha256) {
    errors.push(diagnostic('site/dist', 'artifactSha256', 'ARTIFACT-IDENTITY', `expected ${expected.artifactSha256}, received ${actual.artifactSha256}`));
  }
  if (expected.artifactFileManifestSha256 !== actual.artifactFileManifestSha256) {
    errors.push(diagnostic('site/dist', 'artifactFileManifestSha256', 'ARTIFACT-IDENTITY', `expected ${expected.artifactFileManifestSha256}, received ${actual.artifactFileManifestSha256}`));
  }
  const expectedFiles = new Map((expected.files ?? []).map((file) => [file.path, file]));
  for (const file of actual.files) {
    const wanted = expectedFiles.get(file.path);
    if (!wanted) errors.push(diagnostic(file.path, 'path', 'ARTIFACT-IDENTITY', 'unexpected upload file'));
    else if (wanted.sha256 !== file.sha256 || wanted.bytes !== file.bytes) {
      errors.push(diagnostic(file.path, 'sha256', 'ARTIFACT-IDENTITY', 'file checksum or size differs'));
    }
    expectedFiles.delete(file.path);
  }
  for (const path of expectedFiles.keys()) errors.push(diagnostic(path, 'path', 'ARTIFACT-IDENTITY', 'retained upload file is missing'));
  return errors;
}

export function validateCanonicalConfig(configText) {
  const errors = [];
  const literals = configText.match(/\bsite\s*:\s*['"][^'"]+['"]/g) ?? [];
  if (literals.length !== 1 || literals[0] !== "site: 'https://laptop-to-cluster.org'") {
    errors.push(diagnostic('site/astro.config.mjs', 'site', 'CANONICAL-CONFIG', `must contain exactly literal site: '${CANONICAL_ORIGIN}'`));
  }
  if (/\bbase\s*:/.test(configText)) errors.push(diagnostic('site/astro.config.mjs', 'base', 'CANONICAL-CONFIG', 'production base paths are forbidden'));
  if (/process\.env|import\.meta\.env|loadEnv/.test(configText)) {
    errors.push(diagnostic('site/astro.config.mjs', 'site', 'CANONICAL-CONFIG', 'environment substitution is forbidden'));
  }
  return errors;
}

function publicPathForFile(dist, file) {
  const path = relative(dist, file).replaceAll('\\', '/');
  if (path === 'index.html') return '/';
  return `/${path.replace(/index\.html$/, '')}`;
}

function internalTargetExists(dist, href) {
  const path = decodeURI(href.split(/[?#]/, 1)[0]);
  if (!path.startsWith('/')) return true;
  if (path === '/') return existsSync(join(dist, 'index.html'));
  const relativePath = path.replace(/^\//, '');
  return existsSync(join(dist, relativePath)) || existsSync(join(dist, relativePath, 'index.html')) || existsSync(join(dist, `${relativePath}.html`));
}
export function validateBuiltOutput(dist) {
  const errors = [];
  const htmlFiles = filesUnder(dist).filter((file) => file.endsWith('.html'));
  if (!htmlFiles.length) return [diagnostic('site/dist', 'html', 'BUILD-OUTPUT', 'no generated HTML files were found')];
  const canonicalUrls = new Set();
  for (const file of htmlFiles) {
    const source = publicPathForFile(dist, file);
    const html = readFileSync(file, 'utf8');
    const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
    const openGraph = html.match(/<meta\s+property="og:url"\s+content="([^"]+)"/i)?.[1];
    const expected = new URL(source, CANONICAL_ORIGIN).href;
    if (canonical !== expected) errors.push(diagnostic(source, 'canonical', 'CANONICAL-OUTPUT', `expected ${expected}, received ${canonical ?? '<missing>'}`));
    if (openGraph !== expected) errors.push(diagnostic(source, 'og:url', 'CANONICAL-OUTPUT', `expected ${expected}, received ${openGraph ?? '<missing>'}`));
    if (canonical) canonicalUrls.add(canonical);
    if (FORBIDDEN_ORIGIN.test(html)) errors.push(diagnostic(source, 'html', 'CANONICAL-OUTPUT', 'redirect or pages.dev hostname leaked into built HTML'));
    const links = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
    for (const href of links) {
      if ((href.startsWith('/') || href.startsWith(CANONICAL_ORIGIN)) && !internalTargetExists(dist, href.replace(CANONICAL_ORIGIN, ''))) {
        errors.push(diagnostic(source, 'href', 'INTERNAL-LINK', `target does not exist: ${href}`));
      }
    }
  }
  for (const name of ['sitemap-index.xml', 'sitemap-0.xml', 'feed.xml', 'url-manifest.json']) {
    const file = join(dist, name);
    if (!existsSync(file)) errors.push(diagnostic(name, 'path', 'DISCOVERY-OUTPUT', 'required file is missing'));
    else {
      const text = readFileSync(file, 'utf8');
      if (FORBIDDEN_ORIGIN.test(text)) errors.push(diagnostic(name, 'origin', 'CANONICAL-OUTPUT', 'noncanonical hostname is forbidden'));
      for (const match of text.matchAll(/https:\/\/[^\s"'<>]+/g)) {
        // The canonical origin itself (no trailing path) is valid; only reject
        // URLs that use a different host or a non-apex path prefix.
        if (match[0] !== CANONICAL_ORIGIN && !match[0].startsWith(`${CANONICAL_ORIGIN}/`)) errors.push(diagnostic(name, 'url', 'CANONICAL-OUTPUT', `non-apex URL ${match[0]}`));
      }
    }
  }
  const sitemap = existsSync(join(dist, 'sitemap-0.xml')) ? readFileSync(join(dist, 'sitemap-0.xml'), 'utf8') : '';
  const sitemapUrls = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]));
  let manifestUrls = new Set();
  try {
    const manifest = JSON.parse(readFileSync(join(dist, 'url-manifest.json'), 'utf8'));
    if (manifest.canonical_origin !== CANONICAL_ORIGIN) errors.push(diagnostic('url-manifest.json', 'canonical_origin', 'CANONICAL-OUTPUT', 'must equal canonical apex'));
    manifestUrls = new Set((manifest.records ?? []).map((record) => record.url));
  } catch (error) {
    errors.push(diagnostic('url-manifest.json', 'json', 'DISCOVERY-OUTPUT', `cannot parse: ${error.message}`));
  }
  for (const url of new Set([...canonicalUrls, ...sitemapUrls, ...manifestUrls])) {
    if (!canonicalUrls.has(url) || !sitemapUrls.has(url) || !manifestUrls.has(url)) errors.push(diagnostic(url, 'url', 'DISCOVERY-AGREEMENT', 'canonical, sitemap, and URL manifest disagree'));
  }
  return errors;
}
export function validateHostnamePolicy(policy) {
  const errors = [];
  if (policy.schemaVersion !== 1) errors.push(diagnostic('hostname-redirects.v1.json', 'schemaVersion', 'REDIRECT-POLICY', 'must be 1'));
  if (policy.canonicalOrigin !== CANONICAL_ORIGIN) errors.push(diagnostic('hostname-redirects.v1.json', 'canonicalOrigin', 'REDIRECT-POLICY', 'must be the apex origin'));
  const rules = policy.rules ?? [];
  if (rules.length !== REDIRECT_HOSTS.length) errors.push(diagnostic('hostname-redirects.v1.json', 'rules', 'REDIRECT-POLICY', 'must contain exactly three rules'));
  const seen = new Set();
  for (const [index, rule] of rules.entries()) {
    const source = `hostname-redirects.v1.json:rules[${index}]`;
    if (!REDIRECT_HOSTS.includes(rule.sourceHostname)) errors.push(diagnostic(source, 'sourceHostname', 'REDIRECT-POLICY', 'hostname is not in the exact closed set'));
    if (seen.has(rule.sourceHostname)) errors.push(diagnostic(source, 'sourceHostname', 'REDIRECT-POLICY', 'duplicate hostname'));
    seen.add(rule.sourceHostname);
    if (rule.targetOrigin !== CANONICAL_ORIGIN) errors.push(diagnostic(source, 'targetOrigin', 'REDIRECT-POLICY', 'multi-hop or non-apex target is forbidden'));
    if (rule.status !== 301) errors.push(diagnostic(source, 'status', 'REDIRECT-POLICY', 'must be permanent HTTP 301'));
    for (const field of ['subpathMatching', 'preservePathSuffix', 'preserveQueryString']) {
      if (rule[field] !== true) errors.push(diagnostic(source, field, 'REDIRECT-POLICY', 'must be true'));
    }
  }
  for (const host of REDIRECT_HOSTS) if (!seen.has(host)) errors.push(diagnostic('hostname-redirects.v1.json', 'rules', 'REDIRECT-POLICY', `missing exact host ${host}`));
  return errors;
}

export function redirectLocation(policy, incoming) {
  const url = new URL(incoming);
  const rule = (policy.rules ?? []).find(({ sourceHostname }) => sourceHostname === url.hostname);
  if (!rule) throw new Error(`No redirect policy for exact hostname ${url.hostname}`);
  return `${rule.targetOrigin}${url.pathname}${url.search}`;
}

export function validateCloudflareReadiness(input) {
  const errors = [];
  for (const field of ['accountId', 'zoneId', 'pagesProjectName', 'customDomainId', 'redirectListId', 'redirectRuleId']) {
    if (typeof input[field] !== 'string' || !input[field].trim() || input[field] === 'EXTERNAL_REQUIRED') errors.push(diagnostic('cloudflare-readiness.json', field, 'CLOUDFLARE-READINESS', 'external identifier is required'));
  }
  if (input.customDomainHostname !== 'laptop-to-cluster.org') errors.push(diagnostic('cloudflare-readiness.json', 'customDomainHostname', 'CLOUDFLARE-READINESS', 'must be canonical apex'));
  if (input.customDomainStatus !== 'active') errors.push(diagnostic('cloudflare-readiness.json', 'customDomainStatus', 'CLOUDFLARE-READINESS', 'custom domain and certificate must be active'));
  if (input.redirectRuleStatus !== 'active') errors.push(diagnostic('cloudflare-readiness.json', 'redirectRuleStatus', 'CLOUDFLARE-READINESS', 'redirect rule must be active'));
  for (const host of REDIRECT_HOSTS) {
    const dns = (input.dns ?? []).find((record) => record.hostname === host);
    if (!dns || dns.proxied !== true || dns.status !== 'active') errors.push(diagnostic('cloudflare-readiness.json', `dns.${host}`, 'CLOUDFLARE-READINESS', 'active proxied DNS is required'));
  }
  return errors;
}
export function validateDeploymentRecord(record, manifest) {
  const errors = [];
  const required = ['release', 'sourceCommit', 'cloudflareDeploymentId', 'artifactSha256', 'artifactFileManifestSha256', 'pagesDevFallbackUrl'];
  for (const field of required) if (typeof record[field] !== 'string' || !record[field]) errors.push(diagnostic('deployment-record.json', field, 'DEPLOYMENT-RECORD', 'is required'));
  if (!/^[a-f0-9]{40}$/i.test(record.sourceCommit ?? '')) errors.push(diagnostic('deployment-record.json', 'sourceCommit', 'DEPLOYMENT-RECORD', 'must be a full commit SHA'));
  if (!SHA256.test(record.artifactSha256 ?? '') || record.artifactSha256 !== manifest.artifactSha256) errors.push(diagnostic('deployment-record.json', 'artifactSha256', 'DEPLOYMENT-RECORD', 'must match validated artifact'));
  if (!SHA256.test(record.artifactFileManifestSha256 ?? '') || record.artifactFileManifestSha256 !== manifest.artifactFileManifestSha256) errors.push(diagnostic('deployment-record.json', 'artifactFileManifestSha256', 'DEPLOYMENT-RECORD', 'must match validated file manifest'));
  if (record.canonicalOrigin !== CANONICAL_ORIGIN) errors.push(diagnostic('deployment-record.json', 'canonicalOrigin', 'DEPLOYMENT-RECORD', 'must equal canonical apex'));
  if (!/^https:\/\/[^/]+\.pages\.dev\/?$/.test(record.pagesDevFallbackUrl ?? '')) errors.push(diagnostic('deployment-record.json', 'pagesDevFallbackUrl', 'DEPLOYMENT-RECORD', 'must be an HTTPS pages.dev deployment URL'));
  if (record.builtOnce !== true) errors.push(diagnostic('deployment-record.json', 'builtOnce', 'DEPLOYMENT-RECORD', 'must be true'));
  if (record.deployedVia !== 'cloudflare-pages-direct-upload') errors.push(diagnostic('deployment-record.json', 'deployedVia', 'DEPLOYMENT-RECORD', 'must identify Direct Upload'));
  return errors;
}

export function validateReleaseManifest(record, artifactManifest) {
  const errors = validateDeploymentRecord(record.deployment, artifactManifest);
  for (const field of ['version', 'publishedAt', 'repositoryTag', 'urlManifestSha256']) {
    if (typeof record[field] !== 'string' || !record[field]) errors.push(diagnostic('release-manifest.json', field, 'RELEASE-RECORD', 'is required'));
  }
  if (record.version !== record.deployment.release || record.repositoryTag !== record.version) errors.push(diagnostic('release-manifest.json', 'version', 'RELEASE-RECORD', 'release and immutable repository tag must agree'));
  if (!SHA256.test(record.urlManifestSha256 ?? '')) errors.push(diagnostic('release-manifest.json', 'urlManifestSha256', 'RELEASE-RECORD', 'must be SHA-256'));
  if (!Array.isArray(record.evidenceIds) || record.evidenceIds.length === 0) errors.push(diagnostic('release-manifest.json', 'evidenceIds', 'RELEASE-RECORD', 'at least one evidence identifier is required'));
  if (!Array.isArray(record.changes) || record.changes.length === 0) errors.push(diagnostic('release-manifest.json', 'changes', 'RELEASE-RECORD', 'classified changes are required'));
  return errors;
}

export function validateDeploymentWorkflow(workflowText) {
  const errors = [];
  const deploy = workflowText.match(/\n  deploy:[\s\S]*?(?=\n  [a-zA-Z][\w-]*:|$)/)?.[0] ?? '';
  if (!deploy) return [diagnostic('.github/workflows/publication.yml', 'jobs.deploy', 'BUILD-ONCE', 'deployment job is missing')];
  for (const pattern of [/npm\s+(?:ci|install)/i, /astro\s+(?:build|sync|check)/i, /npm\s+run\s+build/i, />\s*site\/dist|cp\s+.*site\/dist|mv\s+.*site\/dist/i]) {
    if (pattern.test(deploy)) errors.push(diagnostic('.github/workflows/publication.yml', 'jobs.deploy', 'BUILD-ONCE', `forbidden deployment operation: ${pattern}`));
  }
  if (!/actions\/download-artifact@/.test(deploy)) errors.push(diagnostic('.github/workflows/publication.yml', 'jobs.deploy', 'BUILD-ONCE', 'must download the retained artifact'));
  if (!/cloudflare\/wrangler-action@/.test(deploy) || !/pages deploy site\/dist/.test(deploy)) errors.push(diagnostic('.github/workflows/publication.yml', 'jobs.deploy', 'DIRECT-UPLOAD', 'must invoke wrangler Pages Direct Upload'));
  if (!/publication\.mjs verify/.test(deploy)) errors.push(diagnostic('.github/workflows/publication.yml', 'jobs.deploy', 'ARTIFACT-IDENTITY', 'must verify checksums immediately before upload'));
  return errors;
}
function printErrors(errors) {
  if (errors.length) {
    console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
    process.exitCode = 1;
  }
  return errors.length === 0;
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'manifest') {
    const [directory, output] = args;
    const manifest = createArtifactManifest(directory);
    writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Artifact manifest written: ${output}\nartifactSha256=${manifest.artifactSha256}\nartifactFileManifestSha256=${manifest.artifactFileManifestSha256}`);
  } else if (command === 'verify') {
    const [directory, input] = args;
    const manifest = JSON.parse(readFileSync(input, 'utf8'));
    if (printErrors(verifyArtifactManifest(directory, manifest))) console.log('Retained site artifact identity verified.');
  } else if (command === 'built-output') {
    if (printErrors(validateBuiltOutput(args[0]))) console.log('Built HTML, links, canonical metadata, sitemap, feed, and URL manifest are valid.');
  } else if (command === 'policy') {
    const root = resolve(args[0] ?? '.');
    const policy = JSON.parse(readFileSync(join(root, 'infrastructure/cloudflare/hostname-redirects.v1.json'), 'utf8'));
    const errors = [
      ...validateCanonicalConfig(readFileSync(join(root, 'site/astro.config.mjs'), 'utf8')),
      ...validateHostnamePolicy(policy),
      ...validateDeploymentWorkflow(readFileSync(join(root, '.github/workflows/publication.yml'), 'utf8')),
    ];
    for (const file of filesUnder(join(root, 'site/src/content/redirects'))) {
      const text = readFileSync(file, 'utf8');
      if (REDIRECT_HOSTS.some((host) => text.includes(host))) errors.push(diagnostic(relative(root, file), 'hostname', 'REDIRECT-POLICY', 'hostname rules must remain outside content redirects'));
    }
    if (printErrors(errors)) console.log('Canonical, Cloudflare redirect, and build-once deployment policies are valid.');
  } else if (command === 'cloudflare-readiness') {
    const input = JSON.parse(readFileSync(args[0], 'utf8'));
    if (printErrors(validateCloudflareReadiness(input))) console.log('Cloudflare identifiers, DNS, certificate, and rule readiness are valid.');
  } else {
    console.error('Usage: publication.mjs manifest <dist> <output> | verify <dist> <manifest> | built-output <dist> | policy <root> | cloudflare-readiness <input>');
    process.exitCode = 2;
  }
}
