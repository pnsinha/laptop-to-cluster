import { describe, expect, it } from 'vitest';
import { REQUIRED_FRAGMENTS } from '../../site/src/content/contracts.js';
import { readItem } from './w6-content-helpers';

describe('W6 About pages', () => {
  it('describes Module 5 neutrally and drops "container union"', () => {
    const { body } = readItem('about-project.md');
    expect(body).not.toMatch(/container union/i);
    expect(body).toContain('reuse one CPU software layer across GPU variants (Module 5)');
    expect(body).toMatch(/planned:/i);
  });

  it('keeps the Milestone 2 row free of tested claims', () => {
    const row = readItem('about-project.md').body.split('\n').find((line) => line.startsWith('| 2 |')) ?? '';
    expect(row).not.toMatch(/Anvil|Expanse|validated|tested/i);
  });

  it('gives the licenses section an explicit id', () => {
    const { body } = readItem('about-attribution.md');
    for (const id of REQUIRED_FRAGMENTS.attribution) expect(body).toContain(`<h2 id="${id}">`);
  });
});
