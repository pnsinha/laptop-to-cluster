import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
describe('Evaluate and adopt page', () => {
  const html = page('adoption/evaluate');
  const records = readdirSync(resolve(root, 'site/src/content/applicability')).filter((file) => /\.ya?ml$/.test(file))
    .map((file) => parse(readFileSync(resolve(root, 'site/src/content/applicability', file), 'utf8')) as { id: string; validation_date: string; superseded_by?: string; environment: { public_name: string } });
  const current = records.filter(({ superseded_by }) => !superseded_by).sort((a, b) => b.validation_date.localeCompare(a.validation_date))[0];
  const summary = html.match(/<section class="record-summary"[\s\S]*?<\/section>/)?.[0] ?? '';

  it('builds with the adoption profile, the header line and no module goals, badge or timeline', () => {
    expect(html).toContain('data-composition-profile="adoption"');
    expect(html).toContain('<p class="content-header__line">Adoption guide</p>');
    expect(html).not.toContain('id="module-overview-heading"');
    expect(html).not.toContain('class="applicability-projection');
    expect(html).not.toContain('<figure class="timeline"');
  });

  it('has the two contract fragment ids exactly once', () => {
    for (const id of ['not-tested', 'when-not']) expect(html.match(new RegExp(`id="${id}"`, 'g')), id).toHaveLength(1);
  });

  it('renders one record summary for the current record between the Tested heading and the Shim-tested list', () => {
    expect(html.match(/<section class="record-summary"/g)).toHaveLength(1);
    expect(summary).toContain(`data-source-id="${current.id}"`);
    expect(summary).toContain(`href="/applicability/${current.id}/"`);
    expect(at(html, 'id="not-tested"')).toBeLessThan(at(html, '<section class="record-summary"'));
    expect(at(html, '<section class="record-summary"')).toBeLessThan(at(html, 'Shim-tested (off-cluster only)'));
    expect(summary).not.toContain('l2c:');
  });

  it('names the tested system only inside the record summary', () => {
    expect(summary).toContain(current.environment.public_name);
    expect(textOf(html.replace(summary, ''))).not.toContain(current.environment.public_name);
  });

  it('sits last on the learning path, with Sources after the article', () => {
    expect(html).toContain('<a rel="prev" href="/guide/compose-to-hpc-translation/">');
    expect(html).not.toContain('rel="next"');
    expect(at(html, 'class="sources-scope"')).toBeGreaterThan(html.lastIndexOf('</article>'));
  });

  it('is the only page that renders a record summary', () => {
    const files = readdirSync(dist, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name === 'index.html')
      .map((entry) => resolve(entry.parentPath, entry.name));
    const withSummary = files.filter((file) => readFileSync(file, 'utf8').includes('class="record-summary"'));
    expect(withSummary).toEqual([resolve(dist, 'adoption/evaluate/index.html')]);
  });
});

describe('The five-minute tour', () => {
  const html = page('guide/tour');

  it('builds at the tour route with the conceptual shell and the header line', () => {
    expect(html).toContain('data-composition-profile="learning-conceptual"');
    /* R10: conceptual modules read "Reading", not "Concepts". */
    expect(html).toContain('<p class="content-header__line">Module 0 · Reading · about 5 min</p>');
    expect(html).toContain('>In this module</h2>');
    expect(html).not.toContain('Workflow package');
    expect(html).not.toContain('l2c:');
  });

  it('shows one unlit timeline between "The big idea" and the steps in detail', () => {
    expect(html.match(/<figure class="timeline"/g)).toHaveLength(1);
    expect(html.match(/<ol class="timeline__steps">/g)).toHaveLength(1);
    expect(html).not.toContain('aria-current="step"');
    expect(at(html, 'id="the-big-idea"')).toBeLessThan(at(html, '<figure class="timeline"'));
    expect(at(html, '<figure class="timeline"')).toBeLessThan(at(html, 'id="the-six-steps-in-detail"'));
  });

  it('has the six steps as headed sections, not a second ordered list', () => {
    expect(html.match(/<h3 id="[1-6]-/g)).toHaveLength(6);
    /* The breadcrumbs chrome is also an <ol>; the content itself holds only the timeline's. */
    expect(html.match(/<article[\s\S]*?<\/article>/)![0].match(/<ol\b/g)).toHaveLength(1);
  });

  it('closes with a plain link list, not the door cards', () => {
    expect(html).not.toMatch(/class="doors?"|class="door__/);
    expect(html).toMatch(/href="\/guide\/compose-to-hpc-translation\/"/);
    expect(html).toMatch(/href="\/adoption\/evaluate\/"/);
  });

  it('is first on the learning path, and the old Module 0 route is gone', () => {
    expect(html).not.toContain('rel="prev"');
    expect(html).toContain('<a rel="next" href="/guide/scheduler-as-orchestrator/">');
    expect(existsSync(resolve(dist, 'guide/how-to-use-this-guide'))).toBe(false);
  });

  it('keeps Sources after the article', () => {
    expect(at(html, 'class="sources-scope"')).toBeGreaterThan(html.lastIndexOf('</article>'));
  });
});

describe('links from the four new pages', () => {
  const pages = ['guide/tour', 'guide/compose-to-hpc-translation', 'adoption/evaluate', 'about/talks-and-papers'];
  const hrefs = (html: string) => [...html.matchAll(/href="(\/[^"#]*)(#[^"]*)?"/g)].map((match) => ({ path: match[1], fragment: match[2]?.slice(1) }));

  it('point only at routes that exist in the built site', () => {
    for (const route of pages) {
      for (const { path } of hrefs(page(route))) {
        if (/\.[a-z0-9]+$/i.test(path)) continue; // files such as the poster PDF are checked by the release gates
        expect(existsSync(resolve(dist, path.slice(1), 'index.html')) || path === '/', `${route} -> ${path}`).toBe(true);
      }
    }
  });

  it('resolve every fragment that targets a page this workstream owns', () => {
    const owned = ['/adoption/evaluate/', '/guide/tour/', '/guide/compose-to-hpc-translation/', '/about/talks-and-papers/'];
    for (const route of pages) {
      for (const { path, fragment } of hrefs(page(route))) {
        if (!fragment || !owned.includes(path)) continue;
        expect(page(path.slice(1, -1)), `${route} -> ${path}#${fragment}`).toContain(`id="${fragment}"`);
      }
    }
  });
});
