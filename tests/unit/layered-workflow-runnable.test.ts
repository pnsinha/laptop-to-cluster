import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { read, root } from './w6-content-helpers';

const dir = 'workflows/layered-install-trees/orchestrations';
const scripts = readdirSync(join(root, dir)).filter((name) => name.endsWith('.sbatch'));
const readme = read('workflows/layered-install-trees/README.md');

describe('layered-install-trees package can run as published', () => {
  it('uses no shell variables in #SBATCH lines, because Slurm does not expand them', () => {
    expect(scripts.length).toBeGreaterThan(0);
    for (const name of scripts) {
      const directives = read(`${dir}/${name}`).split('\n').filter((line) => line.startsWith('#SBATCH'));
      expect(directives.filter((line) => line.includes('$')), name).toEqual([]);
    }
  });

  it('tells the reader where to stage the package and keeps disputed claims bounded', () => {
    expect(readme).toContain('stage this directory there and submit');
    expect(readme).toContain('GATE: FAIL (1 unresolved deps)');
    expect(readme).toContain('18 of the 19 reused packages are build-only');
    expect(readme).toContain('not reproducible from');
    expect(readme).not.toMatch(/~257 MB|resolve across trees without|expected, not a mechanism failure/);
  });
});
