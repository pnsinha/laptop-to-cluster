import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Confirms that a Direct Upload went live: the origin serves the same URL manifest (and the same release-status line)
   as the checksum-verified dist that was uploaded. check-public-release.mjs proves the site is reachable and well
   formed; this proves it is THIS release. Compared as parsed JSON, so an edge rewrite of whitespace cannot cause a failure.
   Output never prints page bodies. */
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const releaseLine = (html) => /<p class="release"[^>]*>[\s\S]*?<\/p>/.exec(html)?.[0].replace(/\s+/g, ' ').trim();

async function fetchText(fetchImpl, url) {
  const response = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (response.status !== 200) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

export async function checkOnce({ origin, distDir, fetchImpl = fetch }) {
  const problems = [];
  const expected = JSON.parse(readFileSync(join(distDir, 'url-manifest.json'), 'utf8'));
  try {
    const live = JSON.parse(await fetchText(fetchImpl, `${origin}/url-manifest.json`));
    if (JSON.stringify(live) !== JSON.stringify(expected)) problems.push('/url-manifest.json: live manifest differs from the uploaded artifact');
  } catch (error) {
    problems.push(`/url-manifest.json: ${error.message}`);
  }
  try {
    const home = await fetchText(fetchImpl, `${origin}/`);
    const wanted = existsSync(join(distDir, 'index.html')) ? releaseLine(readFileSync(join(distDir, 'index.html'), 'utf8')) : undefined;
    if (wanted && releaseLine(home) !== wanted) problems.push('/: release status line differs from the uploaded artifact');
  } catch (error) {
    problems.push(`/: ${error.message}`);
  }
  return problems;
}

export async function verifyLiveRelease({ origin, distDir, fetchImpl = fetch, attempts = 12, delayMs = 10000, wait = sleep }) {
  let problems = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    problems = await checkOnce({ origin, distDir, fetchImpl });
    if (problems.length === 0) return { ok: true, attempts: attempt, problems };
    if (attempt < attempts) await wait(delayMs);
  }
  return { ok: false, attempts, problems };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const option = (name, fallback) => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : fallback; };
  const origin = option('--origin', 'https://laptop-to-cluster.org').replace(/\/$/, '');
  const result = await verifyLiveRelease({
    origin, distDir: resolve(option('--dist', 'site/dist')),
    attempts: Number(option('--attempts', '12')), delayMs: Number(option('--delay', '10')) * 1000,
  });
  if (!result.ok) {
    console.error(result.problems.map((problem) => `ERROR: [LIVE-RELEASE] ${problem}`).join('\n'));
    process.exit(1);
  }
  console.log(`Live ${origin} serves the uploaded release (verified on attempt ${result.attempts}).`);
}
