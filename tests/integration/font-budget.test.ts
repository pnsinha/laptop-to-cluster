import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * W1's proof of the design.md §8.2 budgets, measured on the built site/dist.
 * W3 implements the BUDGET rule in scripts/publication.mjs separately. This file is the workstream-local check:
 * it counts every font face the CSS references (W3 counts only faces whose unicode-range occurs in the page).
 */
const BUDGET = { fontBytes: 140_000, fontPreloads: 2, scriptBytes: 2048 } as const;
const SAME_ORIGIN = 'https://laptop-to-cluster.org';
const THIRD_PARTY_FONT_HOSTS = /fonts\.(?:googleapis|gstatic)\.com|use\.typekit\.net|fonts\.bunny\.net|cdn\.jsdelivr\.net\/fontsource|use\.fontawesome\.com|fonts\.adobe\.com/i;
const FONT_FILE = /\.(?:woff2?|ttf|otf|eot)(?:[?#].*)?$/i;
const JS_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript']);
const LINK_RELS = new Set(['stylesheet', 'preload', 'modulepreload', 'prefetch', 'preconnect', 'dns-prefetch', 'icon', 'manifest']);
const ELEMENT_URLS: Array<[string, string]> = [['script', 'src'], ['img', 'src'], ['iframe', 'src'], ['source', 'src'], ['video', 'src'], ['audio', 'src'], ['embed', 'src'], ['track', 'src']];

type Asset = (pathname: string) => Buffer;

const attrOf = (element: string, name: string): string | undefined => {
  const match = element.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
};
const elements = (html: string, name: string) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((match) => match[0]);
const relsOf = (link: string) => (attrOf(link, 'rel') ?? '').toLowerCase().split(/\s+/);
const isRemote = (url: string) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url) && url !== SAME_ORIGIN && !url.startsWith(`${SAME_ORIGIN}/`);
const pathOf = (url: string, route: string) => new URL(url, `${SAME_ORIGIN}${route}`).pathname;

const cssUrls = (css: string[]) => css.flatMap((text) => [...text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)].map((match) => (match[1] ?? match[2] ?? match[3] ?? '').trim()));
const cssImports = (css: string[]) => css.flatMap((text) => [...text.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi)].map((match) => match[1] ?? ''));
const fontUrlsIn = (css: string[]) => [...new Set(cssUrls(css).filter((url) => FONT_FILE.test(url)))];

const fontPreloadsIn = (html: string) =>
  elements(html, 'link')
    .filter((link) => relsOf(link).includes('preload') && (attrOf(link, 'as') ?? '').toLowerCase() === 'font')
    .map((link) => attrOf(link, 'href') ?? '');

const scriptBytesIn = (html: string, route: string, asset: Asset) =>
  [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].reduce((total, match) => {
    const attributes = ` ${match[1] ?? ''}`;
    if (!JS_TYPES.has((attrOf(attributes, 'type') ?? '').toLowerCase())) return total;
    const src = attrOf(attributes, 'src');
    if (src === undefined) return total + Buffer.byteLength(match[2] ?? '');
    return total + (isRemote(src) ? 0 : asset(pathOf(src, route)).length);
  }, 0);

const remoteRequestsIn = (html: string, css: string[]) => {
  const urls: string[] = [];
  for (const [name, attribute] of ELEMENT_URLS) for (const element of elements(html, name)) urls.push(attrOf(element, attribute) ?? '');
  for (const link of elements(html, 'link')) if (relsOf(link).some((rel) => LINK_RELS.has(rel))) urls.push(attrOf(link, 'href') ?? '');
  urls.push(...cssUrls(css), ...cssImports(css));
  return [...new Set(urls)].filter((url) => url !== '' && isRemote(url));
};

const parseHeaders = (text: string) => {
  const rules: Array<{ path: string; headers: Record<string, string> }> = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (/^\s/.test(raw)) {
      if (rules.length === 0) throw new Error('header line before any path');
      const [name = '', ...rest] = line.split(':');
      rules[rules.length - 1]!.headers[name.trim().toLowerCase()] = rest.join(':').trim();
    } else {
      rules.push({ path: line, headers: {} });
    }
  }
  return rules;
};

const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = resolve(root, 'site/dist');
if (!existsSync(dist)) throw new Error('site/dist is missing: run `npm run build` before this test');
const readAsset: Asset = (pathname) => readFileSync(resolve(dist, `.${decodeURIComponent(pathname)}`));

function htmlFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}

const pageCssIn = (html: string, route: string) => [
  ...elements(html, 'link')
    .filter((link) => relsOf(link).includes('stylesheet') && !isRemote(attrOf(link, 'href') ?? ''))
    .map((link) => readAsset(pathOf(attrOf(link, 'href') ?? '', route)).toString('utf8')),
  ...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1] ?? ''),
];

const measured = htmlFiles(dist).map((file) => {
  const route = `/${relative(dist, file).split(sep).join('/').replace(/index\.html$/, '')}`;
  const html = readFileSync(file, 'utf8');
  const css = pageCssIn(html, route);
  return { route, html, css, fonts: fontUrlsIn(css) };
});

