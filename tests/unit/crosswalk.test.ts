import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONCEPTS, DESIGNED_NOT_RUN } from '../../site/src/content/contracts';
import { CROSSWALK, CROSSWALK_REVISION } from '../../site/src/content/crosswalk';

const root = fileURLToPath(new URL('../..', import.meta.url));
const SBATCH = 'workflows/baseline-slurm-apptainer/slurm/baseline.sbatch';
const COORDINATOR = 'workflows/baseline-slurm-apptainer/bin/coordinator.py';
const SBATCH_LINES = [3, 6, 78, 79, 80, 120, 173, 176, 200, 201, 202, 203, 219, 220, 228, 230, 231, 239, 245, 246];
const fileLines = (path: string) => readFileSync(resolve(root, path), 'utf8').split('\n');
const taggedLines = (path: string): string[] | undefined => {
  try {
    return execFileSync('git', ['show', `${CROSSWALK_REVISION}:${path}`], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\n');
  } catch {
    return undefined;
  }
};
const hasTag = taggedLines(SBATCH) !== undefined;
const pane = (id: 'compose' | 'sbatch' | 'coordinator') => CROSSWALK.panes.find((candidate) => candidate.id === id)!;
const conceptKeys = CONCEPTS.map(({ key }) => key);

describe('crosswalk data', () => {
  it('has the heading, subtitle and three panes in display order', () => {
    expect(CROSSWALK.title).toBe('Four ideas that change meaning');
    expect(CROSSWALK.subtitle).toMatch(/same color and shape/i);
    expect(CROSSWALK.panes.map(({ id, file }) => [id, file])).toEqual([
      ['compose', 'docker-compose.yml'],
      ['sbatch', 'slurm/baseline.sbatch'],
      ['coordinator', 'bin/coordinator.py'],
    ]);
  });

  it('labels panes by status and revision, never by a test', () => {
    expect(CROSSWALK_REVISION).toBe('v0.1.0');
    expect(pane('compose').note).toBe(`simplified · ${DESIGNED_NOT_RUN}`);
    expect(pane('sbatch').note).toBe('excerpt · line numbers from v0.1.0');
    expect(pane('coordinator').note).toBe('excerpt · line numbers from v0.1.0');
    for (const { note } of CROSSWALK.panes) expect(note).not.toMatch(/\btested\b|validated|anvil|purdue|\b20\d\d\b/i);
  });

  it('quotes exactly the agreed baseline.sbatch lines, text identical to the file', () => {
    const lines = fileLines(SBATCH);
    expect(pane('sbatch').lines.map(({ n }) => n)).toEqual(SBATCH_LINES);
    for (const line of pane('sbatch').lines) expect(line.text, `line ${line.n}`).toBe(lines[line.n! - 1]);
  });

  it.skipIf(!hasTag)('matches the tagged v0.1.0 revision byte for byte', () => {
    const sbatch = taggedLines(SBATCH)!;
    for (const line of pane('sbatch').lines) expect(line.text, `line ${line.n}`).toBe(sbatch[line.n! - 1]);
    expect(pane('coordinator').lines[0].text).toBe(taggedLines(COORDINATOR)![114]);
  });

  it('quotes coordinator.py line 115 at column 0', () => {
    expect(pane('coordinator').lines).toEqual([
      { n: 115, text: fileLines(COORDINATOR)[114].trimStart(), concepts: ['net'] },
    ]);
    expect(pane('coordinator').lines[0].text).toBe('server = CoordinatorServer(("127.0.0.1", 0), state)');
  });

  it('tags every legend concept at least once in both the Compose and the sbatch pane', () => {
    for (const id of ['compose', 'sbatch'] as const) {
      const tagged = new Set(pane(id).lines.flatMap(({ concepts }) => concepts));
      expect([...tagged].sort(), id).toEqual([...conceptKeys].sort());
    }
  });

  it('uses only known concepts, without duplicates on a line', () => {
    for (const { lines } of CROSSWALK.panes) {
      for (const { concepts } of lines) {
        expect(concepts.every((key) => conceptKeys.includes(key))).toBe(true);
        expect(new Set(concepts).size).toBe(concepts.length);
      }
    }
  });

  it('keeps the Compose pane short, unnumbered and free of systems and digests', () => {
    const lines = pane('compose').lines;
    expect(lines.length).toBeLessThanOrEqual(26);
    expect(lines.every(({ n }) => n === undefined)).toBe(true);
    expect(lines.map(({ text }) => text).join('\n')).not.toMatch(/anvil|purdue|sha256:/i);
    expect(lines.map(({ text }) => text)).toEqual(expect.arrayContaining([
      '    depends_on: {coordinator: {condition: service_healthy}}',
      '      interval: 1s',
    ]));
  });
});
