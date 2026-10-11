import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ACKNOWLEDGMENT_DISCLAIMER, ACKNOWLEDGMENT_STATEMENT } from '../../site/src/content/acknowledgment';

const root = fileURLToPath(new URL('../..', import.meta.url));
const READMES = ['README.md', 'evidence/README.md', 'workflows/baseline-slurm-apptainer/README.md', 'workflows/layered-install-trees/README.md'];

describe('READMEs carry the funding acknowledgment, verbatim', () => {
  for (const path of READMES) {
    const text = readFileSync(`${root}/${path}`, 'utf8');

    it(`${path} contains the exported statement and disclaimer, byte for byte`, () => {
      expect(text).toContain(ACKNOWLEDGMENT_STATEMENT);
      expect(text).toContain(ACKNOWLEDGMENT_DISCLAIMER);
    });

    it(`${path} has one Acknowledgment section, with the statement before the disclaimer`, () => {
      expect(text.match(/^## Acknowledgment$/gm)).toHaveLength(1);
      expect(text.indexOf(ACKNOWLEDGMENT_STATEMENT)).toBeLessThan(text.indexOf(ACKNOWLEDGMENT_DISCLAIMER));
      expect(text.split(ACKNOWLEDGMENT_STATEMENT)).toHaveLength(2);
      expect(text.split(ACKNOWLEDGMENT_DISCLAIMER)).toHaveLength(2);
    });
  }

  it('the root README links the site and the release notes', () => {
    const text = readFileSync(`${root}/README.md`, 'utf8');
    expect(text).toContain('](https://laptop-to-cluster.org)');
    expect(text).toContain('](https://laptop-to-cluster.org/milestones/2/#release-v0-2-0)');
  });

  it('the root README lists Modules 0 to 3', () => {
    const text = readFileSync(`${root}/README.md`, 'utf8');
    const rows = text.split('\n').filter((line) => /^\| [0-9] \|/.test(line)).map((line) => line.split('|')[1].trim());
    expect(rows).toEqual(['0', '1', '2', '3']);
  });
});
