import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ACKNOWLEDGMENT_SHA256 as CONTRACT_HASH, ACKNOWLEDGMENT_TEXT } from '../../site/src/content/acknowledgment';
import { REQUIRED_FRAGMENTS as CONTRACT_FRAGMENTS } from '../../site/src/content/contracts';
import {
  ACKNOWLEDGMENT_SHA256, BUDGETS, REQUIRED_FRAGMENTS, fontFilesForPage,
  validateAcknowledgments, validateBudgets, validateFragmentLinks, validateRequiredFragments,
} from '../../scripts/publication.mjs';

const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
function dist(files: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), 'bssw-gates-'));
  temporary.push(directory);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(directory, path, '..'), { recursive: true });
    writeFileSync(join(directory, path), content);
  }
  return directory;
}
const footer = (text = ACKNOWLEDGMENT_TEXT) => `<footer class="site-footer"><nav aria-label="Site records"><ul class="footer-links"><li><a href="/about/attribution/">Attribution</a></li></ul></nav><p class="release" aria-label="Release status">Release status: v0.2.0</p><p class="acknowledgment">${text}</p></footer>`;
const pageOf = (source: string, body = '<h1>T</h1>', head = '') => ({ source, html: `<html><head>${head}</head><body>${body}${footer()}</body></html>` });

describe('ACK-VERBATIM', () => {
  it('keeps the duplicated hash equal to the single tracked copy', () => {
    expect(ACKNOWLEDGMENT_SHA256).toBe(CONTRACT_HASH);
    expect(createHash('sha256').update(ACKNOWLEDGMENT_TEXT).digest('hex')).toBe(ACKNOWLEDGMENT_SHA256);
    expect(ACKNOWLEDGMENT_TEXT).toHaveLength(605);
  });

  it('accepts the approved footer text, whitespace-normalised, on every page', () => {
    const root = dist({});
    const wrapped = pageOf('/a/').html.replace(ACKNOWLEDGMENT_TEXT, ACKNOWLEDGMENT_TEXT.replace(', a collaborative', ',\n    a   collaborative'));
    expect(validateAcknowledgments(root, [pageOf('/'), { source: '/a/', html: wrapped }])).toEqual([]);
  });

  it('rejects a missing, truncated, edited or duplicated footer acknowledgment, naming the page but not printing text', () => {
    const root = dist({});
    const first = ACKNOWLEDGMENT_TEXT.split('. ')[0] + '.';
    const bad = [
      { source: '/a/', html: '<body><footer class="site-footer"></footer></body>' },
      { source: '/b/', html: pageOf('/b/').html.replace(ACKNOWLEDGMENT_TEXT, first) },
      { source: '/c/', html: pageOf('/c/').html.replace('DE-AC52-07NA27344', 'DE-AC05-00OR22725') },
      { source: '/d/', html: pageOf('/d/').html.replace('</footer>', `<p class="acknowledgment">${ACKNOWLEDGMENT_TEXT}</p></footer>`) },
    ];
    for (const page of bad) {
      const text = validateAcknowledgments(root, [page]).join('\n');
      expect(text).toMatch(new RegExp(`${page.source}:footer \\[ACK-VERBATIM\\]`));
      expect(text).not.toContain('Better Scientific');
    }
  });

  it('checks the event acknowledgment where present', () => {
    const root = dist({});
    const event = (text: string) => `<section class="event-acknowledgment" aria-labelledby="ack-title"><h2 id="ack-title">Acknowledgment for this work</h2><p>${text}</p></section>`;
    expect(validateAcknowledgments(root, [pageOf('/events/iguide-forum-2026/', event(ACKNOWLEDGMENT_TEXT))])).toEqual([]);
    expect(validateAcknowledgments(root, [pageOf('/events/iguide-forum-2026/', event('This work was supported by the Better Scientific Software Fellowship Program.'))]).join('\n')).toMatch(/ACK-VERBATIM.*event/);
  });

  it('fails the retired phrase in any built text file', () => {
    for (const name of ['x.html', 'feed.xml', 'data.json', 'robots.txt']) {
      expect(validateAcknowledgments(dist({ [name]: 'Office of Scientific Computing Research' }), []).join('\n'), name).toMatch(new RegExp(`${name}:text \\[ACK-VERBATIM\\]`));
    }
    expect(validateAcknowledgments(dist({ 'poster.pdf': 'Scientific Computing Research' }), [])).toEqual([]);
  });
});

