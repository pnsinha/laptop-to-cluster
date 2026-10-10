import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import ContentHeader from '../../site/src/components/ContentHeader.astro';
import ModulePager from '../../site/src/components/ModulePager.astro';
import SectionNav from '../../site/src/components/SectionNav.astro';
import SourcesAndScope from '../../site/src/components/SourcesAndScope.astro';
import { TALKS_LABEL } from '../../site/src/content/contracts';
import { ABOUT_NAV_ITEMS } from '../../site/src/content/page-chrome';

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const render = (component: Parameters<AstroContainer['renderToString']>[0], props = {}) => container.renderToString(component, { props });

const moduleItem = { artifact_type: 'learning-module', title: 'Baseline', summary: 'Run it.', status: 'published', module_number: 2, module_type: 'runnable', estimated_minutes: 30 };

describe('ContentHeader header line', () => {
  it('puts the module line before the h1, inside the header', async () => {
    const html = await render(ContentHeader, { item: moduleItem });
    expect(html).toContain('<p class="content-header__line">Module 2 · Hands-on · about 30 min</p>');
    expect(html.indexOf('content-header__line')).toBeLessThan(html.indexOf('<h1>'));
    expect(html.indexOf('<h1>')).toBeLessThan(html.indexOf('</header>'));
  });
  it('renders no line for non-module pages or partial module records', async () => {
    expect(await render(ContentHeader, { item: { artifact_type: 'attribution', title: 'About', summary: 'S.', status: 'published' } })).not.toContain('content-header__line');
    expect(await render(ContentHeader, { item: { artifact_type: 'learning-module', title: 'Fixture', summary: 'S.', status: 'published' } })).not.toContain('content-header__line');
  });
});

describe('ModulePager along the learning path', () => {
  const navigation = {
    previous: { id: 'start-guide', title: 'Run the example', url: '/start/' },
    next: { id: 'module-3-compose-to-hpc-translation', title: 'Translate a Compose file', url: '/guide/compose-to-hpc-translation/' },
  };
  it('keeps the landmark and rel links but uses plain Previous and Next labels without arrows', async () => {
    const html = await render(ModulePager, { navigation });
    expect(html).toContain('<nav class="module-pager" aria-label="Learning module navigation">');
    expect(html).toContain('<a rel="prev" href="/start/">');
    expect(html).toContain('<a rel="next" href="/guide/compose-to-hpc-translation/">');
    expect(html).toContain('<span class="module-pager__direction">Previous</span>');
    expect(html).toContain('<span class="module-pager__direction">Next</span>');
    expect(html).not.toMatch(/[←→]/);
  });
  it('renders nothing when the page has no neighbours', async () => {
    expect((await render(ModulePager, { navigation: {} })).trim()).toBe('');
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

describe('SectionNav with the About items', () => {
  it('marks the talks page current on its own page', async () => {
    const html = await render(SectionNav, { items: ABOUT_NAV_ITEMS, currentPath: '/about/talks-and-papers/', label: 'About sections' });
    expect(html).toContain('aria-label="About sections"');
    const escaped = TALKS_LABEL.replaceAll('&', '&amp;');
    expect(html).toMatch(new RegExp(`href="/about/talks-and-papers/"[^>]*aria-current="page"[^>]*>${escaped}<`));
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });
});

describe('ContentHeader title compounds', () => {
  const h1 = async (title: string) => {
    const html = await render(ContentHeader, { item: { artifact_type: 'attribution', title, summary: 'S.', status: 'published' } });
    return /<h1>([\s\S]*?)<\/h1>/.exec(html)![1];
  };
  /* What a reader sees: tags removed, entities decoded. */
  const visible = (markup: string) => markup.replace(/<[^>]+>/g, '').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');

  it('wraps each hyphenated word in a compound span and leaves the rest of the title as it was', async () => {
    expect(await h1('About the Laptop-to-Cluster Guide')).toBe('About the <span class="h-compound">Laptop-to-Cluster</span> Guide');
    expect(await h1('Baseline Pattern: Single-Node Service + Workers')).toBe('Baseline Pattern: <span class="h-compound">Single-Node</span> Service + Workers');
    expect(await h1('The five-minute tour')).toBe('The <span class="h-compound">five-minute</span> tour');
  });

  it('wraps a compound at the start or the end of the title, and keeps one span for several hyphens', async () => {
    expect(await h1('Pre-flight checks')).toBe('<span class="h-compound">Pre-flight</span> checks');
    expect(await h1('Run it end-to-end')).toBe('Run it <span class="h-compound">end-to-end</span>');
  });

  it('keeps a combining mark with its letter, so a decomposed title wraps whole', async () => {
    const decomposed = 'U\u0308ber-Cluster';
    expect(decomposed).not.toBe('\u00dcber-Cluster');
    expect(await h1(decomposed)).toBe(`<span class="h-compound">${decomposed}</span>`);
    expect(await h1(`The ${decomposed} guide`)).toBe(`The <span class="h-compound">${decomposed}</span> guide`);
    expect(visible(await h1(decomposed))).toBe(decomposed);
  });

  it('wraps letters and digits in any script, and nothing else', async () => {
    expect(await h1('Über-Cluster 2-up')).toBe('<span class="h-compound">Über-Cluster</span> <span class="h-compound">2-up</span>');
    expect(await h1('Plain title')).toBe('Plain title');
    expect(await h1('Spaced - hyphen, -leading and trailing- ones')).toBe('Spaced - hyphen, -leading and trailing- ones');
    expect(await h1('Dash—not a hyphen')).toBe('Dash—not a hyphen');
  });

  it('escapes every character it does not wrap, and the characters inside a span are word characters only', async () => {
    const hostile = 'Tom & Jerry <script>alert("x")</script> a-b "quoted" it\'s';
    const markup = await h1(hostile);
    expect(markup).not.toContain('<script');
    expect(markup).toContain('Tom &amp; Jerry &lt;script&gt;alert(');
    expect(markup).toContain('<span class="h-compound">a-b</span>');
    expect(visible(markup)).toBe(hostile);
    for (const [, inner] of markup.matchAll(/<span class="h-compound">([^<]*)<\/span>/g)) expect(inner).toMatch(/^[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)+$/u);
  });

  it('leaves the visible title unchanged', async () => {
    for (const title of ['About the Laptop-to-Cluster Guide', 'Talks & papers', 'Support, issue reporting, and recovery', 'A "quoted" end-to-end title']) {
      expect(visible(await h1(title)), title).toBe(title);
    }
  });
});
