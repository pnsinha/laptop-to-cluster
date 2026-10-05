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

import { readdirSync } from 'node:fs';

describe('W6 built pages: Troubleshooting', () => {
  const html = page('diagnostics');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const printed = [
    'BSSW-PREQ-SLURM', 'BSSW-PREQ-APPTAINER', 'BSSW-PREQ-COMMAND', 'BSSW-PREQ-VALUE', 'BSSW-PREQ-IMAGE', 'BSSW-PREQ-INPUT',
    'BSSW-INTEGRITY-INPUT', 'BSSW-INTEGRITY-IMAGE', 'BSSW-PREQ-STORAGE', 'BSSW-COORDINATOR-EXIT', 'BSSW-READY-TIMEOUT',
    'BSSW-WORKER-EXIT', 'BSSW-VERIFY-RESULT', 'BSSW-CLEANUP-SIGNAL', 'BSSW-CLEANUP-CHILD',
  ];

  it('shows every printed ID in a heading and answers to its lower-cased anchor', () => {
    for (const code of printed) {
      expect(html, code).toMatch(new RegExp(`<h2[^>]*>${code}: `));
      expect(ids, code).toContain(code.toLowerCase());
    }
  });

  it('keeps the four anchors that were published before this release', () => {
    for (const anchor of ['bssw-prereq-slurm', 'bssw-prereq-apptainer', 'bssw-storage-unavailable', 'bssw-readiness-timeout']) {
      expect(ids, anchor).toContain(anchor);
    }
  });

  it('has no duplicate ids', () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves every /diagnostics/#fragment link anywhere on the site', () => {
    const files = (readdirSync(dist, { recursive: true }) as string[]).filter((name) => name.endsWith('.html'));
    for (const file of files) {
      const text = readFileSync(resolve(dist, file), 'utf8');
      for (const [, fragment] of text.matchAll(/href="\/diagnostics\/#([^"]+)"/g)) {
        expect(ids, `${file} -> #${fragment}`).toContain(fragment);
      }
    }
  });
});

describe('W6 built pages: Modules 1 and 2', () => {
  const one = page('guide/scheduler-as-orchestrator');
  const two = page('guide/baseline-single-node-pattern');
  const at = (html: string, needle: string): number => {
    const index = html.indexOf(needle);
    expect(index, needle).toBeGreaterThanOrEqual(0);
    return index;
  };

  it('shows the six-step timeline once per page: unlit on Module 1, step 3 lit on Module 2', () => {
    expect(count(one, /<figure class="timeline"/g)).toBe(1);
    expect(count(two, /<figure class="timeline"/g)).toBe(1);
    expect(one).not.toContain('aria-current="step"');
    expect(two).toMatch(/<li class="timeline__step" data-step="3" aria-current="step"/);
  });

  it('puts the timeline inside the section the body asks for', () => {
    expect(at(one, 'id="map-each-responsibility"')).toBeLessThan(at(one, '<figure class="timeline"'));
    expect(at(one, '<figure class="timeline"')).toBeLessThan(at(one, 'id="what-varies-by-center"'));
    expect(at(two, 'id="how-the-baseline-works"')).toBeLessThan(at(two, '<figure class="timeline"'));
    expect(at(two, '<figure class="timeline"')).toBeLessThan(at(two, 'id="files-the-workflow-reads-and-writes"'));
  });

  it('places the diagrams and the implementation reference by marker, and leaks no marker', () => {
    expect(count(one, /<figure class="diagram"/g)).toBe(2);
    expect(count(two, /<figure class="diagram"/g)).toBe(1);
    expect(at(two, 'id="implementation-reference"')).toBeLessThan(at(two, 'id="files-the-workflow-reads-and-writes"'));
    expect(one + two).not.toContain('l2c:');
  });

  it('keeps the procedure heading after the evidence badge and before the expected result', () => {
    expect(at(two, 'evidence-badge')).toBeLessThan(at(two, '<h2 id="procedure">'));
    expect(at(two, '<h2 id="procedure">')).toBeLessThan(at(two, 'id="expected-result"'));
  });

  it('ends each module with its key points and shows no hash or retired promise', () => {
    expect(at(one, 'id="key-points"')).toBeGreaterThan(at(one, 'id="adapt-it"'));
    expect(at(two, 'id="key-points"')).toBeGreaterThan(at(two, 'id="safety-and-scope-limitations"'));
    expect(two).not.toMatch(/[0-9a-f]{64}/);
    expect(two).not.toMatch(/worker-results\.json|rc\.1/);
  });

  it('renders the corrected diagram vocabulary on Module 2', () => {
    expect(two).toContain('${RUNTIME_DIR}');
    expect(two).toContain('srun step · apptainer exec');
    expect(one).toContain('Designed, not run');
  });
});