describe('BUDGET', () => {
  const sheet = (faces: string) => faces;
  const face = (file: string, range = '') => `@font-face{font-family:"IBM Plex Sans";src:url(/fonts/p/${file}) format("woff2");font-display:swap${range ? `;unicode-range:${range}` : ''}}`;
  const link = '<link rel="stylesheet" href="/_astro/site.css">';
  const kb = (n: number) => 'x'.repeat(n * 1024);

  it('picks the fonts a page would download: always-on faces, plus ranged faces whose characters occur', () => {
    const css = face('a.woff2') + face('arrows.woff2', 'U+2190-21FF,U+25B8') + face('marks.woff2', 'U+25A0') + face('wild.woff2', 'U+4??');
    expect(fontFilesForPage(css, 'plain text')).toEqual(['/fonts/p/a.woff2']);
    expect(fontFilesForPage(css, 'go → next')).toEqual(['/fonts/p/a.woff2', '/fonts/p/arrows.woff2']);
    expect(fontFilesForPage(css, '■ А')).toEqual(['/fonts/p/a.woff2', '/fonts/p/marks.woff2', '/fonts/p/wild.woff2']);
  });

  it('passes a page inside every budget and ignores JSON-LD', () => {
    const root = dist({ '_astro/site.css': sheet(face('a.woff2') + face('b.woff2')), 'fonts/p/a.woff2': kb(60), 'fonts/p/b.woff2': kb(70) });
    const html = `<head>${link}<link rel="preload" href="/fonts/p/a.woff2" as="font" type="font/woff2" crossorigin><script type="application/ld+json">${kb(5)}</script></head><body><script>${'a'.repeat(800)}</script></body>`;
    expect(validateBudgets(root, [{ source: '/', html }])).toEqual([]);
    expect(BUDGETS).toEqual({ fontBytes: 140000, fontPreloads: 2, scriptBytes: 2048 });
  });

  it('reports fonts over the limit, a third preload, scripts over 2 KiB, and counts external scripts', () => {
    const root = dist({ '_astro/site.css': face('a.woff2') + face('b.woff2') + face('c.woff2'), 'fonts/p/a.woff2': kb(60), 'fonts/p/b.woff2': kb(60), 'fonts/p/c.woff2': kb(30), '_astro/app.js': 'y'.repeat(1500) });
    const pre = (n: number) => `<link rel="preload" href="/fonts/p/${n}.woff2" as="font" type="font/woff2" crossorigin>`;
    const html = `<head>${link}${pre(1)}${pre(2)}${pre(3)}<script type="module" src="/_astro/app.js"></script></head><body><script>${'a'.repeat(600)}</script></body>`;
    const text = validateBudgets(root, [{ source: '/', html }]).join('\n');
    expect(text).toMatch(/fonts total 153600 bytes; the limit is 140000/);
    expect(text).toMatch(/3 font preloads; the limit is 2/);
    expect(text).toMatch(/client JavaScript totals 2100 bytes; the limit is 2048/);
  });

  it('reports every kind of third-party request but not a plain outbound link', () => {
    const root = dist({ '_astro/site.css': 'a{background:url(https://cdn.example/x.png)}' });
    const requests = [
      '<script src="https://cdn.example/a.js"></script>', '<link rel="preconnect" href="https://fonts.example">', '<link rel="stylesheet" href="//cdn.example/a.css">',
      '<img src="https://img.example/a.png">', '<iframe src="https://video.example/embed"></iframe>', '<img srcset="/a.png 1x, https://img.example/b.png 2x" src="/a.png">',
    ];
    for (const tag of requests) expect(validateBudgets(root, [{ source: '/', html: `<head></head><body>${tag}</body>` }]).join('\n'), tag).toMatch(/third-party request/);
    expect(validateBudgets(root, [{ source: '/', html: `<head>${link}</head><body></body>` }]).join('\n')).toMatch(/stylesheet loads a remote resource/);
    expect(validateBudgets(dist({}), [{ source: '/', html: '<head><link rel="canonical" href="https://laptop-to-cluster.org/"></head><body><a href="https://github.com/pnsinha/laptop-to-cluster">Repo</a><img src="https://laptop-to-cluster.org/a.png"></body>' }])).toEqual([]);
  });
});

