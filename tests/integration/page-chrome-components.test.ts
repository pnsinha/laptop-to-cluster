import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import SourcesAndScope from '../../site/src/components/SourcesAndScope.astro';
import { pageHeaderLine, pathPagination, statusNotices } from '../../site/src/content/page-chrome';
import { titleParts } from '../../site/src/content/title';
import type { ContentItem } from '../../site/src/content/schema';

const root = fileURLToPath(new URL('../..', import.meta.url));
let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const render = (component: Parameters<AstroContainer['renderToString']>[0], props = {}) => container.renderToString(component, { props });

const moduleItem = { artifact_type: 'learning-module', title: 'Baseline', summary: 'Run it.', status: 'published', module_number: 2, module_type: 'runnable', estimated_minutes: 30 } as unknown as ContentItem;

describe('page header line', () => {
  it('names the module, its kind and its length', () => {
    expect(pageHeaderLine(moduleItem)).toBe('Module 2 · Hands-on · about 30 min');
  });
  it('renders no line for non-module pages or partial module records', () => {
    expect(pageHeaderLine({ artifact_type: 'attribution', title: 'About', summary: 'S.', status: 'published' } as unknown as ContentItem)).toBeUndefined();
    expect(pageHeaderLine({ artifact_type: 'learning-module', title: 'Fixture', summary: 'S.', status: 'published' } as unknown as ContentItem)).toBeUndefined();
  });
  it('appears above the h1 inside the title panel of a built module page', () => {
    const html = readFileSync(resolve(root, 'site/dist/guide/baseline-single-node-pattern/index.html'), 'utf8');
    const header = html.match(/<header class="content-header">([\s\S]*?)<\/header>/)?.[1] ?? '';
    expect(header.indexOf('<p class="content-header__line">Module 2 · Hands-on · about 30 min</p>')).toBeGreaterThanOrEqual(0);
    expect(header.indexOf('content-header__line')).toBeLessThan(header.indexOf('<h1 id="_top">'));
    expect(header.indexOf('<h1 id="_top">')).toBeLessThan(header.indexOf('<p class="lede">'));
  });
});

describe('status notices under the title', () => {
  const fixture = { artifact_type: 'learning-module', title: 'Fixture', summary: 'S.', status: 'published', validation_status: 'validated' };
  it('renders nothing for a published, validated page', () => {
    expect(statusNotices(fixture as unknown as ContentItem)).toEqual([]);
  });
  it('names draft, superseded and archived pages, and a failed, unvalidated or stale validation', () => {
    expect(statusNotices({ ...fixture, status: 'draft' } as unknown as ContentItem)).toEqual([{ type: 'caution', title: 'Draft', text: 'This page is not yet published guidance.' }]);
    expect(statusNotices({ ...fixture, status: 'superseded' } as unknown as ContentItem)[0].title).toBe('Superseded');
    expect(statusNotices({ ...fixture, status: 'archived' } as unknown as ContentItem)[0]).toMatchObject({ type: 'note', title: 'Archived' });
    for (const validationStatus of ['failed', 'unvalidated', 'stale']) {
      const [notice] = statusNotices({ ...fixture, validation_status: validationStatus } as unknown as ContentItem);
      expect(notice, validationStatus).toMatchObject({ type: 'danger', title: validationStatus[0].toUpperCase() + validationStatus.slice(1) });
      expect(notice.text).toContain('must not be treated as currently validated');
    }
  });
});

describe('pager pinned to the learning path', () => {
  it('turns the path neighbours into Starlight links and ends the path with false', () => {
    expect(pathPagination({ previous: { id: 'start-guide', title: 'Run the example', url: '/start/' }, next: { id: 'm3', title: 'Translate a Compose file', url: '/guide/compose-to-hpc-translation/' } }))
      .toEqual({ prev: { link: '/start/', label: 'Run the example' }, next: { link: '/guide/compose-to-hpc-translation/', label: 'Translate a Compose file' } });
    expect(pathPagination({ next: { id: 'm1', title: 'Scheduler as Orchestrator', url: '/guide/scheduler-as-orchestrator/' } })).toEqual({ prev: false, next: { link: '/guide/scheduler-as-orchestrator/', label: 'Scheduler as Orchestrator' } });
    expect(pathPagination(undefined)).toBeUndefined();
  });
});

