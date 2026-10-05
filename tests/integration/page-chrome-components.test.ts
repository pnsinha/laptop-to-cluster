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
