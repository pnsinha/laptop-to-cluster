import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const html = readFileSync(`${root}/site/dist/index.html`, 'utf8');
const moduleTwo = readFileSync(`${root}/site/dist/guide/baseline-single-node-pattern/index.html`, 'utf8');
const release = readFileSync(`${root}/site/dist/releases/v0-1-0/index.html`, 'utf8');

describe('static Astro publication candidate', () => {
  it('uses only the canonical apex and exposes the public repository path', () => {
    expect(html).toContain('<link rel="canonical" href="https://laptop-to-cluster.org/">');
    expect(html).toContain('Companion repository');
    expect(html).not.toMatch(/\.pages\.dev|www\.laptop-to-cluster\.org|laptoptocluster\.org/);
  });

  it('requires no authentication or server state', () => {
    expect(html).toContain('No account is required');
    expect(html).not.toMatch(/type="password"|\/api\/auth|Set-Cookie/i);
  });

  it('renders bounded applicability on Module 2 and the release page before claims', () => {
    for (const page of [moduleTwo, release]) {
      expect(page).toContain('Purdue Anvil');
      expect(page).toContain('Validation status</dt><dd>unvalidated');
      expect(page).toContain('primary representative environment');
      expect(page).toContain('does not establish unchanged portability');
      expect(page).toContain('No representative-environment success is claimed');
    }
    expect(moduleTwo.indexOf('Applicability before execution')).toBeLessThan(moduleTwo.indexOf('<h2 id="procedure">'));
  });
});