describe('SourcesAndScope stays a closed native disclosure', () => {
  it('is a section.sources-scope holding one closed <details>', async () => {
    const html = await render(SourcesAndScope, { references: [{ kind: 'sow', citation: 'Fellowship SOW', scope: 'Publish the module.' }] });
    expect(html).toContain('<section class="sources-scope"');
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain('<summary>Review source roles and citations</summary>');
  });
  it('renders nothing without references', async () => {
    expect((await render(SourcesAndScope, { references: [] })).trim()).toBe('');
  });
});

describe('title compounds', () => {
  /* The title panel renders each compound part as <span class="h-compound"> and escapes every part. */
  const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const h1 = (title: string) => titleParts(title).map((part) => (part.compound ? `<span class="h-compound">${escape(part.text)}</span>` : escape(part.text))).join('');
  const visible = (markup: string) => markup.replace(/<[^>]+>/g, '').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');

  it('wraps each hyphenated word in a compound span and leaves the rest of the title as it was', () => {
    expect(h1('About the Laptop-to-Cluster Guide')).toBe('About the <span class="h-compound">Laptop-to-Cluster</span> Guide');
    expect(h1('Baseline Pattern: Single-Node Service + Workers')).toBe('Baseline Pattern: <span class="h-compound">Single-Node</span> Service + Workers');
    expect(h1('The five-minute tour')).toBe('The <span class="h-compound">five-minute</span> tour');
  });

  it('wraps a compound at the start or the end of the title, and keeps one span for several hyphens', () => {
    expect(h1('Pre-flight checks')).toBe('<span class="h-compound">Pre-flight</span> checks');
    expect(h1('Run it end-to-end')).toBe('Run it <span class="h-compound">end-to-end</span>');
  });

  it('keeps a combining mark with its letter, so a decomposed title wraps whole', () => {
    const decomposed = 'Über-Cluster';
    expect(decomposed).not.toBe('Über-Cluster');
    expect(h1(decomposed)).toBe(`<span class="h-compound">${decomposed}</span>`);
    expect(visible(h1(decomposed))).toBe(decomposed);
  });

  it('wraps letters and digits in any script, and nothing else', () => {
    expect(h1('Über-Cluster 2-up')).toBe('<span class="h-compound">Über-Cluster</span> <span class="h-compound">2-up</span>');
    expect(h1('Plain title')).toBe('Plain title');
    expect(h1('Spaced - hyphen, -leading and trailing- ones')).toBe('Spaced - hyphen, -leading and trailing- ones');
    expect(h1('Dash—not a hyphen')).toBe('Dash—not a hyphen');
  });

  it('keeps word characters only inside a span and leaves the visible title unchanged', () => {
    const hostile = 'Tom & Jerry <script>alert("x")</script> a-b "quoted" it\'s';
    const markup = h1(hostile);
    expect(markup).not.toContain('<script');
    expect(markup).toContain('<span class="h-compound">a-b</span>');
    expect(visible(markup)).toBe(hostile);
    for (const [, inner] of markup.matchAll(/<span class="h-compound">([^<]*)<\/span>/g)) expect(inner).toMatch(/^[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)+$/u);
    for (const title of ['About the Laptop-to-Cluster Guide', 'Talks & papers', 'Support, issue reporting, and recovery']) expect(visible(h1(title)), title).toBe(title);
  });

  it('renders the compound span on the built pages', () => {
    const about = readFileSync(resolve(root, 'site/dist/about/project/index.html'), 'utf8');
    expect(about).toContain('<h1 id="_top">About the <span class="h-compound">Laptop-to-Cluster</span> Guide</h1>');
  });
});
