import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (file: string) => readFileSync(`${root}/site/src/styles/${file}`, 'utf8');
const css = read('global.css').replace(/@import "\.\/([a-z-]+\.css)";/g, (_match, file: string) => read(file));
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
type Block = { selectors: string[]; body: string };
const blocks: Block[] = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selectors: selector.split(',').map((item) => item.trim().replace(/\s+/g, ' ')),
  body,
}));
/* A query matches a block when it is one of the block's selectors, or the whole selector list written with ", ". */
const body = (selector: string) => blocks.filter((block) => block.selectors.includes(selector) || block.selectors.join(', ') === selector).map((block) => block.body).join(';');
/* The text of the last @media block with this query: global.css comes after tokens.css in the flattened text. */
const media = (query: string) => {
  const start = bare.lastIndexOf(`@media ${query}`);
  if (start < 0) return '';
  return bare.slice(start, bare.indexOf('\n}', start));
};

describe('evidence badge, panel and record summary', () => {
  it('draws the badge as the only pill, neutral ink on a raised surface', () => {
    expect(body('.evidence-badge')).toMatch(/border-radius:\s*var\(--radius-pill\)/);
    expect(body('.evidence-badge')).toMatch(/background:\s*var\(--raised\)/);
    expect(body('.evidence-badge')).toMatch(/border:\s*var\(--border-thin\) solid var\(--border\)/);
    expect(bare.match(/var\(--radius-pill\)/g)).toHaveLength(1);
  });

  it('keeps projection children out of the old stacked margin flow', () => {
    expect(body('.applicability-projection')).toMatch(/display:\s*flex/);
    expect(body('.applicability-projection > *')).toMatch(/margin:\s*0/);
  });

  it('marks stale and failed states with a double ink rule and a double-bordered badge, not colour alone', () => {
    expect(body('.applicability-projection--escalated')).toMatch(/border-inline-start:\s*0\.375rem double var\(--text\)/);
    expect(body('.applicability-projection--escalated')).toMatch(/display:\s*block/);
    expect(body('.evidence-badge--warning')).toMatch(/border:\s*0\.25rem double var\(--text\)/);
    expect(body('.diagram-svg #ah-green polygon')).toMatch(/fill:\s*var\(--c-gate\)/);
  });

  it('sets the three evidence rows in two columns from 40rem, and the panel full width', () => {
    expect(body('.evidence-panel')).toMatch(/flex-basis:\s*100%/);
    expect(media('(min-width: 40rem)')).toMatch(/\.evidence-row\s*\{[^}]*grid-template-columns:\s*11rem minmax\(0, 1fr\)/);
    expect(body('.evidence-rows')).toMatch(/max-inline-size:\s*44rem/);
  });

  it('makes the panel summary a visible, keyboard-reachable control', () => {
    expect(body('.evidence-panel > summary')).toMatch(/cursor:\s*pointer/);
    expect(body('.evidence-panel > summary')).toMatch(/text-decoration:\s*underline/);
  });

  it('styles the record summary as a bordered block with the reading serif', () => {
    expect(body('.record-summary')).toMatch(/border:\s*var\(--border-thin\) solid var\(--rule\)/);
    expect(body('.record-summary__tested')).toMatch(/font-family:\s*var\(--font-reading\)/);
    expect(body('.record-summary__scope')).toMatch(/padding-inline-start:\s*1\.125rem/);
  });
});

describe('talks, notices, tables and pager', () => {
  it('lists talks under hairlines with a fine accent kind label', () => {
    expect(body('.talks')).toMatch(/list-style:\s*none/);
    expect(body('.talk')).toMatch(/border-block-start:\s*var\(--border-thin\) solid var\(--rule\)/);
    expect(body('.talk__kind')).toMatch(/font-size:\s*var\(--text-fine\)/);
    expect(body('.talk__links a')).toMatch(/padding-block:\s*0\.25rem/);
  });

  it('draws notices with the double ink rule, and info notes without a box', () => {
    expect(body('.notice, .notice--warning, .support-state')).toMatch(/border-inline-start:\s*0\.375rem double var\(--text\)/);
    expect(body('.notice, .notice--warning, .support-state')).toMatch(/background:\s*var\(--warning-surface\)/);
    expect(body('.notice--info')).toMatch(/border-block-start:\s*var\(--border-thin\) solid var\(--rule\)/);
  });

  it('keeps native table display, bounds overflow in the wrapper, and rules rows with hairlines', () => {
    expect(bare).not.toMatch(/table\s*\{[^}]*display\s*:\s*block/);
    expect(body('.table-overflow')).toMatch(/overflow-x:\s*auto/);
    expect(body('table')).toMatch(/border-collapse:\s*collapse/);
    expect(body('tbody tr + tr > *')).toMatch(/border-block-start:\s*var\(--border-thin\) solid var\(--rule\)/);
    expect(body('.table-overflow:focus-visible')).toMatch(/outline-offset/);
  });

  it('keeps pager links whole-link underlined and sets their titles in the display face', () => {
    expect(body('.module-pager a')).toMatch(/text-decoration-line:\s*underline/);
    expect(body('.module-pager a span:not(.module-pager__direction)')).toMatch(/font-family:\s*var\(--font-display\)/);
    expect(body('.module-pager__direction')).toMatch(/font-size:\s*var\(--text-fine\)/);
  });
});

