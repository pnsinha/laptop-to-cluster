import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { DESIGNED_NOT_RUN, LEARNING_PATH, REQUIRED_FRAGMENTS, TIMELINE_STEPS } from '../../site/src/content/contracts';
import { canonicalPath } from '../../site/src/content/registry';
import { contentItemSchema } from '../../site/src/content/schema';

const root = fileURLToPath(new URL('../..', import.meta.url));
const items = resolve(root, 'site/src/content/content-items');

function readItem(file: string): { data: Record<string, unknown>; body: string } {
  const source = readFileSync(resolve(items, file), 'utf8');
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${file}: no frontmatter`);
  return { data: parse(match[1]) as Record<string, unknown>, body: match[2] };
}
const words = (text: string) => text.replace(/<[^>]+>/g, ' ').split(/\s+/).filter((token) => /[A-Za-z0-9]/.test(token)).length; // markdown punctuation is not a word
const h2s = (body: string) => [...body.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
const section = (body: string, start: string) => body.split(/^## /m).find((part) => part.startsWith(start)) ?? '';

/* Instructional prose is checked for concepts and links, never frozen verbatim. System names, versions, dates
   and job IDs belong to the test record only (spec section 2.3). */
const SYSTEM_OR_DATE = /\b(?:Purdue|Anvil|Expanse)\b|\b\d{4}-\d{2}-\d{2}\b|\b(?:Slurm|Apptainer)\s+v?\d|\bjob\s*(?:ID\s*)?\d{5,}\b/i;
const KNOWN_ROUTES = new Set([
  '/', '/start/', '/diagnostics/', '/resources/', '/guide/tour/', '/guide/scheduler-as-orchestrator/',
  '/guide/baseline-single-node-pattern/', '/guide/compose-to-hpc-translation/', '/adoption/evaluate/',
  '/about/glossary/', '/about/support/', '/about/project/', '/about/attribution/', '/about/talks-and-papers/', '/milestones/2/',
]);
const FRAGMENTS: Record<string, readonly string[]> = {
  '/about/glossary/': REQUIRED_FRAGMENTS.glossary,
  '/adoption/evaluate/': REQUIRED_FRAGMENTS.evaluate,
};
function linkProblems(body: string): string[] {
  const hrefs = [...body.matchAll(/\]\((\/[^)\s]*)\)|href="(\/[^"]*)"/g)].map((match) => match[1] ?? match[2]);
  return hrefs.flatMap((href) => {
    const [path, fragment] = href.split('#');
    if (!KNOWN_ROUTES.has(path)) return [`unknown route ${href}`];
    if (fragment && path in FRAGMENTS && !FRAGMENTS[path].includes(fragment)) return [`unknown fragment ${href}`];
    if (fragment && !(path in FRAGMENTS) && !path.startsWith('/diagnostics/')) return [`unexpected fragment ${href}`];
    return [];
  });
}

describe('Translate page (Module 3)', () => {
  const { data, body } = readItem('03-compose-to-hpc-translation.md');

  it('is a published conceptual module at the Translate route, on the learning path', () => {
    const item = contentItemSchema.parse(data);
    expect(item.id).toBe('module-3-compose-to-hpc-translation');
    expect(item.status).toBe('published');
    expect(item.artifact_type === 'learning-module' && item.module_type).toBe('conceptual');
    expect(canonicalPath(item)).toBe('/guide/compose-to-hpc-translation/');
    expect(data.title).toBe('Translate a Compose file');
    expect(LEARNING_PATH).toContain(item.id);
  });

  it('follows the step outline in order: steps 0 to 5, mistakes, what varies, key points, next step', () => {
    const headings = h2s(body);
    const expected = ['Step 0', 'Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5', 'Common mistakes', 'What varies by center', 'Key points', 'Next step'];
    expect(headings).toHaveLength(expected.length);
    expected.forEach((start, index) => expect(headings[index].startsWith(start), headings[index]).toBe(true));
    expect(headings[0]).toMatch(/right pattern/i);
  });

  it('removes the superseded material', () => {
    for (const gone of [/nc -z/, /SLURM_SCRATCH/, /mkdir -p/, /^\s*wait\s*$/m, /Example pending/, /Real-world grounding/i, /core dictionary/i, /ch-run|--fakeroot|postgres/i]) {
      expect(body).not.toMatch(gone);
    }
  });

  it('maps each construct in one table with a status per row and no tag column', () => {
    const rows = section(body, 'Step 2').split('\n').filter((line) => line.startsWith('|'));
    const [header, , ...dataRows] = rows;
    expect(header.toLowerCase()).not.toContain('tag');
    expect(header).toMatch(/Compose construct.*Cluster form.*Status/);
    expect(dataRows.length).toBeGreaterThanOrEqual(10);
    const statuses = dataRows.map((row) => row.split('|').slice(1, -1).map((cell) => cell.trim()).at(-1));
    for (const status of statuses) {
      expect(status === DESIGNED_NOT_RUN || status === '[Tested](/adoption/evaluate/#not-tested)', String(status)).toBe(true);
    }
    expect(statuses).toContain(DESIGNED_NOT_RUN);
    expect(statuses.filter((status) => status !== DESIGNED_NOT_RUN).length).toBeGreaterThanOrEqual(5);
    expect(body.match(/^\| Compose construct/gm)).toHaveLength(1);
  });

  it('keeps the keep and replace list in agreement with the workflow package', () => {
    const readme = readFileSync(resolve(root, 'workflows/baseline-slurm-apptainer/README.md'), 'utf8');
    const adapterTable = readme.split('## Adapter variables and bounds')[1].split('\n## ')[0];
    const variables = [...adapterTable.matchAll(/^\| `([A-Z0-9_]+)` \|/gm)].map((match) => match[1]);
    expect(variables).toHaveLength(14);
    for (const variable of variables) expect(body, variable).toContain(`\`${variable}\``);

    const lines = (file: string, from: number, to: number) => readFileSync(resolve(root, 'workflows/baseline-slurm-apptainer/bin', file), 'utf8').split('\n').slice(from - 1, to).join('\n');
    expect(lines('readiness.py', 29, 31)).toContain('"status": "ready"');
    expect(lines('coordinator.py', 27, 28)).toMatch(/def health[\s\S]*"status": "ready"/);
    expect(body).toContain('bin/readiness.py#L29-L31');
    expect(body).toContain('bin/coordinator.py#L27-L28');
    for (const file of ['readiness.py', 'coordinator.py', 'common.py', 'verify.py', 'worker.py']) expect(body).toContain(`bin/${file}`);
    expect(body).toContain('/blob/v0.1.0/workflows/baseline-slurm-apptainer/');
  });

  it('defines success the way the workflow does', () => {
    const step5 = section(body, 'Step 5');
    expect(step5).toContain('`result.json`');
    expect(step5).toContain('"status": "success"');
    expect(step5).toContain('`events.jsonl`');
    expect(step5).toMatch(/zero exit code is not success/i);
    expect(step5).toMatch(/readiness gate passing before any worker/i);
  });

  it('keeps system names, versions and dates out of the page text and uses the evidence labels', () => {
    expect(body).not.toMatch(SYSTEM_OR_DATE);
    expect(String(data.title)).not.toMatch(SYSTEM_OR_DATE);
    expect((body.match(new RegExp(DESIGNED_NOT_RUN, 'g')) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(body).not.toMatch(/reservation/i);
    expect(body).not.toMatch(/\bElsa\b|program administrator/i);
  });

  it('links only to pages and fragments that exist, and glosses the core terms', () => {
    expect(linkProblems(body)).toEqual([]);
    for (const fragment of ['job-step', 'readiness-gate', 'job-scoped-scratch', 'loopback']) expect(body).toContain(`/about/glossary/#${fragment}`);
    expect(body).toContain('/adoption/evaluate/#when-not');
  });

  it('lists the common mistakes the example script avoids', () => {
    const mistakes = section(body, 'Common mistakes');
    expect(mistakes).toMatch(/wait(?:ing)? on the coordinator/i);
    expect(mistakes).toMatch(/wall-time/i);
    expect(mistakes).toMatch(/fixed `sleep`/);
    expect(mistakes).toContain('`BSSW_SCRATCH_ROOT`');
  });

  it('stays within its word budget', () => {
    const count = words(body);
    expect(count).toBeGreaterThan(600);
    expect(count).toBeLessThanOrEqual(1800);
  });
});