describe('FRAGMENT-LINK', () => {
  const pages = [
    { source: '/', html: '<h1 id="top">Home</h1><section id="big-idea"></section><section id="doors"></section><a href="#big-idea">a</a><a href="/guide/tour/#step-2">b</a><a href="https://laptop-to-cluster.org/guide/tour/#step-2">c</a><a href="#">d</a><a href="/feed.xml#x">e</a><a href="#:~:text=hello">f</a>' },
    { source: '/guide/tour/', html: '<h2 id="step-2">Two</h2><a href="/#doors">back</a><a href="../tour/#step-2">self</a><a href="https://example.com/#anything">ext</a>' },
  ];

  it('resolves same-page, cross-page and absolute fragments, and skips bare, directive, external and non-page targets', () => {
    expect(validateFragmentLinks(pages)).toEqual([]);
  });

  it('reports a missing id on the right page', () => {
    const text = validateFragmentLinks([...pages, { source: '/about/', html: '<a href="/guide/tour/#step-9">x</a><a href="#nope">y</a><a href="/#crosswalk">z</a>' }]).join('\n');
    expect(text).toMatch(/\/about\/:\/guide\/tour\/#step-9 \[FRAGMENT-LINK\] the fragment does not exist on \/guide\/tour\//);
    expect(text).toMatch(/\/about\/:#nope \[FRAGMENT-LINK\]/);
    expect(text).toMatch(/\/about\/:\/#crosswalk \[FRAGMENT-LINK\].* \//);
  });

  it('checks the contract fragments against their routes and stays in step with contracts.ts', () => {
    expect(REQUIRED_FRAGMENTS['/']).toEqual([...CONTRACT_FRAGMENTS.home]);
    expect(REQUIRED_FRAGMENTS['/milestones/2/']).toEqual([...CONTRACT_FRAGMENTS.milestone2]);
    expect(REQUIRED_FRAGMENTS['/adoption/evaluate/']).toEqual([...CONTRACT_FRAGMENTS.evaluate]);
    expect(REQUIRED_FRAGMENTS['/about/attribution/']).toEqual([...CONTRACT_FRAGMENTS.attribution]);
    expect(REQUIRED_FRAGMENTS['/about/glossary/']).toEqual([...CONTRACT_FRAGMENTS.glossary]);
    const all = Object.entries(REQUIRED_FRAGMENTS).map(([source, ids]) => ({ source, html: ids.map((id) => `<h2 id="${id}"></h2>`).join('') }));
    expect(validateRequiredFragments(all)).toEqual([]);
    const missing = validateRequiredFragments(all.filter(({ source }) => source !== '/about/glossary/').map((page) => (page.source === '/' ? { ...page, html: page.html.replace('id="doors"', '') } : page))).join('\n');
    expect(missing).toMatch(/\/:#doors \[FRAGMENT-LINK\] required fragment id is missing/);
    expect(missing).toMatch(/\/about\/glossary\/:page \[FRAGMENT-LINK\] a page that must carry contract fragments is missing/);
  });
});
