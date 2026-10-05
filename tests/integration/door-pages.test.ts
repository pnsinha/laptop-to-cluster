import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { TALKS_LABEL } from '../../site/src/content/contracts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = resolve(root, 'site/dist');
const page = (route: string) => readFileSync(resolve(dist, route, 'index.html'), 'utf8');
const escaped = (text: string) => text.replace(/&/g, '&amp;');
const textOf = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
const at = (html: string, needle: string, from = 0): number => {
  const index = html.indexOf(needle, from);
  expect(index, needle).toBeGreaterThanOrEqual(0);
  return index;
};
const talks = parse(readFileSync(resolve(root, 'site/src/content/talks.yml'), 'utf8')) as Array<{ id: string; kind: string; title: string; event_date: string; featured?: boolean; links: Array<{ label: string; href: string }> }>;

describe('Talks and papers page', () => {
  const html = page('about/talks-and-papers');

  it('is an About page with the section nav on its own entry', () => {
    expect(html).toContain('data-composition-profile="about"');
    expect(html).toMatch(new RegExp(`href="/about/talks-and-papers/"[^>]*aria-current="page"[^>]*>${escaped(TALKS_LABEL)}<`));
    expect(html).toMatch(new RegExp(`<h1[^>]*>\\s*${escaped(TALKS_LABEL)}\\s*</h1>`));
  });

  it('lists every talks.yml entry, newest first, with each of its links', () => {
    const newestFirst = [...talks].sort((a, b) => b.event_date.localeCompare(a.event_date) || a.id.localeCompare(b.id));
    let cursor = 0;
    for (const talk of newestFirst) {
      cursor = at(html, `<li class="talk" id="${talk.id}">`, cursor);
      for (const link of talk.links) expect(html, `${talk.id}:${link.label}`).toContain(`href="${link.href}"`);
    }
  });

  it('shows the exact SC26 poster title, not the placeholder', () => {
    const sc26 = talks.find(({ id }) => id === 'sc26-research-poster')!;
    expect(sc26.title).not.toBe('SC26 Research Poster');
    expect(sc26.title.length).toBeGreaterThan(30);
    expect(textOf(html)).toContain(sc26.title);
  });

  it('features exactly one entry for the event band', () => {
    expect(talks.filter(({ featured }) => featured)).toHaveLength(1);
  });

  it('hosts no slides or posters: links only, no PDF, no embedded document', () => {
    expect(html).not.toMatch(/href="[^"]*\.pdf"|<iframe|<embed|<object/i);
  });
});
describe('Translate page', () => {
  const html = page('guide/compose-to-hpc-translation');

  it('is built as a conceptual module with the shared shell and no badge or timeline', () => {
    expect(html).toContain('data-composition-profile="learning-conceptual"');
    expect(html).toContain('<p class="content-header__line">Module 3 · Reading · about 25 min</p>');
    expect(html).toContain('>In this module</h2>');
    expect(html).not.toContain('class="applicability-projection');
    expect(html).not.toContain('<figure class="timeline"');
    expect(html).not.toContain('Workflow package');
    expect(html).not.toContain('Example pending');
  });

  it('renders the worksheet, the construct map and the file list as tables', () => {
    expect(html.match(/<table/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('href="/adoption/evaluate/#not-tested"');
    expect(html).toContain('Designed, not run');
  });

  it('sits after Module 2 on the learning path and closes with Sources after the article', () => {
    expect(html).toContain('<a rel="prev" href="/guide/baseline-single-node-pattern/">');
    expect(at(html, 'class="sources-scope"')).toBeGreaterThan(html.lastIndexOf('</article>'));
  });
});