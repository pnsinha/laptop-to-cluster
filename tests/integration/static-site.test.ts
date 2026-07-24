import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const html = readFileSync(`${root}/site/dist/index.html`, 'utf8');

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
});
