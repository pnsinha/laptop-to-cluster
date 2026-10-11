import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const git = (...args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
const tagged = git('rev-parse', '--verify', '--quiet', 'v0.1.0^{commit}').status === 0;

/* /start/ tells readers the example workflow is the tested v0.1.0 code with only its README changed.
   That is a fact about the repository, so it is checked against git rather than pinned as text. */
describe('the run page’s claim that the example workflow is unchanged since v0.1.0', () => {
  it('is stated on the page', () => {
    expect(readFileSync(`${root}/site/src/content/content-items/getting-started.md`, 'utf8'))
      .toContain('is identical to the tested v0.1.0 revision; only its README changed.');
  });

  it.runIf(tagged || process.env.CI === 'true')('holds: only the README differs from the v0.1.0 tag', () => {
    expect(tagged, 'tag v0.1.0 must be fetched in CI').toBe(true);
    const changed = git('diff', '--name-only', 'v0.1.0', 'HEAD', '--', 'workflows/baseline-slurm-apptainer');
    expect(changed.status).toBe(0);
    expect(changed.stdout.trim().split('\n').filter(Boolean)).toEqual(['workflows/baseline-slurm-apptainer/README.md']);
  });
});
