import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

describe('Evaluate and adopt page', () => {
  const { data, body } = readItem('adoption-evaluate.md');
  /* Markdown headings plus the two raw <h2 id="..."> headings that carry the contract fragment ids. */
  const headings = [...body.matchAll(/^(?:## (.+)|<h2 id="[a-z-]+">(.+)<\/h2>)$/gm)].map((match) => match[1] ?? match[2]);
  const tail = (heading: string) => body.slice(body.indexOf(heading));

  it('is a published adoption checklist at the Evaluate route, last on the learning path', () => {
    const item = contentItemSchema.parse(data);
    expect(item.id).toBe('adoption-evaluate');
    expect(item.artifact_type).toBe('checklist');
    expect(item.route_namespace).toBe('adoption');
    expect(item.status).toBe('published');
    expect(canonicalPath(item)).toBe('/adoption/evaluate/');
    expect(LEARNING_PATH.at(-1)).toBe(item.id);
    expect(data.title).toBe('Evaluate and adopt');
    expect(data.applicability_records ?? []).toEqual([]);
  });

  it('carries the contract fragment ids as explicit heading ids, once each', () => {
    for (const fragment of REQUIRED_FRAGMENTS.evaluate) expect(body.match(new RegExp(`<h2 id="${fragment}">`, 'g')), fragment).toHaveLength(1);
  });

  it('follows the outline in order', () => {
    const expected = ['What it is', 'Assumptions', 'What was tested where', 'Limits', 'When not to use this pattern', 'results or uptime', 'Draft adoption checklist', 'Key points'];
    expect(headings).toHaveLength(expected.length);
    expected.forEach((start, index) => expect(headings[index].toLowerCase().includes(start.toLowerCase()), headings[index]).toBe(true));
  });

  it('lists the assumptions with a "How to check" column and no empty cell', () => {
    const rows = section(body, 'Assumptions').split('\n').filter((line) => line.startsWith('|'));
    const [header, , ...dataRows] = rows;
    expect(header).toMatch(/Assumption.*How to check/);
    expect(dataRows.length).toBeGreaterThanOrEqual(7);
    for (const row of dataRows) for (const cell of row.split('|').slice(1, -1)) expect(cell.trim().length, row).toBeGreaterThan(0);
    for (const needle of [/srun/, /exclusive/i, /Apptainer/, /loopback/i, /BSSW_SCRATCH_ROOT/, /sha256sum/]) expect(rows.join('\n')).toMatch(needle);
  });

  it('puts the record summary marker between the Tested heading and the hand-written lists, with no system or date in the text', () => {
    const tested = tail('<h2 id="not-tested">');
    expect(body.match(/<!-- l2c:record-summary -->/g)).toHaveLength(1);
    expect(tested.indexOf('<!-- l2c:record-summary -->')).toBeGreaterThan(0);
    expect(tested.indexOf('<!-- l2c:record-summary -->')).toBeLessThan(tested.indexOf('**Shim-tested'));
    expect(tested.indexOf('**Shim-tested')).toBeLessThan(tested.indexOf(`**${DESIGNED_NOT_RUN}`));
    expect(body).not.toMatch(SYSTEM_OR_DATE);
    expect(body).not.toMatch(/\b(?:Tested|validated) on\b/i);
    expect(body.match(/^<!-- l2c:/gm)).toHaveLength(1);
  });

  it('lists what is Designed, not run', () => {
    const designed = tail(`**${DESIGNED_NOT_RUN}`).split('\n## ')[0].split('<h2 ')[0];
    for (const needle of [/other centers/i, /PBS/, /Charliecloud/, /GPU/, /more than one node|multiple nodes/i, /more than two workers/i, /SSH tunnel/i, /wall-time signal|force-stop/i, /Compose file/i]) {
      expect(designed, String(needle)).toMatch(needle);
    }
  });

  it('says when not to use the pattern, covering all seven cases', () => {
    const whenNot = tail('<h2 id="when-not">').split('\n## ')[0];
    for (const needle of [/stable public endpoint/i, /multi-tenant/i, /persist beyond the allocation|outlive the allocation/i, /monitoring|backups/i, /recover on (?:its|their) own/i, /multi-node|multiple nodes/i, /already (?:offers|runs)/i]) {
      expect(whenNot, String(needle)).toMatch(needle);
    }
  });

  it('marks the adoption checklist as a draft that v1.0 completes', () => {
    const checklist = section(body, 'Draft adoption checklist');
    expect(checklist).toMatch(/v1\.0 arrives with the final release/);
    expect(checklist.split('\n').filter((line) => line.startsWith('- ')).length).toBeGreaterThanOrEqual(6);
  });

  it('links only to pages and fragments that exist, avoids the door cards, and stays within its word budget', () => {
    expect(linkProblems(body)).toEqual([]);
    expect(body).not.toMatch(/class="doors?"|door__/);
    expect(body).not.toMatch(/reservation|\bElsa\b|program administrator/i);
    const count = words(body);
    expect(count).toBeGreaterThan(500);
    expect(count).toBeLessThanOrEqual(1300);
  });

  it('keeps retired names out and mentions other runtimes only under Designed, not run', () => {
    expect(body).not.toMatch(/container union/i);
    expect(body.indexOf('Charliecloud')).toBeGreaterThan(body.indexOf('<h2 id="not-tested">'));
  });
});

describe('The five-minute tour (Module 0)', () => {
  const { data, body } = readItem('00-tour.md');

  it('is Module 0 renamed to the tour: same id, new slug, first on the learning path', () => {
    const item = contentItemSchema.parse(data);
    expect(item.id).toBe('module-0-orientation');
    expect(data.stable_slug).toBe('tour');
    expect(data.title).toBe('The five-minute tour');
    expect(canonicalPath(item)).toBe('/guide/tour/');
    expect(item.artifact_type === 'learning-module' && item.module_number).toBe(0);
    expect(item.status).toBe('published');
    expect(LEARNING_PATH[0]).toBe(item.id);
    expect(existsSync(resolve(items, '00-how-to-use-this-guide.md'))).toBe(false);
    expect(readdirSync(items).filter((file) => file.startsWith('00-'))).toEqual(['00-tour.md']);
  });

  it('follows the outline in order', () => {
    expect(h2s(body)).toEqual([
      'Why Compose stops working', 'The big idea', 'The six steps in detail', 'Four ideas that change meaning',
      'The gate is not the verifier', 'Did this really run?', 'Who this guide is for', 'Key points', 'Next step',
    ]);
  });

  it('explains the six steps as headed sections that match the timeline labels, and holds no second list of steps', () => {
    const steps = [...section(body, 'The six steps in detail').matchAll(/^### (\d)\. (.+)$/gm)].map((match) => ({ n: Number(match[1]), label: match[2] }));
    expect(steps).toEqual(TIMELINE_STEPS.map(({ n, label }) => ({ n, label })));
    expect(body).not.toMatch(/<ol\b/);
    expect(body).not.toMatch(/^\s*\d+\.\s/m);
  });

  it('places the timeline marker once, after "The big idea" and before the steps in detail', () => {
    expect(body.match(/^<!-- l2c:timeline -->$/gm)).toHaveLength(1);
    const marker = body.indexOf('<!-- l2c:timeline -->');
    expect(marker).toBeGreaterThan(body.indexOf('## The big idea'));
    expect(marker).toBeLessThan(body.indexOf('## The six steps in detail'));
  });

  it('puts the plain-language name before the technical term', () => {
    const lower = body.toLowerCase();
    expect(lower.indexOf('local-only access')).toBeGreaterThan(-1);
    expect(lower.indexOf('local-only access')).toBeLessThan(lower.indexOf('loopback'));
    expect(lower.indexOf('program the scheduler launches and tracks inside your allocation')).toBeLessThan(lower.indexOf('job step'));
    expect(lower.indexOf('temporary job storage')).toBeLessThan(lower.indexOf('job-scoped scratch'));
    expect(lower.indexOf('a fixed share of one machine')).toBeLessThan(lower.indexOf('[allocation]'));
  });

  it('states the gate versus verification distinction in the frozen vocabulary', () => {
    const gate = section(body, 'The gate is not the verifier');
    expect(gate).toMatch(/can the coordinator serve/i);
    expect(gate).toMatch(/are the results right/i);
    expect(gate).toMatch(/keep it/i);
    expect(gate).toMatch(/replace the example check with your own/i);
  });

  it('defines the evidence labels without a system, version or date, and links what was tested', () => {
    const vocabulary = section(body, 'Did this really run?');
    for (const label of ['Tested', 'Shim-tested', DESIGNED_NOT_RUN]) expect(vocabulary, label).toContain(`**${label}**`);
    expect(body).not.toMatch(SYSTEM_OR_DATE);
    expect(vocabulary).toContain('/adoption/evaluate/#not-tested');
  });

  it('answers who it is for, what to know and what access is needed, and where to start', () => {
    const audience = section(body, 'Who this guide is for');
    for (const heading of ['What you should already know', 'What you need access to', 'How to progress']) expect(audience, heading).toContain(`### ${heading}`);
    expect(audience).toMatch(/submitted at least one batch job/);
    expect(audience).toMatch(/To read: nothing/);
    expect(audience).toContain('/start/');
  });

  it('ends with a plain link list to the destinations, not the door cards', () => {
    const next = section(body, 'Next step');
    const links = next.split('\n').filter((line) => line.startsWith('- ') && line.includes(']('));
    expect(links.length).toBeGreaterThanOrEqual(3);
    expect(next).toContain('(/guide/compose-to-hpc-translation/)');
    expect(next).toContain('(/adoption/evaluate/)');
    expect(body).not.toMatch(/class="doors?"|door__/);
  });

  it('uses each concept class once in the four-ideas table', () => {
    const table = section(body, 'Four ideas that change meaning');
    for (const concept of ['c-step', 'c-gate', 'c-scratch', 'c-net']) expect(table.match(new RegExp(`class="${concept}"`, 'g')), concept).toHaveLength(1);
  });

  it('links only to pages and fragments that exist and keeps retired wording out', () => {
    expect(linkProblems(body)).toEqual([]);
    expect(body).not.toMatch(/reservation|\bElsa\b|container union/i);
  });

  it('does not attribute the audience section to named program staff in its metadata', () => {
    const serialized = JSON.stringify(data);
    expect(serialized).not.toMatch(/Elsa|requested|asked for/i);
    expect(serialized).toContain('program review');
    expect(data.related).toEqual(expect.arrayContaining(['module-1-scheduler-orchestrator', 'start-guide', 'module-3-compose-to-hpc-translation', 'adoption-evaluate']));
  });

  it('stays within the tour word budget', () => {
    const count = words(body);
    expect(count).toBeGreaterThan(600);
    expect(count).toBeLessThanOrEqual(1200);
  });
});
