import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { DESIGNED_NOT_RUN } from '../../site/src/content/contracts';
import { compositionProfileFor } from '../../site/src/content/projections';
import { canonicalPath } from '../../site/src/content/registry';
import { contentItemSchema } from '../../site/src/content/schema';

const root = fileURLToPath(new URL('../..', import.meta.url));
const source = readFileSync(resolve(root, 'site/src/content/content-items/about-cheat-sheet.md'), 'utf8');
const [, front, body] = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)!;
const script = readFileSync(resolve(root, 'workflows/baseline-slurm-apptainer/slurm/baseline.sbatch'), 'utf8');

/** Every error ID the launcher can print, with its exit code(s). */
function scriptCodes(): Map<string, Set<number>> {
  const codes = new Map<string, Set<number>>();
  const add = (id: string, code: number) => codes.set(id, (codes.get(id) ?? new Set<number>()).add(code));
  for (const [, id, code] of script.matchAll(/fail "(BSSW-[A-Z-]+)" (\d+)/g)) add(id, Number(code));
  if (script.includes('emit_diagnostic "BSSW-CLEANUP-SIGNAL"') && /exit 78\b/.test(script)) add('BSSW-CLEANUP-SIGNAL', 78);
  if (script.includes('emit_diagnostic "BSSW-CLEANUP-CHILD"') && /rc=79\b/.test(script)) add('BSSW-CLEANUP-CHILD', 79);
  return codes;
}
const tables = body.split(/\n\s*\n/).filter((block) => block.trim().startsWith('|')).map((block) => {
  const rows = block.trim().split('\n').map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
  return { header: rows[0], rows: rows.slice(2) };
});

describe('cheat sheet: content item', () => {
  it('is a valid About guidance note at /about/cheat-sheet/', () => {
    const item = contentItemSchema.parse(parse(front));
    expect(item.artifact_type).toBe('guidance-note');
    expect(item.route_namespace).toBe('about');
    expect(item.status).toBe('published');
    expect(compositionProfileFor(item)).toBe('about');
    expect(canonicalPath(item)).toBe('/about/cheat-sheet/');
  });

  it('wraps the page in the cheat-sheet hook that the print rules use', () => {
    expect(body.trimStart().startsWith('<div class="cheat-sheet">')).toBe(true);
    expect(body.trimEnd().endsWith('</div>')).toBe(true);
  });

  it('defines the evidence labels without naming a system, version, date or job', () => {
    expect(body).toContain('**Tested**: see [the test record](/adoption/evaluate/)');
    expect(body).toContain(`**${DESIGNED_NOT_RUN}**`);
    expect(body).not.toMatch(/Purdue|Anvil|Expanse|Jetstream|\b20\d\d\b|\bv\d+\.\d+|Slurm \d|Apptainer \d|job ?id\b|\b\d{7,}\b/i);
  });

  it('labels every table row Tested or Designed, not run', () => {
    const evidence = tables.filter(({ header }) => header[header.length - 1] === 'Evidence');
    expect(evidence).toHaveLength(2);
    const labels = evidence.flatMap(({ rows }) => rows.map((cells) => cells[cells.length - 1]));
    expect(labels.length).toBeGreaterThanOrEqual(15);
    expect(labels.every((label) => label === 'Tested' || label === DESIGNED_NOT_RUN)).toBe(true);
    expect(labels).toContain('Tested');
    expect(labels).toContain(DESIGNED_NOT_RUN);
  });

  it('has the six steps in the frozen order and the shapes for black-and-white print', () => {
    const steps = tables[0].rows.map((cells) => cells[0].replace(/ [■◆▲●]$/, ''));
    expect(steps.slice(0, 6)).toEqual(['1 Get an allocation', '2 Start coordinator', '3 Readiness gate', '4 Run workers', '5 Verify results', '6 Clean up']);
    for (const mark of ['■', '◆', '▲', '●']) expect(body).toContain(mark);
  });

  it('lists exactly the error IDs the launcher defines, with the exit codes it uses', () => {
    const expected = scriptCodes();
    expect(expected.size).toBe(15);
    const listed = new Map<string, Set<number>>();
    for (const [, id, codes] of body.matchAll(/`(BSSW-[A-Z-]+)` \(([\d, ]+)\)/g)) {
      listed.set(id, new Set(codes.split(',').map((code) => Number(code.trim()))));
    }
    expect([...listed.keys()].sort()).toEqual([...expected.keys()].sort());
    for (const [id, codes] of expected) expect([...listed.get(id)!].sort(), id).toEqual([...codes].sort());
    expect(body).toMatch(/\*\*Tested:\*\* `BSSW-READY-TIMEOUT` \(75\)/);
  });

  it('states the input ranges the launcher enforces', () => {
    for (const name of ['WORKER_COUNT', 'READINESS_TIMEOUT']) {
      const [, low, high] = script.match(new RegExp(`is_uint_range "\\$${name}" (\\d+) (\\d+)`))!;
      expect(body, name).toContain(`\`${name}\` ${low}–${high}`);
    }
    expect(body).toContain('`TASK_COUNT`');
    expect(body).toContain('`BSSW_SCRATCH_ROOT`');
  });

  it('links only to pages this release publishes', () => {
    const links = [...body.matchAll(/\]\((\/[^)]+)\)/g)].map(([, href]) => href);
    expect(new Set(links)).toEqual(new Set(['/adoption/evaluate/', '/diagnostics/', '/about/attribution/#licenses']));
  });
});
