import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import rehypeReleaseRefs, { resolveReleaseRef } from '../../site/plugins/release-refs.mjs';

const module3 = readFileSync('site/src/content/content-items/03-compose-to-hpc-translation.md', 'utf8');

describe('release-pinned learner links', () => {
  it('resolves the release token in link targets and leaves pinned links alone', () => {
    expect(resolveReleaseRef('https://github.com/o/r/blob/@release/a/README.md', 'v9.9.9')).toBe('https://github.com/o/r/blob/v9.9.9/a/README.md');
    expect(resolveReleaseRef('https://github.com/o/r/blob/v0.1.0/a.py#L1', 'v9.9.9')).toBe('https://github.com/o/r/blob/v0.1.0/a.py#L1');
    const tree = { type: 'root', children: [{ type: 'element', tagName: 'a', properties: { href: '/x/@release/y' }, children: [] }] };
    rehypeReleaseRefs({ version: 'v9.9.9' })()(tree);
    expect(tree.children[0].properties.href).toBe('/x/v9.9.9/y');
    expect(() => rehypeReleaseRefs({ version: '' })).toThrow(/release version is required/);
  });

  it('points the Module 3 package README link at the current release, not v0.1.0', () => {
    expect(module3).toContain('[package README](https://github.com/pnsinha/laptop-to-cluster/blob/@release/workflows/baseline-slurm-apptainer/README.md)');
    expect(module3).not.toContain('blob/v0.1.0/workflows/baseline-slurm-apptainer/README.md');
  });

  it('does not claim the job prints the result path', () => {
    expect(module3).not.toContain('where its result is');
    expect(module3).toContain('it does not print a path');
  });
});
