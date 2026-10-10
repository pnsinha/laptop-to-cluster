import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BOUNDARY_MESSAGE,
  compileBoundaryPattern,
  isForkPullRequest,
  loadBoundaryPattern,
  matchingLines,
  runBoundaryScan,
} from '../../scripts/boundary.mjs';

// Synthetic fixture only. No real boundary term is ever written in a test.
const TOKEN = 'l2c-boundary-fixture';
const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

function tempDir() {
  const directory = mkdtempSync(join(tmpdir(), 'l2c-boundary-'));
  temporary.push(directory);
  return directory;
}
function git(cwd: string, ...args: string[]) {
  return execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8' }).trim();
}
function repo(files: Record<string, string | Buffer>, message = 'Add fixture files') {
  const root = tempDir();
  git(root, 'init', '-q');
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', message);
  return root;
}
const everyLine = (result: { stdout: string[]; stderr: string[] }) => [...result.stdout, ...result.stderr];
const leaks = (result: { stdout: string[]; stderr: string[] }) => everyLine(result).filter((line) => line.toLowerCase().includes(TOKEN));

describe('boundary pattern source', () => {
  it('prefers the environment, then the untracked local file, and never falls back to a tracked default', () => {
    const root = tempDir();
    expect(loadBoundaryPattern(root, {})).toEqual({ pattern: undefined, source: 'none' });
    mkdirSync(join(root, '.kiro'));
    writeFileSync(join(root, '.kiro/boundary-pattern.txt'), `${TOKEN}\nsecond-fixture\n\n`);
    expect(loadBoundaryPattern(root, {})).toEqual({ pattern: `${TOKEN}|second-fixture`, source: 'file' });
    expect(loadBoundaryPattern(root, { L2C_BOUNDARY_PATTERN: '   ' }).source).toBe('file');
    expect(loadBoundaryPattern(root, { L2C_BOUNDARY_PATTERN: 'from-env' })).toEqual({ pattern: 'from-env', source: 'env' });
  });

  it('normalises a multi-line environment value exactly as the local file is normalised', () => {
    const root = tempDir();
    for (const value of ['alphaterm\nbetaterm\n', 'alphaterm\r\nbetaterm\r\n', '  alphaterm \n\n\t betaterm\r\n\r\n', '\nalphaterm\nbetaterm']) {
      expect(loadBoundaryPattern(root, { L2C_BOUNDARY_PATTERN: value }), JSON.stringify(value)).toEqual({ pattern: 'alphaterm|betaterm', source: 'env' });
    }
    mkdirSync(join(root, '.kiro'));
    writeFileSync(join(root, '.kiro/boundary-pattern.txt'), 'alphaterm\r\nbetaterm\r\n');
    expect(loadBoundaryPattern(root, {}).pattern).toBe(loadBoundaryPattern(root, { L2C_BOUNDARY_PATTERN: 'alphaterm\nbetaterm\n' }).pattern);
    expect(loadBoundaryPattern(root, { L2C_BOUNDARY_PATTERN: '\r\n \n' }).source).toBe('file');
  });

  it('refuses a pattern that matches the empty string, which would flag every line', () => {
    for (const pattern of ['alphaterm|', '|betaterm', 'alphaterm||betaterm', '^', '$', '^$', '(alphaterm)?', '(alphaterm)*','(?!alphaterm)']) {
      expect(compileBoundaryPattern(pattern), pattern).toBeUndefined();
    }
    expect(compileBoundaryPattern('alphaterm|betaterm')?.test('xx BETATERM xx')).toBe(true);
    expect(compileBoundaryPattern('(alphaterm')).toBeUndefined();
  });

  it('falls back to the main worktree pattern file from a linked worktree (A10)', () => {
    const main = repo({ 'README.md': 'clean\n' });
    mkdirSync(join(main, '.kiro'));
    writeFileSync(join(main, '.kiro/boundary-pattern.txt'), `${TOKEN}\n`);
    const linked = join(tempDir(), 'linked');
    git(main, 'worktree', 'add', '-q', '-b', 'linked', linked);
    expect(loadBoundaryPattern(linked, {})).toEqual({ pattern: TOKEN, source: 'file' });
  });

  it('recognises a fork pull request only from the event payload', () => {
    const root = tempDir();
    const event = join(root, 'event.json');
    writeFileSync(event, JSON.stringify({ repository: { full_name: 'owner/site' }, pull_request: { head: { repo: { full_name: 'someone/site', fork: true } } } }));
    expect(isForkPullRequest({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: event })).toBe(true);
    writeFileSync(event, JSON.stringify({ repository: { full_name: 'owner/site' }, pull_request: { head: { repo: { full_name: 'owner/site', fork: false } } } }));
    expect(isForkPullRequest({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: event })).toBe(false);
    expect(isForkPullRequest({ GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: event })).toBe(false);
    expect(isForkPullRequest({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: join(root, 'missing.json') })).toBe(false);
  });

  it('counts matching lines case-insensitively without returning their text', () => {
    expect(matchingLines(`clean\nA ${TOKEN.toUpperCase()} line\nclean`, new RegExp(TOKEN, 'i'))).toEqual([2]);
  });
});

