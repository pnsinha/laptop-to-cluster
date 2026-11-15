import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANONICAL_ORIGIN, REDIRECT_HOSTS, resolveReleaseVersion } from './publication.mjs';

const BASE_ROUTES = ['/guide/scheduler-as-orchestrator/', '/guide/baseline-single-node-pattern/', '/start/', '/diagnostics/', '/milestones/1/', '/about/support/'];
const V020_ROUTES = ['/guide/tour/', '/guide/compose-to-hpc-translation/', '/adoption/evaluate/', '/about/talks-and-papers/', '/milestones/2/'];
const versionParts = (version) => version.slice(1).split(/[.-]/).map((part) => Number(part) || 0);
export function atLeast(version, minimum) {
  const have = versionParts(version);
  const want = versionParts(minimum);
  for (let index = 0; index < 3; index++) if (have[index] !== want[index]) return have[index] > want[index];
  return true;
}

/** What a release must show publicly. `preview` is a Cloudflare preview deployment: only the fallback host is checked. */
export function publicReleasePlan(version, { preview = false } = {}) {
  return {
    version,
    preview,
    rootTitle: 'Bridging the Laptop-to-Cluster Gap',
    rootTexts: ['Start here', 'Talk and poster links', 'Get started', 'GitHub'],
    routes: atLeast(version, 'v0.2.0') ? [...BASE_ROUTES, ...V020_ROUTES] : BASE_ROUTES,
    releaseAnchor: version === 'v0.2.0' ? { route: '/milestones/2/', text: `id="release-${version.replaceAll('.', '-')}"` } : undefined,
    repositoryTagPath: `/releases/tag/${version}`,
    fallbackRoute: '/guide/scheduler-as-orchestrator/',
    fallbackText: 'Scheduler as Orchestrator',
    checkApex: !preview,
    checkRedirects: !preview,
    checkDiscovery: !preview,
    requireRecord: !preview,
  };
}

async function run() {
  const fallbackUrl = process.env.PAGES_DEV_FALLBACK_URL;
  const repositoryUrl = process.env.REPOSITORY_URL ?? 'https://github.com/pnsinha/laptop-to-cluster';
  const releaseRecordPath = process.env.RELEASE_RECORD_PATH;
  const plan = publicReleasePlan(resolveReleaseVersion('.'), { preview: process.env.PREVIEW === '1' });
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

  if (plan.checkApex) {
    const root = await requirePublic(`${CANONICAL_ORIGIN}/`, plan.rootTitle);
    for (const text of plan.rootTexts) check(root.includes(text), CANONICAL_ORIGIN, 'root-content', `missing ${text}`);
    for (const path of plan.routes) await requirePublic(`${CANONICAL_ORIGIN}${path}`);
    if (plan.releaseAnchor) await requirePublic(`${CANONICAL_ORIGIN}${plan.releaseAnchor.route}`, plan.releaseAnchor.text);
    await requirePublic(repositoryUrl, 'laptop-to-cluster');
    await requirePublic(`${repositoryUrl}${plan.repositoryTagPath}`);
  }
  if (plan.checkRedirects) {
    for (const host of REDIRECT_HOSTS) {
      for (const path of ['/?probe=root', '/guide/scheduler-as-orchestrator/?probe=redirect']) {
        const source = `https://${host}${path}`;
        const response = await request(source);
        check(response?.status === 301, source, 'status', `expected one-hop HTTP 301, received ${response?.status ?? 'network error'}`);
        check(response?.headers.get('location') === `${CANONICAL_ORIGIN}${path}`, source, 'location', `expected exact path/query preservation to ${CANONICAL_ORIGIN}${path}, received ${response?.headers.get('location')}`);
      }
    }
  }
  if (plan.checkDiscovery) {
    for (const path of ['/sitemap-0.xml', '/feed.xml', '/url-manifest.json']) {
      const text = await requirePublic(`${CANONICAL_ORIGIN}${path}`);
      check(!/https:\/\/(?:www\.laptop-to-cluster\.org|laptoptocluster\.org|laptop-to-cluster\.pnsinha\.com|[^/\s"'<>]+\.pages\.dev)/i.test(text), path, 'canonical-origin', 'discovery output contains a noncanonical hostname');
    }
  }
  if (!fallbackUrl) errors.push('environment:PAGES_DEV_FALLBACK_URL [PUBLIC-RELEASE] recorded fallback URL is required');
  else {
    const fallback = await requirePublic(new URL(plan.fallbackRoute, fallbackUrl).href, plan.fallbackText);
    check(fallback.includes(`rel="canonical" href="${CANONICAL_ORIGIN}${plan.fallbackRoute}"`), fallbackUrl, 'canonical', 'fallback content must remain canonical to apex');
  }
  if (plan.requireRecord) {
    if (!releaseRecordPath) errors.push('environment:RELEASE_RECORD_PATH [PUBLIC-RELEASE] release reconstruction record is required');
    else {
      try {
        const record = JSON.parse(readFileSync(releaseRecordPath, 'utf8'));
        for (const field of ['version', 'repositoryTag', 'urlManifestSha256', 'deployment']) check(Boolean(record[field]), releaseRecordPath, field, 'reconstruction input is missing');
        check(record.version === plan.version, releaseRecordPath, 'version', `the release record is for ${record.version}, not ${plan.version}`);
      } catch (error) {
        errors.push(`${releaseRecordPath}:json [PUBLIC-RELEASE] ${error.message}`);
      }
    }
  }
  if (errors.length) {
    console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
    process.exit(1);
  }
  console.log(plan.preview ? 'Preview deployment fallback content and canonical metadata are valid.' : 'Apex, repository, stable routes, redirects, fallback, discovery, and anonymous access are valid.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
