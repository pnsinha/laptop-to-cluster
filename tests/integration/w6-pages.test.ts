import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = resolve(root, 'site/dist');
const page = (path: string): string => readFileSync(resolve(dist, path, 'index.html'), 'utf8');
const count = (html: string, pattern: RegExp): number => html.match(pattern)?.length ?? 0;

describe('W6 built pages: About', () => {
  it('serves exactly one #licenses target on the attribution page', () => {
    expect(count(page('about/attribution'), /\bid="licenses"/g)).toBe(1);
  });

  it('shows the neutral Module 5 line and no retired name on the project page', () => {
    const html = page('about/project');
    expect(html).toContain('reuse one CPU software layer across GPU variants (Module 5)');
    expect(html).not.toMatch(/container union/i);
  });

  it('keeps the dist free of the retired name site-wide', () => {
    for (const path of ['', 'about/project', 'about/glossary', 'milestones/2']) {
      if (existsSync(resolve(dist, path, 'index.html'))) expect(page(path)).not.toMatch(/container union/i);
    }
  });
});
