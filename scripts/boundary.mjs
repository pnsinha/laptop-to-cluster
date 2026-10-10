import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// The pattern is never stored in the repository. It comes from the environment
// (a CI secret) or from an untracked local file under the gitignored .kiro/ folder.
// Nothing in this module ever prints a matched term or a matched line.
export const BOUNDARY_ENV = 'L2C_BOUNDARY_PATTERN';
export const BOUNDARY_PATTERN_FILE = '.kiro/boundary-pattern.txt';
export const BOUNDARY_MESSAGE = 'boundary term present';
const DIST_TEXT = /\.(?:html|xml|json|txt|css|js)$/i;

// One normalisation for the environment value and the local file: a line is a term, so split on
// newlines, trim, drop empty lines and join as alternatives. Lines are matched one at a time, so a
// pattern that kept its newlines could never match anything.
export function normaliseBoundaryPattern(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join('|') || undefined;
}

export function loadBoundaryPattern(root, env = process.env) {
  const fromEnv = normaliseBoundaryPattern(env[BOUNDARY_ENV] ?? '');
  if (fromEnv) return { pattern: fromEnv, source: 'env' };
  const fromFile = readPatternFile(join(root, BOUNDARY_PATTERN_FILE));
  if (fromFile) return { pattern: fromFile, source: 'file' };
  // A10: inside a linked worktree, fall back to the main worktree's untracked file.
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const fromMain = common ? readPatternFile(join(common, '..', BOUNDARY_PATTERN_FILE)) : undefined;
    if (fromMain) return { pattern: fromMain, source: 'file' };
  } catch {
    // not a git work tree
  }
  return { pattern: undefined, source: 'none' };
}

function readPatternFile(file) {
  if (!existsSync(file)) return undefined;
  return normaliseBoundaryPattern(readFileSync(file, 'utf8'));
}

export function isForkPullRequest(env = process.env) {
  if (!['pull_request', 'pull_request_target'].includes(env.GITHUB_EVENT_NAME ?? '')) return false;
  try {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH ?? '', 'utf8'));
    const head = event.pull_request?.head?.repo;
    const base = event.repository?.full_name ?? env.GITHUB_REPOSITORY;
    return head?.fork === true || (Boolean(head?.full_name) && head.full_name !== base);
  } catch {
    return false;
  }
}

// A pattern that matches the empty string (an empty alternative, `^`, `x*`) would flag every line, or in a
// malformed secret hide that nothing was ever tested; either way it is refused, so the scan fails closed.
export function compileBoundaryPattern(pattern) {
  try {
    const regex = new RegExp(pattern, 'i');
    return regex.test('') ? undefined : regex;
  } catch {
    return undefined;
  }
}

export function matchingLines(text, regex) {
  const hits = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) if (regex.test(line)) hits.push(index + 1);
  return hits;
}

const isBinary = (buffer) => buffer.subarray(0, 8000).includes(0);
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });

function filesBelow(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(absolute) : [absolute];
  }).sort();
}

function scanFile(absolute, shown, regex) {
  const buffer = readFileSync(absolute);
  if (isBinary(buffer)) return [];
  return matchingLines(buffer.toString('utf8'), regex).map((line) => `${shown}:${line} ${BOUNDARY_MESSAGE}`);
}

export function scanTrackedFiles(root, regex) {
  const files = git(root, ['ls-files', '-z']).split('\0').filter(Boolean);
  const findings = [];
  files.forEach((path, index) => {
    const shown = regex.test(path) ? `tracked path #${index + 1}` : path;
    if (shown !== path) findings.push(`${shown} ${BOUNDARY_MESSAGE}`);
    const absolute = join(root, path);
    if (existsSync(absolute) && statSync(absolute).isFile()) findings.push(...scanFile(absolute, shown, regex));
  });
  return findings;
}

export function scanBuiltOutput(root, regex) {
  const dist = join(root, 'site/dist');
  if (!existsSync(dist)) return { findings: [], warnings: ['BOUNDARY-TERM: site/dist is missing; built output was not scanned (run npm run build first)'], scanned: false };
  const findings = [];
  filesBelow(dist).filter((file) => DIST_TEXT.test(file)).forEach((absolute, index) => {
    const path = relative(root, absolute).replaceAll('\\', '/');
    const shown = regex.test(path) ? `built path #${index + 1}` : path;
    if (shown !== path) findings.push(`${shown} ${BOUNDARY_MESSAGE}`);
    findings.push(...scanFile(absolute, shown, regex));
  });
  return { findings, warnings: [], scanned: true };
}

