import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (file: string) => readFileSync(`${root}/site/src/styles/${file}`, 'utf8');
/* The build inlines the two imports, so test the flattened text. */
const css = read('global.css').replace(/@import ["']\.\/([a-z-]+\.css)["'];/g, (_match, file: string) => read(file));
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
type Block = { selectors: string[]; body: string };
const blocks: Block[] = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selectors: selector.split(',').map((item) => item.trim().replace(/\s+/g, ' ')),
  body,
}));
/* A query matches a block when it is one of the block's selectors, or the whole selector list written with ", ". */
const body = (selector: string) => blocks.filter((block) => block.selectors.includes(selector) || block.selectors.join(', ') === selector).map((block) => block.body).join(';');

describe('global.css foundation', () => {
  it('imports tokens first and fonts second, before any rule', () => {
    expect(read('global.css').replace(/\/\*[\s\S]*?\*\//g, '')).toMatch(/^\s*@import "\.\/tokens\.css";\s*@import "\.\/fonts\.css";/);
  });

  it('takes the root type from the tokens', () => {
    expect(body(':root')).toMatch(/font-family:\s*var\(--font-body\)/);
    expect(body(':root')).toMatch(/font-size:\s*var\(--text-base\);[\s\S]*line-height:\s*var\(--leading-base\)/);
  });

  it('keeps 16 px controls, 14 px supporting text and a 1.5 control line height', () => {
    expect(body('button, input, select, textarea, summary')).toMatch(/font-size:\s*var\(--text-base\)[^}]*line-height:\s*1\.5/);
    expect(body('small, .supporting, .technical-label')).toMatch(/font-size:\s*var\(--text-supporting\)/);
    expect(body('body')).toMatch(/font-size:\s*16px/);
  });

  it('has no smooth scrolling and no negative letter spacing', () => {
    expect(bare).not.toMatch(/scroll-behavior:\s*smooth/);
    expect(bare).not.toMatch(/letter-spacing:\s*-/);
  });

  it('sets headings in the serif display face with the token sizes and weights', () => {
    expect(body('h1, h2, h3, h4')).toMatch(/font-family:\s*var\(--font-display\)/);
    expect(body('h1, h2, h3')).toMatch(/line-height:\s*1\.2/);
    expect(body('h1')).toMatch(/font-size:\s*var\(--text-display\)[^}]*font-weight:\s*var\(--weight-display\)/);
    expect(body('h2')).toMatch(/font-size:\s*var\(--text-h2\)/);
    expect(body('h3')).toMatch(/font-size:\s*var\(--text-h3\)/);
    expect(body('h4')).toMatch(/font-family:\s*var\(--font-body\)/);
  });

  it('uses the focus token for the ring, with a visible offset', () => {
    expect(body(':focus-visible')).toMatch(/outline:\s*var\(--focus-width\) solid var\(--focus\)/);
    expect(body(':focus-visible')).toMatch(/outline-offset:\s*var\(--focus-offset\)/);
  });

  it('underlines links in the main content and the footer', () => {
    expect(body('a')).toMatch(/text-decoration-line:\s*underline/);
    expect(body('a')).toMatch(/text-decoration-thickness:\s*1px/);
    expect(body('a:hover')).toMatch(/text-decoration-thickness:\s*2px/);
  });
});

describe('global.css shell', () => {
  it('shares one header and footer rule on the shell alias, then puts the footer on the surface', () => {
    expect(body('.site-header, .site-footer')).toMatch(/background:\s*var\(--shell\)/);
    expect(body('.site-footer')).toMatch(/background:\s*var\(--surface\)/);
    expect(body('.site-header')).toMatch(/border-block-end:\s*var\(--border-thin\) solid var\(--rule\)/);
  });

  it('styles the wordmark in the serif face and the tagline as fine muted text', () => {
    expect(body('.site-identity__line1')).toMatch(/font-family:\s*var\(--font-display\)/);
    expect(body('.site-identity__line2')).toMatch(/font-size:\s*var\(--text-fine\)/);
  });

  it('marks the current page with weight and a rule, not colour, and has no arrow glyph', () => {
    expect(body('.site-nav__link[aria-current="page"]')).toMatch(/font-weight:\s*var\(--weight-semibold\)/);
    expect(body('.site-nav__link[aria-current="page"]')).toMatch(/border-block-end:\s*var\(--border-strong\) solid currentColor/);
    expect(bare).not.toContain('▸');
  });

  it('keeps nav targets at least 2.5rem tall and the external hint at the 14 px floor', () => {
    expect(body('.site-nav__link')).toMatch(/min-block-size:\s*2\.5rem/);
    expect(body('.external-label')).toMatch(/font-size:\s*var\(--text-fine\)/);
  });

  it('collapses to the native menu below 48rem and hides the wide nav landmark with it', () => {
    expect(body('.site-nav--compact')).toMatch(/display:\s*none/);
    expect(bare).toMatch(/@media \(max-width: 48rem\)\s*\{[\s\S]*?nav:has\(> \.site-nav--wide\)\s*\{[^}]*display:\s*none/);
    expect(bare).toMatch(/@media \(max-width: 48rem\)\s*\{[\s\S]*?\.site-nav--compact\s*\{[^}]*display:\s*block/);
  });

  it('keeps the hidden theme control hidden until the script unhides it, with 2rem buttons', () => {
    expect(body('.theme-control[hidden]')).toMatch(/display:\s*none/);
    expect(body('.theme-control button')).toMatch(/min-block-size:\s*2rem/);
    expect(body('.theme-control button[aria-pressed="true"]')).toMatch(/font-weight:\s*var\(--weight-semibold\)/);
    expect(body('.theme-control button[aria-pressed="true"]')).toMatch(/border-block-end-color:\s*currentColor/);
  });

  it('lays the footer links out in a row with a dot separator and 24 px targets', () => {
    expect(body('.footer-links')).toMatch(/display:\s*flex/);
    expect(body('.footer-links li:not(:last-child)::after')).toMatch(/content:\s*"·"/);
    expect(body('.footer-links a')).toMatch(/padding-block:\s*0\.25rem/);
  });

  it('sets the acknowledgment at 14 px with a readable measure, and gives the event variant its own block', () => {
    expect(body('.site-footer .acknowledgment')).toMatch(/font-size:\s*var\(--text-fine\)/);
    expect(body('.site-footer .acknowledgment')).toMatch(/max-inline-size:\s*var\(--measure-prose\)/);
    expect(body('.event-acknowledgment')).toMatch(/border-block-start:\s*var\(--border-thin\) solid var\(--rule\)/);
  });

  it('keeps the skip link and the visually-hidden helpers', () => {
    expect(body('.skip:focus')).toMatch(/inset-block-start:\s*var\(--space-3\)/);
    expect(body('.vh, .crosswalk__sr')).toMatch(/clip-path:\s*inset\(50%\)/);
  });
});

describe('global.css floors', () => {
  it('declares no literal font size under 14 px, except inside max()', () => {
    const sizes = [...bare.matchAll(/font-size:\s*([0-9.]+)(rem|px)\b/g)].map(([whole, value, unit]) => ({ whole, px: Number(value) * (unit === 'rem' ? 16 : 1) }));
    expect(sizes.filter(({ px }) => px < 14).map(({ whole }) => whole)).toEqual([]);
  });
});
