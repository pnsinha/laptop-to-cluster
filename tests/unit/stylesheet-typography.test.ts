import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (file: string) => readFileSync(`${root}/site/src/styles/${file}`, 'utf8');
/* The build inlines the imports, so test the flattened text. */
const bare = read('global.css')
  .replace(/@import ["']\.\/([a-z-]+\.css)["'];/g, (_match, file: string) => read(file))
  .replace(/\/\*[\s\S]*?\*\//g, '');

/* The text between the braces of every `@media <query> { ... }`, found by matching braces. */
const mediaInner = (text: string, query: string): string[] => {
  const found: string[] = [];
  const head = `@media ${query}`;
  for (let at = text.indexOf(head); at >= 0; at = text.indexOf(head, at + head.length)) {
    const open = text.indexOf('{', at);
    let depth = 0;
    let close = open;
    for (let index = open; index < text.length; index += 1) {
      if (text[index] === '{') depth += 1;
      else if (text[index] === '}' && (depth -= 1) === 0) { close = index; break; }
    }
    found.push(text.slice(open + 1, close));
  }
  return found;
};
/* The stylesheet with every @media block removed: the rules that apply at every width. */
const withoutMedia = (text: string): string => {
  let out = '';
  for (let index = 0; index < text.length;) {
    if (text.startsWith('@media', index)) {
      const open = text.indexOf('{', index);
      let depth = 0;
      let close = open;
      for (let cursor = open; cursor < text.length; cursor += 1) {
        if (text[cursor] === '{') depth += 1;
        else if (text[cursor] === '}' && (depth -= 1) === 0) { close = cursor; break; }
      }
      index = close + 1;
    } else { out += text[index]; index += 1; }
  }
  return out;
};
/* A rule body, looked up by selector or by the whole selector list, in the given stylesheet text. */
const bodyIn = (text: string, selector: string) => [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, list, declarations]) => ({ selectors: list.split(',').map((item) => item.trim().replace(/\s+/g, ' ')), declarations }))
  .filter((block) => block.selectors.includes(selector) || block.selectors.join(', ') === selector)
  .map((block) => block.declarations).join(';');
const base = withoutMedia(bare);
const body = (selector: string) => bodyIn(base, selector);
const inMedia = (query: string, selector: string) => mediaInner(bare, query).map((inner) => bodyIn(inner, selector)).join(';');

describe('quote blocks', () => {
  it('sets quotes upright, so a bold "Warning:" inside never becomes bold italic', () => {
    expect(body('blockquote')).not.toMatch(/font-style/);
    expect(bare).not.toMatch(/blockquote[^{}]*\{[^{}]*font-style:\s*italic/);
  });

  it('sets quotes at 0.9444em by default', () => {
    expect(body('blockquote')).toMatch(/font-size:\s*0\.9444em/);
  });

  it('sets quotes at 0.9444 of the reading token inside every reading container, 15 px on the 16 px text', () => {
    /* In em, a quote in a reading container would resolve against the article text it sits in; the zero-specificity reading rule sets the reading size on the blockquote, but the blockquote rule wins. So the reading containers get the token form, after the base rule and after the reading rule. */
    const reading = [...bare.matchAll(/(p\.prose, :where\([^{}]*\) > :where\(p, ul, ol, dl, blockquote\))\s*\{[^{}]*font-family:\s*var\(--font-reading\)/g)];
    expect(reading).toHaveLength(1);
    const containers = /:where\((.*)\) > :where\(p, ul, ol, dl, blockquote\)/.exec(reading[0][1])![1];
    const rule = `:where(${containers}) > blockquote`;
    const at = bare.indexOf(`${rule} {`);
    expect(at, 'the reading-container blockquote rule').toBeGreaterThan(-1);
    expect(bodyIn(base, rule)).toMatch(/font-size:\s*calc\(var\(--text-reading\)\s*\*\s*0\.9444\)/);
    expect(at).toBeGreaterThan(bare.indexOf('\nblockquote {'));
    expect(at).toBeGreaterThan(reading[0].index!);
  });

  it('keeps the left rule, the muted colour and the padding', () => {
    expect(body('blockquote')).toMatch(/border-inline-start:\s*var\(--border-strong\) solid var\(--primary\)/);
    expect(body('blockquote')).toMatch(/color:\s*var\(--muted\)/);
    expect(body('blockquote')).toMatch(/padding-inline-start:\s*var\(--space-4\)/);
    expect(body('blockquote')).toMatch(/padding-block:\s*var\(--space-2\)/);
  });
});

describe('titles keep hyphenated compounds together', () => {
  it('turns automatic hyphenation off in headings, and never uses manual hyphenation', () => {
    expect(body('h1, h2, h3, h4')).toMatch(/hyphens:\s*none/);
    expect(bare).not.toMatch(/hyphens:\s*manual/);
  });

  it('forbids a break inside a compound only from 30rem up, so a 320 px phone can still break it', () => {
    expect(body('.h-compound')).not.toMatch(/white-space/);
    const wide = mediaInner(bare, '(min-width: 30rem)').map((inner) => bodyIn(inner, '.h-compound')).join(';');
    expect(wide).toMatch(/white-space:\s*nowrap/);
    expect(bare).not.toMatch(/\.h-compound[^{}]*\{[^{}]*overflow/);
  });
});

describe('footer', () => {
  it('lays the footer out in two columns, 1fr and 40rem, from 64rem up', () => {
    const grid = inMedia('(min-width: 64rem)', '.site-footer__body');
    expect(grid).toMatch(/display:\s*grid/);
    expect(grid).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*40rem\)/);
    expect(grid).toMatch(/gap:\s*var\(--space-8\)/);
  });

  it('stacks below 64rem: the grid is only declared inside the media query', () => {
    expect(body('.site-footer__body')).not.toMatch(/display:\s*grid|grid-template-columns/);
  });

  it('sets the acknowledgment to the prose measure when stacked, and starts it on the first line when beside the links', () => {
    expect(body('.site-footer .acknowledgment')).toMatch(/max-inline-size:\s*var\(--measure-prose\)/);
    expect(body('.site-footer .acknowledgment')).toMatch(/font-size:\s*var\(--text-fine\)/);
    expect(body('.site-footer .acknowledgment')).not.toMatch(/max-inline-size:\s*none/);
    expect(inMedia('(min-width: 64rem)', '.site-footer .acknowledgment')).toMatch(/margin(?:-block-start)?:\s*0/);
  });

  it('leaves the event acknowledgment as it was', () => {
    expect(body('.event-acknowledgment')).toMatch(/max-inline-size:\s*var\(--measure-prose\)/);
    expect(body('.event-acknowledgment')).toMatch(/border-block-start:\s*var\(--border-thin\) solid var\(--rule\)/);
  });
});

describe('tables', () => {
  it('has no outer frame on the scroll region', () => {
    expect(body('.table-overflow')).not.toMatch(/border/);
    expect(body('.table-overflow')).toMatch(/overflow-x:\s*auto/);
  });

  it('aligns a caption with the flush table text and keeps its vertical padding', () => {
    expect(body('caption')).toMatch(/padding-inline:\s*0/);
    expect(body('caption')).toMatch(/padding-block:\s*var\(--space-3\)/);
  });

  it('has no fill on header cells and no per-cell header border, only a rule under the header row', () => {
    expect(body('th')).not.toMatch(/background/);
    expect(body('th')).not.toMatch(/border/);
    expect(body('thead th')).toMatch(/border-block-end:\s*var\(--border-thin\) solid var\(--rule\)/);
  });

  it('rules the first row of a table that has no thead', () => {
    expect(bodyIn(base, 'table:not(:has(thead)) tr:first-child > *')).toMatch(/border-block-end:\s*var\(--border-thin\) solid var\(--rule\)/);
  });

  it('keeps the faint row lines', () => {
    expect(body('tbody tr + tr > *')).toMatch(/border-block-start:\s*var\(--border-thin\) solid var\(--rule\)/);
  });

  it('aligns the first and last cell text with the column edges', () => {
    expect(body('th:first-child, td:first-child')).toMatch(/padding-inline-start:\s*0/);
    expect(body('th:last-child, td:last-child')).toMatch(/padding-inline-end:\s*0\.25rem/);
  });

  it('lets code in a table cell wrap, and hides the scroll instruction in print', () => {
    expect(body('td code')).toMatch(/overflow-wrap:\s*anywhere/);
    expect(body('td code')).not.toMatch(/nowrap/);
    expect(mediaInner(bare, 'print').map((inner) => bodyIn(inner, '.table-overflow__instruction')).join(';')).toMatch(/display:\s*none/);
  });

  it('thickens and darkens the header rule in print, on the same selectors that draw it', () => {
    /* thead th has higher specificity than a bare th, so the print rule must name the same selectors. */
    const print = mediaInner(bare, 'print').join('\n');
    expect(bodyIn(print, 'thead th, table:not(:has(thead)) tr:first-child > *')).toMatch(/border-block-end-width:\s*2px/);
    expect(bodyIn(print, 'thead th, table:not(:has(thead)) tr:first-child > *')).toMatch(/border-block-end-color:\s*var\(--border\)/);
    expect(bodyIn(print, 'th')).not.toMatch(/border-block-end-width/);
  });

  it('shows the scroll instruction on wide screens only for a region that can scroll, with no gradient or shadow', () => {
    expect(body('.table-overflow')).toMatch(/container-type:\s*scroll-state/);
    const query = [...bare.matchAll(/@container scroll-state\(scrollable:\s*inline\)\s*\{([^{}]*\{[^{}]*\}\s*)\}/g)].map(([, inner]) => inner).join('\n');
    expect(bodyIn(query, '.table-overflow__instruction')).toMatch(/display:\s*block/);
    expect(bare).not.toMatch(/linear-gradient|radial-gradient|conic-gradient|box-shadow/);
  });

  it('keeps the focus outline, the sticky scroll instruction and the print overflow rule', () => {
    expect(body('.table-overflow:focus-visible')).toMatch(/outline-offset/);
    expect(body('.table-overflow__instruction')).toMatch(/position:\s*sticky/);
    // With no frame to sit inside, the instruction starts on the same edge as the table text.
    expect(body('.table-overflow__instruction')).toMatch(/padding:\s*var\(--space-2\) var\(--space-3\) var\(--space-2\) 0\s*;/);
    expect(mediaInner(bare, 'print').join('\n')).toMatch(/\.table-overflow\s*\{\s*overflow:\s*visible;\s*\}/);
  });

  it('draws no frame in forced colours either, since the scroll region keeps its focus outline', () => {
    expect(mediaInner(bare, '(forced-colors: active)').join('\n')).not.toContain('.table-overflow');
  });
});

describe('reading leading', () => {
  it('sets the reading leading to 1.45 and applies it through the token', () => {
    expect(bare).toMatch(/--leading-reading:\s*1\.45\s*;/);
    expect(bare).not.toMatch(/--leading-reading:\s*1\.5\s*;/);
    expect(bare).toMatch(/font-size:\s*var\(--text-reading\);\s*line-height:\s*var\(--leading-reading\)/);
  });

  it('sets reading text at 16 px at every width, with no clamp that can grow it', () => {
    expect(bare).toMatch(/--text-reading:\s*1rem\s*;/);
    expect(bare).not.toMatch(/--text-reading:\s*clamp/);
  });
});

/* Print clipping and typography fixes (fix lane C). */
describe('print shows long code in full', () => {
  const print = mediaInner(bare, 'print').join('\n');
  const wrapRule = bodyIn(print, 'pre, pre code, .implementation-reference pre code');
  const heightRule = bodyIn(print, '.implementation-reference pre');

  it('wraps every code line in print, with an anywhere break so a long unspaced value cannot be cut off', () => {
    expect(wrapRule).toMatch(/white-space:\s*pre-wrap/);
    expect(wrapRule).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it('lifts the height cap and the scroll box on reference excerpts in print, so the last lines still print', () => {
    expect(heightRule).toMatch(/max-block-size:\s*none/);
    expect(heightRule).toMatch(/overflow:\s*visible/);
  });

  it('places the print rules after the screen rules they override, in global.css itself', () => {
    const screenRules = ['.implementation-reference pre code {', '\npre code {', '.implementation-reference pre {'].map((rule) => bare.indexOf(rule));
    const printRule = bare.indexOf('pre, pre code, .implementation-reference pre code {');
    for (const at of screenRules) expect(at).toBeGreaterThan(-1);
    expect(printRule).toBeGreaterThan(Math.max(...screenRules));
    const own = read('global.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(own).toContain('pre, pre code, .implementation-reference pre code {');
    expect(own).toContain('.implementation-reference pre { max-block-size: none; overflow: visible; }');
  });
});

describe('letter-spacing on capitals', () => {
  it('sets the resource tile tag at 0.06em', () => {
    expect(body('.resource-tile__tag')).toMatch(/letter-spacing:\s*0\.06em/);
  });

  it('keeps every uppercase rule between 0.05em and 0.12em', () => {
    const rules = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, , declarations]) => /text-transform:\s*uppercase/.test(declarations));
    expect(rules.length).toBeGreaterThanOrEqual(3);
    for (const [, selector, declarations] of rules) {
      const spacing = /letter-spacing:\s*([\d.]+)em/.exec(declarations);
      expect(spacing, selector.trim()).not.toBeNull();
      expect(Number(spacing![1]), selector.trim()).toBeGreaterThanOrEqual(0.05);
      expect(Number(spacing![1]), selector.trim()).toBeLessThanOrEqual(0.12);
    }
  });
});

describe('prose and fine print leading', () => {
  it('sets the source excerpt annotation, which is prose, at the reading leading, and leaves code at 1.6', () => {
    expect(body('.source-excerpt__annotation')).toMatch(/line-height:\s*var\(--leading-reading\)/);
    expect(body('pre, .terminal, .technical-figure')).toMatch(/line-height:\s*var\(--leading-code\)/);
    expect(bare).toMatch(/--leading-code:\s*1\.6\s*;/);
  });

  it('sets the footer acknowledgment at 1.5 and changes nothing else in the rule', () => {
    expect(body('.site-footer .acknowledgment')).toMatch(/line-height:\s*1\.5\s*;?\s*$/);
    expect(body('.site-footer .acknowledgment')).not.toMatch(/1\.55/);
    expect(body('.site-footer .acknowledgment')).toMatch(/font-size:\s*var\(--text-fine\)/);
    expect(body('.site-footer .acknowledgment')).toMatch(/max-inline-size:\s*var\(--measure-prose\)/);
  });
});

describe('full-width actions on a narrow screen', () => {
  const narrow = mediaInner(bare, '(max-width: 30rem)').join('\n');

  it('starts a wrapped label on the start edge instead of centring several lines', () => {
    expect(bodyIn(narrow, '.action')).toMatch(/text-align:\s*start/);
    expect(bodyIn(narrow, '.action')).not.toMatch(/text-align:\s*center/);
    /* The anonymous flex item shrink-wraps a one-line label, so justify-content centres only text shorter than the line. */
    expect(bodyIn(narrow, '.action')).toMatch(/display:\s*flex[^}]*justify-content:\s*center/);
  });

  it('keeps the full width, the target height and the focus ring', () => {
    expect(bodyIn(narrow, '.hero__actions, .action')).toMatch(/inline-size:\s*100%/);
    expect(body('.action')).toMatch(/min-block-size:\s*2\.75rem/);
    expect(bare).toMatch(/:focus-visible\s*\{[^{}]*outline/);
  });
});

describe('prerequisite list dash', () => {
  const layout = readFileSync(`${root}/site/src/layouts/LearningModuleLayout.astro`, 'utf8');
  const prerequisites = layout.split('\n').find((line) => line.includes('item.prerequisites.length ?')) ?? '';

  it('sets the em dash flush, or with thin spaces, never with ordinary spaces', () => {
    expect(prerequisites).toContain('diagnostic_id');
    expect(prerequisites).not.toMatch(/ — </);
    expect(prerequisites).toMatch(/<>(?:&thinsp;)?—(?:&thinsp;)?<a /);
  });
});

describe('cheat sheet measure', () => {
  it('caps the cheat sheet paragraphs at the prose measure on screen only', () => {
    expect(mediaInner(bare, 'screen').map((inner) => bodyIn(inner, '.cheat-sheet > p')).join(';')).toMatch(/max-inline-size:\s*var\(--measure-prose\)/);
    expect(mediaInner(bare, 'print').map((inner) => bodyIn(inner, '.cheat-sheet > p')).join(';')).not.toMatch(/max-inline-size/);
    expect(body('.cheat-sheet > p')).toBe('');
  });

  it('leaves the cheat sheet tables and code at the full width', () => {
    expect(body('.cheat-sheet .table-overflow')).toMatch(/max-inline-size:\s*100%/);
  });
});
