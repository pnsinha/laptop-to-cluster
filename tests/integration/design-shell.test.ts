import { createHash } from 'node:crypto';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import Acknowledgment from '../../site/src/components/Acknowledgment.astro';
import Breadcrumbs from '../../site/src/components/Breadcrumbs.astro';
import SiteHeader from '../../site/src/components/SiteHeader.astro';
import BaseLayout from '../../site/src/layouts/BaseLayout.astro';
import { ACKNOWLEDGMENT_SHA256, ACKNOWLEDGMENT_TEXT } from '../../site/src/content/acknowledgment';
import { NAV_ITEMS } from '../../site/src/content/contracts';
import { currentReleaseVersion } from '../../site/src/content/release';

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const render = (component: Parameters<AstroContainer['renderToString']>[0], props = {}) => container.renderToString(component, { props });
const page = () => container.renderToString(BaseLayout, { props: { title: 'Test', description: 'Test page', profile: 'landing' }, slots: { default: '<p>Body</p>' } });
const sha = (text: string) => createHash('sha256').update(text.replace(/\s+/g, ' ').trim()).digest('hex');

describe('Acknowledgment', () => {
  it('renders the footer variant from the single constant', async () => {
    const html = await render(Acknowledgment, { variant: 'footer' });
    expect(html.trim()).toBe(`<p class="acknowledgment">${ACKNOWLEDGMENT_TEXT}</p>`);
    expect(sha(html.match(/<p class="acknowledgment">([^<]+)<\/p>/)![1])).toBe(ACKNOWLEDGMENT_SHA256);
  });

  it('renders the event variant with its heading, from the same constant', async () => {
    const html = await render(Acknowledgment, { variant: 'event' });
    expect(html.trim()).toBe(`<section class="event-acknowledgment" aria-labelledby="ack-title"><h2 id="ack-title">Acknowledgment for this work</h2><p>${ACKNOWLEDGMENT_TEXT}</p></section>`);
  });
});

describe('SiteHeader', () => {
  it('builds both navigations from NAV_ITEMS in order, with the external link marked in text', async () => {
    const html = await render(SiteHeader, { currentPath: '/' });
    const wide = html.slice(html.indexOf('<ul class="site-nav site-nav--wide">'), html.indexOf('</ul>', html.indexOf('<ul class="site-nav site-nav--wide">')));
    const hrefs = [...wide.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs).toEqual(NAV_ITEMS.map((item) => item.href));
    const labels = [...wide.matchAll(/class="site-nav__link[^"]*"[^>]*>([^<]+)/g)].map((match) => match[1]);
    expect(labels).toEqual(['Get started', 'Guide', 'Troubleshooting', 'About', 'GitHub']);
    expect(wide).toContain('GitHub<span class="external-label"> (external)</span>');
    expect(wide).toContain('rel="external"');
  });

  it('keeps the native narrow-screen menu and puts the theme control in the header once', async () => {
    const html = await render(SiteHeader, { currentPath: '/' });
    expect(html).toContain('<details class="site-nav--compact">');
    expect(html).toContain('<summary>Navigation</summary>');
    expect(html.match(/ data-theme-control[ >]/g)).toHaveLength(1);
    expect(html).toContain('<span class="site-identity__line1">laptop-to-cluster</span>');
    expect(html).toContain('<span class="site-identity__line2">multi-service stacks under the scheduler</span>');
    expect(html).not.toMatch(/\son[a-z]+=/i);
  });

  it('marks the current page in both navigations', async () => {
    const html = await render(SiteHeader, { currentPath: '/guide/tour/' });
    expect(html.match(/href="\/guide\/tour\/" aria-current="page"/g)).toHaveLength(2);
    expect(html.match(/aria-current="page"/g)).toHaveLength(2);
  });
});

describe('Breadcrumbs', () => {
  it('labels the /resources/ parent "Guide" for guide and milestone pages', async () => {
    for (const currentPath of ['/guide/scheduler-as-orchestrator/', '/milestones/1/']) {
      const html = await render(Breadcrumbs, { currentPath, currentTitle: 'Current' });
      expect(html, currentPath).toContain('<li><a href="/resources/">Guide</a></li>');
      expect(html, currentPath).not.toContain('>Resources<');
    }
  });
});

describe('BaseLayout shell', () => {
  it('preloads exactly two fonts: the serif roman and Plex Sans Regular', async () => {
    const html = await page();
    const preloads = html.match(/<link rel="preload"[^>]*>/g) ?? [];
    expect(preloads).toEqual([
      '<link rel="preload" href="/fonts/source-serif-4-5.3.0/source-serif-4-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>',
      '<link rel="preload" href="/fonts/ibm-plex-sans-1.1.0/IBMPlexSans-Regular-Latin1.woff2" as="font" type="font/woff2" crossorigin>',
    ]);
  });

  it('sets theme-color to the light and dark canvas and runs the boot script in the head', async () => {
    const html = await page();
    expect(html).toContain('<meta name="theme-color" media="(prefers-color-scheme: light)" content="#fbf9f4">');
    expect(html).toContain('<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#131a29">');
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head.indexOf('theme-color')).toBeLessThan(head.indexOf("localStorage.getItem('l2c-theme')"));
  });

  it('renders the footer per contract: records nav, release status, then the verbatim acknowledgment', async () => {
    const html = await page();
    const footer = html.slice(html.indexOf('<footer class="site-footer">'));
    expect(footer).toContain('<nav aria-label="Site records"><ul class="footer-links">');
    const links = [...footer.matchAll(/<li><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/li>/g)].map((match) => [match[2], match[1]]);
    expect(links).toEqual([
      ['Attribution', '/about/attribution/'], ['Talks &amp; papers', '/about/talks-and-papers/'], ['Accessibility', '/about/accessibility/'],
      ['Support', '/about/support/'], ['Licenses', '/about/attribution/#licenses'], ['GitHub (external)', 'https://github.com/pnsinha/laptop-to-cluster'],
    ]);
    expect(footer).toContain(`<p class="release" aria-label="Release status">Release status: ${currentReleaseVersion()}</p>`);
    expect(footer.indexOf('class="release"')).toBeLessThan(footer.indexOf('class="acknowledgment"'));
    expect(sha(footer.match(/<p class="acknowledgment">([^<]+)<\/p>/)![1])).toBe(ACKNOWLEDGMENT_SHA256);
    expect(footer).not.toContain('Scientific Computing Research');
  });

  it('shows the build-time release, not the old constant', async () => {
    const footer = (await page()).slice((await page()).indexOf('<footer'));
    if (currentReleaseVersion() !== 'v0.1.0') expect(footer).not.toContain('v0.1.0');
  });

  it('keeps the shell landmarks and requests nothing remote', async () => {
    const html = await page();
    for (const marker of ['<a class="skip" href="#main">', '<header class="site-header">', '<main id="main" tabindex="-1">', '<footer class="site-footer">']) expect(html).toContain(marker);
    expect(html).not.toMatch(/fonts\.(?:googleapis|gstatic)|use\.typekit|<link[^>]+rel="preconnect"/);
  });
});
