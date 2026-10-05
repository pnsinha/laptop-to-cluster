import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (file: string) => readFileSync(`${root}/site/src/styles/${file}`, 'utf8');
const css = read('global.css').replace(/@import "\.\/([a-z-]+\.css)";/g, (_match, file: string) => read(file));
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
type Block = { selectors: string[]; body: string };
const blocks: Block[] = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selectors: selector.split(/,(?![^()]*\))/).map((item) => item.trim().replace(/\s+/g, ' ')),
  body,
}));
const body = (selector: string) => blocks.filter((block) => block.selectors.includes(selector)).map((block) => block.body).join(';');

/* WCAG 2.2 SC 2.5.8 (axe target-size): list links reach 24 px or are spaced clear of their neighbours. */
const linkSelector = ':where(.implementation-callout, aside, nav) :where(ul, ol) > li > a:where(:not(.action))';
const spacingSelector = ':where(.implementation-callout, aside) :where(ul, ol) > li + li';

describe('touch targets for list links in callouts and asides', () => {
  it('gives plain list links a 1.5rem minimum block size as inline-block text', () => {
    const rule = body(linkSelector);
    expect(rule).toMatch(/display:\s*inline-block/);
    const size = /min-block-size:\s*([\d.]+)rem/.exec(rule);
    expect(size).not.toBeNull();
    expect(Number(size?.[1])).toBeGreaterThanOrEqual(1.5);
  });

  it('spaces list items with a spacing token', () => {
    expect(body(spacingSelector)).toMatch(/margin-block-start:\s*var\(--space-\d+\)/);
  });

  it('adds no button styling or transition to these links', () => {
    expect(body(linkSelector)).not.toMatch(/background|border|transition/);
  });
});
