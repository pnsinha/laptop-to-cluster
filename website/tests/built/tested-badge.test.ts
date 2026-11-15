import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { pages, text } from './dist';

/* Check 2, evidence: every Tested badge and record summary says exactly what its test record says.
   The expected strings are built here from the YAML, independently of the component. */
const directory = fileURLToPath(new URL('../../src/content/applicability', import.meta.url));
const records = new Map(readdirSync(directory).filter((name) => name.endsWith('.yml')).map((name) => {
  const record = parse(readFileSync(`${directory}/${name}`, 'utf8'));
  return [record.id, record];
}));
const month = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const named = (name: string, version: string) => (version.toLowerCase().startsWith(name.toLowerCase()) ? version : `${name} ${version}`);
const items = (block: string, label: string) => [...(new RegExp(`<dt>${label}</dt><dd><ul>([\\s\\S]*?)</ul></dd>`).exec(block)?.[1] ?? '').matchAll(/<li>([\s\S]*?)<\/li>/g)].map((match) => text(match[1]));

const badges = pages.flatMap(({ path, html }) => [...html.matchAll(/<section class="applicability-projection[^"]*"[^>]*data-source-id="([^"]+)"[\s\S]*?<\/section>/g)].map((match) => ({ path, id: match[1], block: match[0] })));
const summaries = pages.flatMap(({ path, html }) => [...html.matchAll(/<section class="record-summary" data-source-id="([^"]+)"[\s\S]*?<\/section>/g)].map((match) => ({ path, id: match[1], block: match[0] })));

describe('Tested badges', () => {
  it('appear on the home page, Module 2 and both milestone pages', () => {
    expect(badges.map(({ path }) => path).sort()).toEqual(['/', '/guide/baseline-single-node-pattern/', '/milestones/1/', '/milestones/2/']);
  });

  for (const { path, id, block } of badges) {
    it(`on ${path} match record ${id}`, () => {
      const record = records.get(id);
      expect(record, `no record ${id}`).toBeDefined();
      expect(record.status).toBe('validated');
      expect(text(/<p class="evidence-badge">([\s\S]*?)<\/p>/.exec(block)![1])).toBe('Tested');
      expect(text(/<p class="evidence-link">([\s\S]*?)<\/p>/.exec(block)![1])).toBe(`${record.environment.public_name} · ${month(record.validation_date)} · Test record`);
      expect(block).toContain(`href="/applicability/${id}/"`);
      const plain = record.plain_language;
      expect(items(block, 'Tested')).toEqual(plain ? [plain.tested.text] : record.result.checks);
      expect(items(block, 'You need')).toEqual(plain ? plain.you_need.map(({ text: value }: { text: string }) => value) : record.assumptions);
      expect(items(block, 'Depends on your center')).toEqual(plain ? plain.depends_on_center.map(({ text: value }: { text: string }) => value) : record.portability_boundaries);
    });
  }

  it('are the only tested claim on the home page: the hero makes none and offers one action', () => {
    const home = pages.find(({ path }) => path === '/')!.html;
    const hero = /<div class="hero">([\s\S]*?)<\/div>\s*<div class="hero-html/.exec(home)?.[1] ?? '';
    expect(hero, 'the hero markup').toContain('data-page-title');
    expect([...hero.matchAll(/class="sl-link-button\b/g)]).toHaveLength(1);
    expect(hero).toContain('href="/guide/tour/"');
    expect(text(hero)).not.toMatch(/real cluster|been run on|has been tested/i);
  });

  it('summarise the record on the evaluation guide', () => {
    expect(summaries.map(({ path }) => path)).toEqual(['/adoption/evaluate/']);
    const [{ id, block }] = summaries;
    const record = records.get(id);
    expect(text(/<p class="record-summary__tested">([\s\S]*?)<\/p>/.exec(block)![1])).toBe(`Tested on ${record.environment.public_name} · ${month(record.validation_date)}`);
    const scope = [...block.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((match) => text(match[1]));
    expect(scope).toEqual([
      `Scheduler: ${named(record.scheduler.family, record.scheduler.version)}`,
      `Runtime: ${named(record.runtime.name, record.runtime.version)}`,
      `Workflow revision: ${record.workflow_revision}`,
      record.plain_language ? record.plain_language.tested.text : record.result.checks[0],
      ...record.limitations,
    ]);
  });
});
