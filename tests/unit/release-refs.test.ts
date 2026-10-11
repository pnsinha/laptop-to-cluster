import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveReleaseRefs } from '../../site/src/content/release.js';

const module3 = readFileSync('site/src/content/content-items/03-compose-to-hpc-translation.md', 'utf8');

describe('release-pinned learner links', () => {
  it('resolves the release token in link targets and leaves pinned links alone', () => {
    const html = '<a href="https://github.com/o/r/blob/@release/a/README.md">x</a><a href="https://github.com/o/r/blob/v0.1.0/a.py#L1">y</a>';
    expect(resolveReleaseRefs(html, 'v9.9.9')).toBe('<a href="https://github.com/o/r/blob/v9.9.9/a/README.md">x</a><a href="https://github.com/o/r/blob/v0.1.0/a.py#L1">y</a>');
    expect(() => resolveReleaseRefs(html, '')).toThrow(/release version is required/);
  });

  it('also resolves the token where it stands alone in text, such as a clone command', () => {
    const html = '<pre><code>git clone --branch @release https://example.org/r.git</code></pre><a href="https://example.org/blob/@release/x">x</a><p>@releases and a@release stay</p>';
    expect(resolveReleaseRefs(html, 'v9.9.9')).toBe('<pre><code>git clone --branch v9.9.9 https://example.org/r.git</code></pre><a href="https://example.org/blob/v9.9.9/x">x</a><p>@releases and a@release stay</p>');
  });

  it('uses the token for the clone command on the run page', () => {
    const start = readFileSync('site/src/content/content-items/getting-started.md', 'utf8');
    expect(start).toContain('git clone --branch @release https://github.com/pnsinha/laptop-to-cluster.git && cd laptop-to-cluster');
    expect(start).not.toMatch(/--branch v\d/);
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
