import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DESIGNED_NOT_RUN } from '../../site/src/content/contracts.js';
import { read, readItem, root } from './w6-content-helpers';

const sbatch = read('workflows/baseline-slurm-apptainer/slurm/baseline.sbatch');
const acquire = read('workflows/baseline-slurm-apptainer/container/acquire.sh');
const printed = [...new Set([...(sbatch + acquire).matchAll(/BSSW-(?:PREQ|INTEGRITY|COORDINATOR|READY|WORKER|VERIFY|CLEANUP)-[A-Z]+/g)].map((m) => m[0]))].sort();

/** Exit codes, read from the script itself. */
const exits = new Map<string, number[]>();
for (const m of sbatch.matchAll(/fail "(BSSW-[A-Z-]+)" (\d+)/g)) exits.set(m[1], [...new Set([...(exits.get(m[1]) ?? []), Number(m[2])])]);
exits.set('BSSW-CLEANUP-SIGNAL', [78]);
exits.set('BSSW-CLEANUP-CHILD', [79]);

/** Printed code -> canonical content item id, for the four items whose ids predate the printed spelling. */
const CANONICAL: Record<string, string> = {
  'BSSW-PREQ-SLURM': 'BSSW-PREREQ-SLURM',
  'BSSW-PREQ-APPTAINER': 'BSSW-PREREQ-APPTAINER',
  'BSSW-PREQ-STORAGE': 'BSSW-STORAGE-UNAVAILABLE',
  'BSSW-READY-TIMEOUT': 'BSSW-READINESS-TIMEOUT',
};
const FILES: Record<string, string> = {
  'BSSW-PREQ-SLURM': 'diagnostic-slurm.md', 'BSSW-PREQ-APPTAINER': 'diagnostic-apptainer.md',
  'BSSW-PREQ-STORAGE': 'diagnostic-storage.md', 'BSSW-READY-TIMEOUT': 'diagnostic-readiness.md',
  'BSSW-PREQ-COMMAND': 'diagnostic-preq-command.md', 'BSSW-PREQ-VALUE': 'diagnostic-preq-value.md',
  'BSSW-PREQ-IMAGE': 'diagnostic-preq-image.md', 'BSSW-PREQ-INPUT': 'diagnostic-preq-input.md',
  'BSSW-INTEGRITY-INPUT': 'diagnostic-integrity-input.md', 'BSSW-INTEGRITY-IMAGE': 'diagnostic-integrity-image.md',
  'BSSW-COORDINATOR-EXIT': 'diagnostic-coordinator-exit.md', 'BSSW-WORKER-EXIT': 'diagnostic-worker-exit.md',
  'BSSW-VERIFY-RESULT': 'diagnostic-verify-result.md', 'BSSW-CLEANUP-CHILD': 'diagnostic-cleanup-child.md',
  'BSSW-CLEANUP-SIGNAL': 'diagnostic-cleanup-signal.md',
};

describe('W6 diagnostics', () => {
  it('finds the 15 codes the workflow prints, and has an entry for every one', () => {
    expect(printed).toHaveLength(15);
    expect(Object.keys(FILES).sort()).toEqual(printed);
  });

  it('has no diagnostic file that the table above does not know about', () => {
    const onDisk = readdirSync(resolve(root, 'site/src/content/content-items')).filter((name) => name.startsWith('diagnostic-')).sort();
    expect(onDisk).toEqual(Object.values(FILES).sort());
  });

  it.each(Object.entries(FILES))('%s: entry %s has the right id, slug, sections and exit code', (code, file) => {
    const { data, body } = readItem(file);
    expect(data.id).toBe(CANONICAL[code] ?? code);
    expect(data.stable_slug).toMatch(/^bssw-[a-z-]+$/);
    if (!CANONICAL[code]) expect(data.stable_slug).toBe(code.toLowerCase());
    expect(data.artifact_type).toBe('diagnostic');
    expect(data.status).toBe('published');
    for (const heading of ['Signal', 'Likely causes', 'Recovery steps', 'Verify the recovery', 'Escalate']) expect(body).toContain(`## ${heading}`);
    expect(body).toContain(`\`${code}\``);
    for (const exit of exits.get(code) ?? []) expect(body).toMatch(new RegExp(`\\b${exit}\\b`));
    expect(body).not.toMatch(/Anvil|Expanse|\b20\d\d\b/);
  });

  it('keeps the four canonical ids that evidence and the prerequisite lists depend on', () => {
    for (const [, id] of Object.entries(CANONICAL)) {
      const file = Object.entries(FILES).find(([code]) => CANONICAL[code] === id)![1];
      expect(readItem(file).data.id).toBe(id);
    }
    expect(readItem('diagnostic-slurm.md').data.stable_slug).toBe('bssw-prereq-slurm');
    expect(readItem('diagnostic-storage.md').data.stable_slug).toBe('bssw-storage-unavailable');
    expect(readItem('diagnostic-readiness.md').data.stable_slug).toBe('bssw-readiness-timeout');
  });

  it('labels the two never-run cleanup paths with the exact label', () => {
    expect(readItem('diagnostic-cleanup-child.md').body).toContain(DESIGNED_NOT_RUN);
    expect(readItem('diagnostic-cleanup-signal.md').body).toContain(DESIGNED_NOT_RUN);
  });
});
