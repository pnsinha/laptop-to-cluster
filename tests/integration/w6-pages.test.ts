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

describe('W6 built pages: Run the example', () => {
  const html = page('start');

  it('is titled "Run the example" and carries no evidence badge', () => {
    expect(html).toMatch(/<h1[^>]*>Run the example<\/h1>/);
    expect(html).not.toContain('evidence-badge');
    expect(html).not.toContain('applicability-projection');
  });

  it('links the current test record, and that record page exists', () => {
    const href = /How we know this works[\s\S]*?href="(\/applicability\/[a-z0-9-]+\/)"/.exec(html)?.[1];
    expect(href).toBeDefined();
    expect(existsSync(resolve(dist, href!.slice(1), 'index.html'))).toBe(true);
  });

  it('renders the pager between Module 1 and Module 2', () => {
    const nav = /<nav class="module-pager"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
    expect(nav).toContain('href="/guide/scheduler-as-orchestrator/"');
    expect(nav).toContain('href="/guide/baseline-single-node-pattern/"');
  });

  it('keeps the heading ids that Module 2 links to', () => {
    for (const id of ['record-your-local-values', 'get-the-container-image', 'check-the-input', 'submit-the-job', 'check-that-it-worked']) {
      expect(html).toContain(`id="${id}"`);
    }
  });
});