describe('boundary scan modes', () => {
  it('fails closed under --require or CI, warns locally, and only notices on a fork pull request', () => {
    const root = repo({ 'README.md': 'clean\n' });
    const required = runBoundaryScan({ root, require: true, env: {} });
    expect(required.exitCode).toBe(1);
    expect(required.stderr.join('\n')).toContain('pattern unavailable');
    expect(runBoundaryScan({ root, env: { CI: 'true' } }).exitCode).toBe(1);
    const local = runBoundaryScan({ root, env: {} });
    expect(local.exitCode).toBe(0);
    expect(local.stderr.join('\n')).toContain('WARNING: BOUNDARY-TERM: pattern unavailable');
    const event = join(root, 'event.json');
    writeFileSync(event, JSON.stringify({ repository: { full_name: 'owner/site' }, pull_request: { head: { repo: { full_name: 'someone/site', fork: true } } } }));
    const fork = runBoundaryScan({ root, require: true, env: { CI: 'true', GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: event, L2C_BOUNDARY_PATTERN: '' } });
    expect(fork.exitCode).toBe(0);
    expect(fork.stdout).toEqual(['::notice title=BOUNDARY-TERM::BOUNDARY-TERM: the pattern secret is unavailable on a fork pull request; scan skipped']);
  });

  it('rejects an invalid pattern, or one that matches the empty string, without echoing it', () => {
    const root = repo({ 'README.md': 'clean\n' });
    for (const pattern of [`(${TOKEN}`, `${TOKEN}|`, `${TOKEN}\n\n|\n`]) {
      const result = runBoundaryScan({ root, require: true, env: { L2C_BOUNDARY_PATTERN: pattern } });
      expect(result.exitCode, pattern).toBe(1);
      expect(result.stderr, pattern).toEqual(['ERROR: BOUNDARY-TERM: the pattern is not a valid regular expression, or it matches the empty string']);
      expect(leaks(result)).toEqual([]);
    }
  });

  it('finds every term of a multi-line environment value, as a single-line value does', () => {
    const root = repo({ 'notes.txt': 'alphaterm first\nclean line\nsecond BETATERM\n' });
    const expected = [`notes.txt:1 ${BOUNDARY_MESSAGE}`, `notes.txt:3 ${BOUNDARY_MESSAGE}`];
    const run = (value: string) => runBoundaryScan({ root, require: true, env: { L2C_BOUNDARY_PATTERN: value }, pdfToText: () => null }).findings;
    expect(run('alphaterm|betaterm')).toEqual(expected);
    expect(run('alphaterm\nbetaterm\n')).toEqual(expected);
    expect(run('alphaterm\r\nbetaterm\r\n')).toEqual(expected);
  });
});

