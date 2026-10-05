import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');
const previous = JSON.parse(read('releases/v0.1.0/release-candidate.json'));
const candidate = JSON.parse(read('releases/v0.2.0/release-candidate.json'));
const notes = read('releases/v0.2.0/RELEASE_NOTES.md');

/* The boundary pattern is read from the environment, else the untracked pattern file (absent in worker worktrees).
   Assertions are booleans only: a failure never prints the matched text. `npm run validate:boundary` is the real gate. */
function boundaryPattern(): RegExp | undefined {
  const fromEnv = process.env.L2C_BOUNDARY_PATTERN?.trim();
  const file = `${root}/.kiro/boundary-pattern.txt`;
  const text = fromEnv || (existsSync(file) ? readFileSync(file, 'utf8').trim() : '');
  return text ? new RegExp(text, 'i') : undefined;
}
const pattern = boundaryPattern();

describe('v0.2.0 release candidate record', () => {
  it('keeps the v0.1.0 shape and adds only status', () => {
    expect(Object.keys(candidate).sort()).toEqual([...Object.keys(previous), 'status'].sort());
    expect(candidate.schemaVersion).toBe(previous.schemaVersion);
    expect(candidate.canonicalOrigin).toBe(previous.canonicalOrigin);
    expect(candidate.externalInputsRequired).toEqual(previous.externalInputsRequired);
  });

  it('identifies the release and its immutable tag', () => {
    expect(candidate.version).toBe('v0.2.0');
    expect(candidate.repositoryTag).toBe('v0.2.0');
    expect(candidate.status).toBe('candidate');
  });

  it('names its accessibility review and an applicability record that exists', () => {
    const [current, ...rest] = candidate.evidenceIds.filter((id: string) => !id.startsWith('accessibility-review-'));
    expect(candidate.evidenceIds).toContain('accessibility-review-v0.2.0');
    expect(current).toBeTruthy();
    for (const id of [current, ...rest]) expect(existsSync(`${root}/site/src/content/applicability/${id}.yml`)).toBe(true);
    expect(new Set(candidate.evidenceIds).size).toBe(candidate.evidenceIds.length);
  });

  it('lists unique canonical URLs, including the current record page', () => {
    const urls: string[] = candidate.publicSiteUrls;
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) expect(url).toMatch(/^https:\/\/laptop-to-cluster\.org\/(?:[a-z0-9-]+\/)*$/);
    const [current] = candidate.evidenceIds;
    expect(urls).toContain(`https://laptop-to-cluster.org/applicability/${current}/`);
    for (const route of ['/', '/guide/tour/', '/guide/compose-to-hpc-translation/', '/adoption/evaluate/', '/about/talks-and-papers/', '/milestones/2/']) {
      expect(urls).toContain(`https://laptop-to-cluster.org${route}`);
    }
  });

  it('classifies every change once, with at least one addition', () => {
    const classes = new Set(['added', 'changed', 'deprecated', 'corrected']);
    const ids = candidate.changes.map((change: any) => change.itemId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const change of candidate.changes) {
      expect(classes.has(change.class)).toBe(true);
      expect(typeof change.itemId).toBe('string');
    }
    expect(candidate.changes.some((change: any) => change.class === 'added')).toBe(true);
  });
});

describe('v0.2.0 release notes', () => {
  it('follow the v0.1.0 section pattern', () => {
    expect(notes.startsWith('# v0.2.0')).toBe(true);
    for (const heading of ['## Added', '## Changed', '## Corrected', '## Validation boundary', '## Publication binding']) expect(notes).toContain(`${heading}\n`);
  });

  it('describe the frozen user-facing model', () => {
    for (const phrase of ['six-step timeline', 'three doors', 'Designed, not run', 'without JavaScript']) expect(notes).toContain(phrase);
  });

  it('state no test result of their own', () => {
    expect(notes).not.toMatch(/\bjob\s+\d{6,}|\bSlurm\s+\d|\bApptainer\s+\d|\b\d+(?:\.\d+)?\s?%/);
  });

  it.skipIf(!pattern)('contain no boundary term (here and in the candidate record)', () => {
    expect(pattern!.test(notes)).toBe(false);
    expect(pattern!.test(JSON.stringify(candidate))).toBe(false);
  });
});
