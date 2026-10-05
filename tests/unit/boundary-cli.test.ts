import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// Synthetic fixture only. No real boundary term is ever written in a test.
const TOKEN = 'l2c-boundary-fixture';
const root = fileURLToPath(new URL('../..', import.meta.url));
const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

function fixtureRepo(body: string, message: string) {
  const directory = mkdtempSync(join(tmpdir(), 'l2c-boundary-cli-'));
  temporary.push(directory);
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: directory });
  git('init', '-q');
  writeFileSync(join(directory, 'notes.txt'), body);
  git('add', 'notes.txt');
  git('commit', '-q', '-m', message);
  return directory;
}
function cli(args: string[], pattern?: string) {
  const env: Record<string, string> = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' };
  if (pattern !== undefined) env.L2C_BOUNDARY_PATTERN = pattern;
  const result = spawnSync(process.execPath, [join(root, 'scripts/publication.mjs'), 'boundary', ...args], { encoding: 'utf8', env });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

describe('publication.mjs boundary subcommand', () => {
  it('fails on tracked and history matches while printing only locations and the fixed message', () => {
    const repo = fixtureRepo(`${TOKEN}\n`, `Record ${TOKEN}`);
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    const { status, output } = cli([repo, '--require', '--history', 'HEAD'], TOKEN);
    expect(status).toBe(1);
    expect(output).toContain('notes.txt:1 boundary term present');
    expect(output).toContain(`commit ${sha} boundary term present`);
    expect(output.toLowerCase()).not.toContain(TOKEN);
  });

  it('passes a clean repository, scans history only when asked, and fails closed when --require has no pattern', () => {
    const repo = fixtureRepo('clean\n', 'Add notes');
    const clean = cli([repo, '--require', '--history', 'HEAD'], TOKEN);
    expect(clean.status).toBe(0);
    expect(clean.output).toContain('Boundary scan clean: tracked files, site/dist, site/public PDFs, history of HEAD.');
    const noHistory = cli([repo, '--require'], TOKEN);
    expect(noHistory.status).toBe(0);
    expect(noHistory.output).not.toContain('history of');
    const missing = cli([repo, '--require']);
    expect(missing.status).toBe(1);
    expect(missing.output).toContain('ERROR: BOUNDARY-TERM: pattern unavailable');
    expect(cli([repo, '--history']).status).toBe(2);
  });

  it('wires the gate first in the publication chain with the exact C4 scripts', () => {
    const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;
    expect(scripts['validate:boundary']).toBe('node scripts/publication.mjs boundary . --require --history HEAD');
    expect(scripts['publication:validate']).toBe('npm run validate:boundary && npm run validate:built && npm run validate:policy && npm run validate:accessibility-review && npm run validate:evidence && npm run validate:repository && npm run validate:release');
  });
});