export function defaultPdfToText(file) {
  const result = spawnSync('pdftotext', ['-q', '-enc', 'UTF-8', file, '-'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return result.error || result.status !== 0 ? null : result.stdout;
}

export function scanPublicPdfs(root, regex, pdfToText = defaultPdfToText) {
  const directory = join(root, 'site/public');
  const pdfs = existsSync(directory) ? readdirSync(directory).filter((name) => /\.pdf$/i.test(name)).sort() : [];
  const findings = [];
  const warnings = [];
  let unchecked = 0;
  pdfs.forEach((name, index) => {
    const path = `site/public/${name}`;
    const shown = regex.test(path) ? `public PDF #${index + 1}` : path;
    if (shown !== path) findings.push(`${shown} ${BOUNDARY_MESSAGE}`);
    const text = pdfToText(join(directory, name));
    if (text === null || text === undefined) unchecked += 1;
    if (text === null || text === undefined) warnings.push(`PDF-MANUAL-CHECK ${shown}: pdftotext is unavailable; check this PDF by hand before release`);
    else findings.push(...matchingLines(text, regex).map((line) => `${shown}:${line} ${BOUNDARY_MESSAGE}`));
  });
  return { findings, warnings, scanned: unchecked === 0 };
}

export function scanHistory(root, ref, pattern) {
  const regex = compileBoundaryPattern(pattern);
  if (git(root, ['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    return { findings: [], errors: ['BOUNDARY-TERM: history scan needs the full history (use fetch-depth: 0)'] };
  }
  const commits = new Set();
  for (const selector of [`-G${pattern}`, `--grep=${pattern}`]) {
    for (const sha of git(root, ['log', ref, '-i', '-E', selector, '--format=%H']).split('\n').filter(Boolean)) commits.add(sha);
  }
  // Paths: a commit that only adds, renames or deletes a file whose NAME matches is not found by -G.
  const names = git(root, ['-c', 'core.quotepath=off', 'log', ref, '--name-only', '--format=%x00%H']);
  let current = '';
  for (const line of names.split('\n')) {
    if (line.startsWith('\0')) current = line.slice(1);
    else if (current && line && regex.test(line)) commits.add(current);
  }
  return { findings: [...commits].map((sha) => `commit ${sha} ${BOUNDARY_MESSAGE}`), errors: [] };
}

export function runBoundaryScan({ root, require = false, history, env = process.env, pdfToText = defaultPdfToText }) {
  const findings = [];
  const warnings = [];
  const notices = [];
  const errors = [];
  const scopes = [];
  const strict = require || env.CI === 'true';
  const { pattern } = loadBoundaryPattern(root, env);
  const regex = pattern ? compileBoundaryPattern(pattern) : undefined;
  if (!pattern) {
    if (isForkPullRequest(env)) notices.push('BOUNDARY-TERM: the pattern secret is unavailable on a fork pull request; scan skipped');
    else if (require || env.CI === 'true') errors.push(`BOUNDARY-TERM: pattern unavailable; set ${BOUNDARY_ENV} or create ${BOUNDARY_PATTERN_FILE}`);
    else warnings.push('BOUNDARY-TERM: pattern unavailable; scan skipped (use --require to fail instead)');
  } else if (!regex) {
    errors.push('BOUNDARY-TERM: the pattern is not a valid regular expression, or it matches the empty string');
  } else {
    try {
      findings.push(...scanTrackedFiles(root, regex));
    } catch {
      errors.push('BOUNDARY-TERM: the tracked-file scan needs a git work tree');
    }
    const built = scanBuiltOutput(root, regex);
    findings.push(...built.findings);
    const pdfs = scanPublicPdfs(root, regex, pdfToText);
    findings.push(...pdfs.findings);
    // Under --require or in CI, a scope that could not be scanned (no site/dist, no pdftotext) is an error, not a warning.
    (strict ? errors : warnings).push(...built.warnings, ...pdfs.warnings);
    scopes.push('tracked files');
    if (built.scanned) scopes.push('site/dist');
    if (pdfs.scanned) scopes.push('site/public PDFs');
    if (history) {
      try {
        const scanned = scanHistory(root, history, pattern);
        findings.push(...scanned.findings);
        errors.push(...scanned.errors);
      } catch {
        errors.push('BOUNDARY-TERM: git log failed for the requested history ref');
      }
    }
  }
  const safe = (line) => (regex && regex.test(line) ? 'BOUNDARY-TERM: output line withheld' : line);
  const exitCode = findings.length || errors.length ? 1 : 0;
  const scanned = Boolean(regex) && exitCode === 0;
  const stdout = [
    ...notices.map((notice) => `::notice title=BOUNDARY-TERM::${notice}`),
    ...(scanned ? [`Boundary scan clean: ${[...scopes, ...(history ? [`history of ${history}`] : [])].join(', ')}.`] : []),
  ].map(safe);
  const stderr = [
    ...warnings.map((warning) => `WARNING: ${warning}`),
    ...findings,
    ...errors.map((error) => `ERROR: ${error}`),
  ].map(safe);
  return { exitCode, findings: findings.map(safe), warnings: warnings.map(safe), notices: notices.map(safe), errors: errors.map(safe), stdout, stderr };
}