describe('built site: font, preload, script and origin budgets (design.md §8.2)', () => {
  it('covers the whole built site, home page included', () => {
    expect(measured.length).toBeGreaterThanOrEqual(10);
    expect(measured.map((page) => page.route)).toContain('/');
  });

  it(`keeps the font files referenced from the emitted CSS within ${BUDGET.fontBytes} bytes on every page`, () => {
    for (const page of measured) {
      expect(page.fonts.length, page.route).toBeGreaterThan(0);
      for (const url of page.fonts) expect(url, page.route).toMatch(/^\/fonts\/[a-z0-9.-]+\/[A-Za-z0-9._-]+\.woff2$/);
      const bytes = page.fonts.reduce((sum, url) => sum + readAsset(url).length, 0);
      expect(bytes, page.route).toBeLessThanOrEqual(BUDGET.fontBytes);
    }
  });

  it(`preloads at most ${BUDGET.fontPreloads} fonts, and only faces the CSS declares`, () => {
    for (const page of measured) {
      const preloads = fontPreloadsIn(page.html);
      expect(preloads.length, page.route).toBeLessThanOrEqual(BUDGET.fontPreloads);
      for (const href of preloads) expect(page.fonts, `${page.route} preloads ${href}`).toContain(href);
    }
  });

  it(`ships at most ${BUDGET.scriptBytes} bytes of JavaScript, inline plus external, on every page`, () => {
    for (const page of measured) expect(scriptBytesIn(page.html, page.route, readAsset), page.route).toBeLessThanOrEqual(BUDGET.scriptBytes);
  });

  it('requests nothing from another origin and names no third-party font host', () => {
    for (const page of measured) {
      expect(remoteRequestsIn(page.html, page.css), page.route).toEqual([]);
      expect(`${page.html}\n${page.css.join('\n')}`, page.route).not.toMatch(THIRD_PARTY_FONT_HOSTS);
    }
  });

  it('serves /fonts/* with a one-year immutable cache', () => {
    const rules = parseHeaders(readFileSync(resolve(dist, '_headers'), 'utf8'));
    expect(rules.find((rule) => rule.path === '/fonts/*')?.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });
});

describe('budget detectors: each one fails on a bad input', () => {
  const unexpected: Asset = (pathname) => {
    throw new Error(`unexpected asset read: ${pathname}`);
  };

  it('finds minified, quoted and remote font URLs, and ignores local() faces and images', () => {
    const css = ['@font-face{src:url(/fonts/a/a.woff2)format("woff2");font-display:swap}@font-face{src:url("/fonts/b/b.woff2") format("woff2")}@font-face{src:local(Georgia)}.x{background:url(/img/x.png)}'];
    expect(fontUrlsIn(css)).toEqual(['/fonts/a/a.woff2', '/fonts/b/b.woff2']);
    expect(fontUrlsIn(['@font-face{src:url(https://fonts.gstatic.com/s/x.woff2)}'])).toEqual(['https://fonts.gstatic.com/s/x.woff2']);
  });

  it('counts a preload only when it is rel=preload and as=font, in any attribute order', () => {
    const html = '<link href="/a.woff2" as="font" rel="preload" crossorigin><link rel="preload" as="style" href="/s.css"><link rel="preload" as="font" href="/b.woff2"><link rel="stylesheet" href="/c.css">';
    expect(fontPreloadsIn(html)).toEqual(['/a.woff2', '/b.woff2']);
  });

  it('adds inline and external scripts, counts module scripts and skips JSON-LD', () => {
    const html = '<script>let a=1</script><script type="module" src="/_astro/m.js"></script><script type="application/ld+json">{"@context":"x"}</script>';
    const asset: Asset = (pathname) => (pathname === '/_astro/m.js' ? Buffer.alloc(100) : unexpected(pathname));
    expect(scriptBytesIn(html, '/', asset)).toBe(Buffer.byteLength('let a=1') + 100);
  });

  it('flags every request to another origin, and allows same-origin absolute URLs and plain links', () => {
    const html = '<link rel="preconnect" href="https://fonts.gstatic.com"><link rel="stylesheet" href="//cdn.example/x.css"><script src="https://cdn.example/x.js"></script><img src="/ok.png"><link rel="icon" href="https://laptop-to-cluster.org/favicon.svg"><a href="https://example.org/">docs</a>';
    const css = ['@import url(https://fonts.googleapis.com/css2?family=Inter);.x{background:url(//cdn.example/y.png)}'];
    expect(remoteRequestsIn(html, css)).toEqual([
      'https://cdn.example/x.js',
      'https://fonts.gstatic.com',
      '//cdn.example/x.css',
      'https://fonts.googleapis.com/css2?family=Inter',
      '//cdn.example/y.png',
    ]);
  });

  it('reads Cloudflare _headers rules and keeps each header under its own path', () => {
    const rules = parseHeaders('# comment\n/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/*\n  X-Test: a: b\n');
    expect(rules).toEqual([
      { path: '/fonts/*', headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
      { path: '/*', headers: { 'x-test': 'a: b' } },
    ]);
    expect(() => parseHeaders('  Cache-Control: x')).toThrow(/before any path/);
  });
});
