import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyLiveRelease } from '../../scripts/verify-live-release.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const ORIGIN = 'https://laptop-to-cluster.org';
const manifest = { canonical_origin: ORIGIN, records: [{ id: 'home', path: '/', url: `${ORIGIN}/` }] };
const page = (release: string) => `<!doctype html><footer><p class="release" aria-label="Release status">Release status: ${release}</p></footer>`;
const temporary: string[] = [];
const servers: Server[] = [];
afterEach(() => {
  temporary.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }));
  servers.splice(0).forEach((server) => server.close());
});

function dist(release = 'v0.2.0') {
  const directory = mkdtempSync(join(tmpdir(), 'l2c-live-release-'));
  temporary.push(directory);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'url-manifest.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(join(directory, 'index.html'), page(release));
  return directory;
}
const respond = (files: Record<string, string>) => (async (input: any) => {
  const path = new URL(String(input)).pathname;
  return path in files ? new Response(files[path], { status: 200 }) : new Response('missing', { status: 404 });
}) as unknown as typeof fetch;
const noWait = async () => {};

describe('verifyLiveRelease', () => {
  it('passes when the origin serves the uploaded manifest and release line, even if whitespace differs', async () => {
    const result = await verifyLiveRelease({ origin: ORIGIN, distDir: dist(), fetchImpl: respond({ '/url-manifest.json': JSON.stringify(manifest), '/': page('v0.2.0') }), attempts: 1, wait: noWait });
    expect(result).toEqual({ ok: true, attempts: 1, problems: [] });
  });

  it('retries while the edge still serves the previous deployment, then passes', async () => {
    let calls = 0;
    const fetchImpl = (async (input: any) => {
      const path = new URL(String(input)).pathname;
      if (path === '/url-manifest.json') { calls += 1; return new Response(JSON.stringify(calls < 3 ? { ...manifest, records: [] } : manifest), { status: 200 }); }
      return new Response(page('v0.2.0'), { status: 200 });
    }) as unknown as typeof fetch;
    const waits: number[] = [];
    const result = await verifyLiveRelease({ origin: ORIGIN, distDir: dist(), fetchImpl, attempts: 5, delayMs: 7, wait: async (ms) => { waits.push(ms); } });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(3);
    expect(waits).toEqual([7, 7]);
  });

  it('fails with named problems and never echoes page content', async () => {
    const result = await verifyLiveRelease({ origin: ORIGIN, distDir: dist(), fetchImpl: respond({ '/url-manifest.json': JSON.stringify({ records: [] }), '/': page('v0.1.0') }), attempts: 2, wait: noWait });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([
      '/url-manifest.json: live manifest differs from the uploaded artifact',
      '/: release status line differs from the uploaded artifact',
    ]);
    expect(result.problems.join('\n')).not.toContain('v0.1.0');
  });

  it('reports a missing page as an HTTP status', async () => {
    const result = await verifyLiveRelease({ origin: ORIGIN, distDir: dist(), fetchImpl: respond({}), attempts: 1, wait: noWait });
    expect(result.problems).toEqual([expect.stringContaining('returned HTTP 404'), expect.stringContaining('returned HTTP 404')]);
  });

  it('reports a network failure without throwing', async () => {
    const failing = (async () => { throw new Error('connect ECONNREFUSED'); }) as unknown as typeof fetch;
    const result = await verifyLiveRelease({ origin: ORIGIN, distDir: dist(), fetchImpl: failing, attempts: 1, wait: noWait });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain('ECONNREFUSED');
  });
});

describe('verify-live-release CLI', () => {
  async function serve(files: Record<string, string>) {
    const server = createServer((request, response) => {
      const body = files[request.url ?? ''];
      response.statusCode = body === undefined ? 404 : 200;
      response.end(body ?? 'missing');
    });
    servers.push(server);
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    return `http://127.0.0.1:${(server.address() as any).port}`;
  }
  // Async spawn: a synchronous child would block this process's event loop, and the test server lives in it.
  const run = (origin: string, directory: string) => new Promise<{ status: number | null; stdout: string; stderr: string }>((done) => {
    const child = spawn(process.execPath, [join(repo, 'scripts/verify-live-release.mjs'), '--origin', origin, '--dist', directory, '--attempts', '1', '--delay', '0'], { env: { PATH: process.env.PATH ?? '' } });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => done({ status, stdout, stderr }));
  });

  it('exits 0 against a server that serves the uploaded artifact', async () => {
    const origin = await serve({ '/url-manifest.json': JSON.stringify(manifest), '/': page('v0.2.0') });
    const result = await run(origin, dist());
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('serves the uploaded release');
  });

  it('exits 1 with a LIVE-RELEASE error when the server still serves an older release', async () => {
    const origin = await serve({ '/url-manifest.json': JSON.stringify(manifest), '/': page('v0.1.0') });
    const result = await run(origin, dist());
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ERROR: [LIVE-RELEASE] /: release status line differs');
  });
});
