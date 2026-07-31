import { readFileSync } from 'node:fs';
import { REDIRECT_HOSTS, CANONICAL_ORIGIN } from './publication.mjs';

const fallbackUrl = process.env.PAGES_DEV_FALLBACK_URL;
const repositoryUrl = process.env.REPOSITORY_URL ?? 'https://github.com/pnsinha/laptop-to-cluster';
const releaseRecordPath = process.env.RELEASE_RECORD_PATH;
const errors = [];
const check = (condition, source, field, message) => {
  if (!condition) errors.push(`${source}:${field} [PUBLIC-RELEASE] ${message}`);
};
async function request(url, options = {}) {
  try {
    return await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000), ...options });
  } catch (error) {
    errors.push(`${url}:request [PUBLIC-RELEASE] ${error.message}`);
    return undefined;
  }
}
async function requirePublic(url, expectedText) {
  const response = await request(url, { redirect: 'follow' });
  check(response?.status === 200, url, 'status', `expected anonymous HTTP 200, received ${response?.status ?? 'network error'}`);
  const text = response ? await response.text() : '';
  if (expectedText) check(text.includes(expectedText), url, 'content', `missing representative text: ${expectedText}`);
  check(!/type=["']password|\/api\/auth|sign in to continue/i.test(text), url, 'anonymous-access', 'authentication surface is forbidden');
  return text;
}

const root = await requirePublic(`${CANONICAL_ORIGIN}/`, 'Bridging the Laptop-to-Cluster Gap');
for (const text of ['Start here', 'Project records', 'Get started', 'Companion repository']) {
  check(root.includes(text), CANONICAL_ORIGIN, 'root-content', `missing ${text}`);
}
for (const path of [
  '/guide/scheduler-as-orchestrator/', '/guide/baseline-single-node-pattern/', '/start/',
  '/diagnostics/', '/milestones/1/', '/about/support/',
]) await requirePublic(`${CANONICAL_ORIGIN}${path}`);
await requirePublic(repositoryUrl, 'laptop-to-cluster');
await requirePublic(`${repositoryUrl}/releases/tag/v0.1.0`);
for (const host of REDIRECT_HOSTS) {
  for (const path of ['/?probe=root', '/guide/scheduler-as-orchestrator/?probe=redirect']) {
    const source = `https://${host}${path}`;
    const response = await request(source);
    check(response?.status === 301, source, 'status', `expected one-hop HTTP 301, received ${response?.status ?? 'network error'}`);
    check(response?.headers.get('location') === `${CANONICAL_ORIGIN}${path}`, source, 'location', `expected exact path/query preservation to ${CANONICAL_ORIGIN}${path}, received ${response?.headers.get('location')}`);
  }
}
for (const path of ['/sitemap-0.xml', '/feed.xml', '/url-manifest.json']) {
  const text = await requirePublic(`${CANONICAL_ORIGIN}${path}`);
  check(!/https:\/\/(?:www\.laptop-to-cluster\.org|laptoptocluster\.org|laptop-to-cluster\.pnsinha\.com|[^/\s"'<>]+\.pages\.dev)/i.test(text), path, 'canonical-origin', 'discovery output contains a noncanonical hostname');
}
if (!fallbackUrl) errors.push('environment:PAGES_DEV_FALLBACK_URL [PUBLIC-RELEASE] recorded fallback URL is required');
else {
  const fallback = await requirePublic(new URL('/guide/scheduler-as-orchestrator/', fallbackUrl).href, 'Scheduler as Orchestrator');
  check(fallback.includes(`rel="canonical" href="${CANONICAL_ORIGIN}/guide/scheduler-as-orchestrator/"`), fallbackUrl, 'canonical', 'fallback content must remain canonical to apex');
}
if (!releaseRecordPath) errors.push('environment:RELEASE_RECORD_PATH [PUBLIC-RELEASE] release reconstruction record is required');
else {
  try {
    const record = JSON.parse(readFileSync(releaseRecordPath, 'utf8'));
    for (const field of ['version', 'repositoryTag', 'urlManifestSha256', 'deployment']) check(Boolean(record[field]), releaseRecordPath, field, 'reconstruction input is missing');
  } catch (error) {
    errors.push(`${releaseRecordPath}:json [PUBLIC-RELEASE] ${error.message}`);
  }
}
if (errors.length) {
  console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
  process.exit(1);
}
console.log('Apex, repository, stable routes, redirects, fallback, discovery, and anonymous access are valid.');
