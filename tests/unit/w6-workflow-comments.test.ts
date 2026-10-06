import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { read, root } from './w6-content-helpers';

const spack = read('workflows/layered-install-trees/configuration/e4s-26.06/specialized-amrex-sm80/spack.yaml').split('\n');
const sbatch = read('workflows/layered-install-trees/orchestrations/ch_compose2.sbatch').split('\n');

const walk = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

describe('W6 layered-install-trees comments', () => {
  it('states the corrected reuse figure and why it overstates runtime reuse', () => {
    expect(spack[1]).toContain('19 of 20 buildable packages reused (95.0%); most reused packages are build tools');
    expect(spack[1]).not.toContain('95.8');
  });

  it('states the logged staging size and drops the disputed comparison', () => {
    expect(sbatch[12]).toContain('~399 MB, 2,603 files (logged)');
    expect(sbatch[12]).not.toMatch(/~80 MB|32 GB/);
  });

  it('leaves no retired figure or hand-written tested claim anywhere in the tracked workflow directory', () => {
    const text = walk(join(root, 'workflows/layered-install-trees')).map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(text).not.toMatch(/95\.8%|~80 MB|8\.3×|39 of 40|39\/40/);
    /* R25: the third comment fix deletes the hand-written "Verified on Anvil 2026-08-08" claim. */
    expect(text).not.toMatch(/Verified on Anvil/);
  });
});