describe('boundary scan scopes', () => {
  const env = { L2C_BOUNDARY_PATTERN: TOKEN };
  const noPdfTool = () => null;

  it('reports tracked text files by file:line only, skipping binaries and untracked files', () => {
    const root = repo({
      'notes.txt': `first line\nsecond ${TOKEN.toUpperCase()} line\n`,
      'image.bin': Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(TOKEN)]),
      [`docs/${TOKEN}.md`]: 'clean body\n',
    });
    writeFileSync(join(root, 'untracked.txt'), `${TOKEN}\n`);
    const result = runBoundaryScan({ root, require: true, env, pdfToText: noPdfTool });
    expect(result.exitCode).toBe(1);
    expect(result.findings).toContain(`notes.txt:2 ${BOUNDARY_MESSAGE}`);
    expect(result.findings.some((line) => line.startsWith('tracked path #') && line.endsWith(BOUNDARY_MESSAGE))).toBe(true);
    expect(result.findings.join('\n')).not.toContain('image.bin');
    expect(result.findings.join('\n')).not.toContain('untracked.txt');
    expect(leaks(result)).toEqual([]);
  });

  it('scans built text output and public PDFs, and asks for a manual PDF check when pdftotext is missing', () => {
    const root = repo({ 'README.md': 'clean\n' });
    mkdirSync(join(root, 'site/dist/guide'), { recursive: true });
    mkdirSync(join(root, 'site/public'), { recursive: true });
    writeFileSync(join(root, 'site/dist/guide/index.html'), `<p>clean</p>\n<p>${TOKEN}</p>\n`);
    writeFileSync(join(root, 'site/dist/font.woff2'), TOKEN);
    writeFileSync(join(root, 'site/public/poster.pdf'), '%PDF-1.4 fixture');
    const withTool = runBoundaryScan({ root, require: true, env, pdfToText: () => `page one\n\n${TOKEN} on page two\n` });
    expect(withTool.findings).toEqual([`site/dist/guide/index.html:2 ${BOUNDARY_MESSAGE}`, `site/public/poster.pdf:3 ${BOUNDARY_MESSAGE}`]);
    expect(leaks(withTool)).toEqual([]);
    const manual = 'PDF-MANUAL-CHECK site/public/poster.pdf: pdftotext is unavailable; check this PDF by hand before release';
    writeFileSync(join(root, 'site/dist/guide/index.html'), '<p>clean</p>\n');
    const withoutTool = runBoundaryScan({ root, require: true, env, pdfToText: noPdfTool });
    expect(withoutTool.exitCode).toBe(1);
    expect(withoutTool.errors).toEqual([manual]);
    expect(withoutTool.stdout.join('\n')).not.toContain('Boundary scan clean');
    expect(runBoundaryScan({ root, env: { ...env, CI: 'true' }, pdfToText: noPdfTool }).errors).toEqual([manual]);
    // Locally, without --require, it stays a warning, and the clean line names only the scopes that were scanned.
    const local = runBoundaryScan({ root, env, pdfToText: noPdfTool });
    expect(local.exitCode).toBe(0);
    expect(local.warnings).toEqual([manual]);
    expect(local.stdout).toEqual(['Boundary scan clean: tracked files, site/dist.']);
  });

  it('fails a required scan when site/dist is missing, and says so instead of claiming it was scanned', () => {
    const root = repo({ 'README.md': 'clean\n' });
    const required = runBoundaryScan({ root, require: true, env, pdfToText: noPdfTool });
    expect(required.exitCode).toBe(1);
    expect(required.errors).toEqual(['BOUNDARY-TERM: site/dist is missing; built output was not scanned (run npm run build first)']);
    expect(required.stdout).toEqual([]);
    const local = runBoundaryScan({ root, env, pdfToText: noPdfTool });
    expect(local.exitCode).toBe(0);
    expect(local.stdout).toEqual(['Boundary scan clean: tracked files, site/public PDFs.']);
  });

  it('reports history matches in diffs and in commit messages by commit SHA only', () => {
    const root = repo({ 'README.md': 'clean\n' });
    writeFileSync(join(root, 'notes.txt'), `${TOKEN}\n`);
    git(root, 'add', 'notes.txt');
    git(root, 'commit', '-q', '-m', 'Add notes');
    const added = git(root, 'rev-parse', 'HEAD');
    git(root, 'rm', '-q', 'notes.txt');
    git(root, 'commit', '-q', '-m', 'Remove notes');
    const removed = git(root, 'rev-parse', 'HEAD');
    git(root, 'commit', '-q', '--allow-empty', '-m', `Mention ${TOKEN.toUpperCase()} in a message`);
    const message = git(root, 'rev-parse', 'HEAD');
    const result = runBoundaryScan({ root, require: true, history: 'HEAD', env, pdfToText: noPdfTool });
    expect(result.exitCode).toBe(1);
    expect(new Set(result.findings)).toEqual(new Set([added, removed, message].map((sha) => `commit ${sha} ${BOUNDARY_MESSAGE}`)));
    expect(leaks(result)).toEqual([]);
  });

  it('finds a commit that only touches a file whose name matches, by commit SHA only', () => {
    const root = repo({ 'README.md': 'clean\n' });
    writeFileSync(join(root, `${TOKEN}.md`), 'clean body\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'Add a page');
    const added = git(root, 'rev-parse', 'HEAD');
    const result = runBoundaryScan({ root, require: true, history: 'HEAD', env, pdfToText: noPdfTool });
    expect(result.findings).toContain(`commit ${added} ${BOUNDARY_MESSAGE}`);
    expect(leaks(result)).toEqual([]);
  });

  it('refuses a shallow history and passes a clean repository', () => {
    const origin = repo({ 'README.md': 'clean\n' });
    git(origin, 'commit', '-q', '--allow-empty', '-m', 'Second commit');
    const shallow = join(tempDir(), 'shallow');
    git(origin, 'clone', '-q', '--depth', '1', `file://${origin}`, shallow);
    mkdirSync(join(shallow, 'site/dist'), { recursive: true });
    const refused = runBoundaryScan({ root: shallow, require: true, history: 'HEAD', env, pdfToText: noPdfTool });
    expect(refused.errors).toEqual(['BOUNDARY-TERM: history scan needs the full history (use fetch-depth: 0)']);
    mkdirSync(join(origin, 'site/dist'), { recursive: true });
    writeFileSync(join(origin, 'site/dist/index.html'), '<p>clean</p>\n');
    const clean = runBoundaryScan({ root: origin, require: true, history: 'HEAD', env, pdfToText: noPdfTool });
    expect(clean.exitCode).toBe(0);
    expect(clean.stdout).toEqual(['Boundary scan clean: tracked files, site/dist, site/public PDFs, history of HEAD.']);
    expect(clean.stderr).toEqual([]);
  });
});
