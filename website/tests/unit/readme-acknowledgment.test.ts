import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ACKNOWLEDGMENT_DISCLAIMER, ACKNOWLEDGMENT_STATEMENT } from '../../src/content/acknowledgment';

const root = fileURLToPath(new URL('../..', import.meta.url));
const READMES = ['README.md', 'evidence/README.md', 'workflows/baseline-slurm-apptainer/README.md', 'workflows/layered-install-trees/README.md'];

describe('READMEs carry the funding acknowledgment, verbatim', () => {
  for (const path of READMES) {
    const text = readFileSync(`${root}/../${path}`, 'utf8');

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

  it('the root README links the guide, and every repository link it makes resolves', () => {
    const text = readFileSync(`${root}/../README.md`, 'utf8');
    expect(text).toContain('](https://laptop-to-cluster.org)');
    const links = [...text.matchAll(/\]\(([^)#]+)\)/g)].map(([, target]) => target).filter((target) => !/^[a-z]+:/.test(target));
    expect(links.length).toBeGreaterThan(3);
    for (const target of links) expect(existsSync(`${root}/../${target}`), target).toBe(true);
  });
});
