import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dist = resolve(fileURLToPath(new URL('../..', import.meta.url)), 'site/dist');
const page = (route: string) => readFileSync(resolve(dist, route, 'index.html'), 'utf8');
const htmlFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? htmlFiles(resolve(directory, entry.name)) : entry.name.endsWith('.html') ? [resolve(directory, entry.name)] : []));
const at = (html: string, needle: string, from = 0): number => {
  const index = html.indexOf(needle, from);
  expect(index, needle).toBeGreaterThanOrEqual(0);
  return index;
};
const module1 = page('guide/scheduler-as-orchestrator');
const module2 = page('guide/baseline-single-node-pattern');

describe('learning module shell', () => {
  it('orders header line, h1, evidence badge, goals and prerequisites on a runnable module', () => {
    const header = at(module2, '<header class="content-header">');
    expect(at(module2, 'class="content-header__line"', header)).toBeLessThan(at(module2, '<h1>', header));
    const headerEnd = at(module2, '</header>', header);
    const projection = at(module2, '<section class="applicability-projection', headerEnd);
    const overview = at(module2, 'id="module-overview-heading"', projection);
    expect(module2).toContain('>In this module</h2>');
    expect(at(module2, '>Prerequisites</h3>', overview)).toBeLessThan(at(module2, '<h2 id="procedure">'));
  });

  it('marks the commands in the Module 2 prerequisite checks as code and escapes the rest', () => {
    expect(module2).toContain('<li>Run <code>command -v sbatch</code> and confirm an allocation/account is available');
    expect(module2).toContain('<li>Run <code>command -v apptainer</code> and record <code>apptainer --version</code>');
    const prerequisites = module2.slice(module2.indexOf('>Prerequisites</h3>'), module2.indexOf('</ul>', module2.indexOf('>Prerequisites</h3>')));
    expect(prerequisites).toContain('<code>');
    expect(prerequisites).not.toContain('`');
  });

  it('drops the old module-details block and the empty-heading patterns', () => {
    for (const html of [module1, module2]) {
      expect(html).not.toContain('module-facts');
      expect(html).not.toContain('Module details');
    }
    const repository = module2.match(/<h2 id="repository">Workflow package on GitHub<\/h2><ul>([\s\S]*?)<\/ul>/);
    if (repository) expect(repository[1]).toContain('<li>');
  });

  it('shows the six-step timeline once per module: unlit on Module 1, step 3 lit on Module 2', () => {
    expect(module1.match(/<figure class="timeline"/g)).toHaveLength(1);
    expect(module2.match(/<figure class="timeline"/g)).toHaveLength(1);
    expect(module1).not.toContain('aria-current="step"');
    expect(module2.match(/aria-current="step"/g)).toHaveLength(1);
    expect(module2).toMatch(/<li class="timeline__step" data-step="3" aria-current="step">/);
    for (const html of [module1, module2]) {
      expect(at(html, 'id="module-overview-heading"')).toBeLessThan(at(html, '<figure class="timeline"'));
      expect(at(html, '<figure class="timeline"')).toBeLessThan(at(html, 'class="sources-scope"'));
    }
  });

  it('keeps Sources as a closed disclosure after the article, with the pager before it', () => {
    for (const html of [module1, module2]) {
      expect(at(html, '<nav class="module-pager"')).toBeLessThan(at(html, 'class="sources-scope"'));
      expect(at(html, 'class="sources-scope"')).toBeGreaterThan(html.lastIndexOf('</article>'));
      expect(html).not.toMatch(/<details[^>]*\sopen/);
    }
  });

  it('builds the pager from LEARNING_PATH: Module 2 follows the start guide', () => {
    const nav = module2.match(/<nav class="module-pager"[\s\S]*?<\/nav>/)?.[0] ?? '';
    expect(nav).toContain('<a rel="prev" href="/start/">');
    expect(nav).not.toMatch(/[←→]/);
  });

  it('never leaks an l2c slot marker into any built page', () => {
    for (const file of htmlFiles(dist)) expect(readFileSync(file, 'utf8'), file).not.toContain('l2c:');
  });
});