describe('code', () => {
  it('sets code blocks on the surface at the 15 px token, scrollable, with inline code never under 14 px', () => {
    expect(body('pre')).toMatch(/overflow-x:\s*auto/);
    expect(body('pre, .terminal, .technical-figure')).toMatch(/background:\s*var\(--surface\)/);
    expect(body('pre, .terminal, .technical-figure')).toMatch(/font-size:\s*var\(--text-code\)/);
    expect(body('code')).toMatch(/font-size:\s*var\(--text-code-inline\)/);
    expect(body('.hash, .checksum, .integrity, .technical-value, .metadata-value')).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it('picks the Shiki light colours by default, the dark ones by OS or by data-theme, and never uses !important', () => {
    expect(body('.astro-code span')).toMatch(/color:\s*var\(--shiki-light\)/);
    expect(media('screen and (prefers-color-scheme: dark)')).toMatch(/:root:not\(\[data-theme="light"\]\) \.astro-code span[^{]*\{[^}]*color:\s*var\(--shiki-dark\)/);
    expect(media('screen')).toMatch(/:root\[data-theme="dark"\] \.astro-code span[^{]*\{[^}]*color:\s*var\(--shiki-dark\)/);
    for (const block of blocks.filter((item) => item.selectors.some((selector) => selector.includes('astro-code')))) expect(block.body).not.toMatch(/!important/);
  });

  it('keeps every diagram text size at 14 px or more', () => {
    const sizes = blocks.filter((block) => block.selectors.some((selector) => selector.startsWith('.diagram-svg'))).flatMap((block) => [...block.body.matchAll(/font-size:\s*([0-9.]+)px/g)].map((match) => Number(match[1])));
    expect(sizes.length).toBeGreaterThan(5);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
  });
});

describe('media rules', () => {
  it('has a 320 px reflow rule and reduces motion to nothing', () => {
    expect(bare).toMatch(/@media \(max-width: 30rem\)/);
    expect(media('(prefers-reduced-motion: reduce)')).toMatch(/scroll-behavior:\s*auto/);
  });

  it('hides the theme control and the compact menu in print and opens disclosures for the browser', () => {
    const print = media('print');
    expect(print).toMatch(/\.theme-control[^{]*\{[^}]*display:\s*none/);
    expect(print).toMatch(/\.evidence-panel::details-content\s*\{[^}]*content-visibility:\s*visible/);
    expect(print).toMatch(/\.action--primary\s*\{[^}]*color:\s*#000/);
    expect(print).toMatch(/break-inside:\s*avoid/);
    expect(print).toMatch(/a\[href\^="http"\]:not\(nav a\)::after\s*\{[^}]*content:\s*" \("\s*attr\(href\)\s*"\)"/);
  });

  it('maps components to system colours when forced colours are active', () => {
    const forced = media('(forced-colors: active)');
    expect(forced).toMatch(/\.astro-code span[^{]*\{[^}]*color:\s*CanvasText/);
    expect(forced).toMatch(/\.action--primary\s*\{[^}]*border:\s*2px solid ButtonText/);
    expect(forced).toMatch(/\.timeline__step\[aria-current="step"\]\s*\{[^}]*outline-color:\s*Highlight/);
    expect(forced).toMatch(/:focus-visible\s*\{[^}]*outline-color:\s*Highlight/);
  });
});

describe('whole-file guards', () => {
  it('has no motion, gradients, glass or shadows', () => {
    expect(bare).not.toMatch(/@keyframes|animation-name\s*:|animation\s*:|transition\s*:|scroll-timeline|parallax|linear-gradient|radial-gradient|backdrop-filter|box-shadow/);
  });

  it('allows cursor: pointer only on links, buttons and summaries', () => {
    const allowed = new Set(['.action', '.resource-tile', '.theme-control button', '.site-nav--compact summary', '.evidence-panel > summary', '.sources-scope summary']);
    for (const block of blocks.filter((item) => /cursor:\s*pointer/.test(item.body))) {
      for (const selector of block.selectors) expect(allowed.has(selector), selector).toBe(true);
    }
  });

  it('only references custom properties that are defined here or in the tokens (Shiki supplies two)', () => {
    const defined = new Set([...bare.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
    const used = [...new Set([...bare.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]))];
    expect(used.filter((name) => !defined.has(name) && !['--shiki-light', '--shiki-dark'].includes(name))).toEqual([]);
  });

  it('keeps the old table and layout guards: table display, 30rem, anywhere-wrapping', () => {
    expect(bare).toMatch(/overflow-wrap:\s*anywhere/);
    expect(bare).toMatch(/max-width:\s*30rem/);
  });
});
