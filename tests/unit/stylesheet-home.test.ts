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
const inContainer = (query: string, selector: string) => {
  const start = bare.indexOf(`@container ${query}`);
  if (start < 0) return '';
  const end = bare.indexOf('\n}', start);
  const scoped = bare.slice(start, end);
  return [...scoped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, s]) => s.split(',').map((item) => item.trim()).includes(selector)).map(([, , b]) => b).join(';');
};
const CONCEPTS = ['step', 'gate', 'scratch', 'net'] as const;

describe('hero', () => {
  it('is one column below 60rem, then copy beside the two-environment figure', () => {
    expect(body('.hero')).toMatch(/display:\s*grid/);
    expect(body('.hero')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(bare).toMatch(/@media \(min-width: 60rem\)\s*\{[\s\S]*?\.hero\s*\{[^}]*grid-template-columns:\s*minmax\(0, 11fr\) minmax\(0, 10fr\)/);
    expect(bare).toMatch(/@media \(min-width: 60rem\)\s*\{[\s\S]*?main > \.hero\s*\{[^}]*padding-block-start:\s*var\(--space-10\)/);
    expect(body('body[data-composition-profile="landing"] main > .hero')).toMatch(/margin-block-start:\s*0/);
    expect(body('body[data-composition-profile="landing"] main > .hero')).toMatch(/padding-block-start:\s*var\(--space-3\)/);
    expect(body('.hero__copy')).toMatch(/max-inline-size:\s*var\(--measure-prose\)/);
    expect(body('.hero h1')).toMatch(/max-inline-size:\s*none/);
    expect(body('.hero h1')).not.toMatch(/14ch/);
    expect(body('.hero h1')).toMatch(/font-size:\s*var\(--l-display\)/);
    expect(body('.hero .lede')).toMatch(/max-inline-size:\s*none/);
    expect(body('.hero .lede')).toMatch(/font-size:\s*var\(--l-lede\)/);
  });

  it('defines a landing-only type scale of seven properties', () => {
    const scale = body('body[data-composition-profile="landing"]');
    for (const prop of ['--l-display', '--l-lede', '--l-h2', '--l-term', '--l-body', '--l-annot', '--l-caption']) {
      expect(scale, prop).toMatch(new RegExp(`${prop}:\\s*[^;]+`));
    }
    expect(body('.home-doors > h2, .concepts > h2, .crosswalk > h2')).toMatch(/font-size:\s*var\(--l-h2\)/);
  });

  it('draws the hero figure as two bordered environment panels, plain HTML', () => {
    expect(body('.env-pair')).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(body('.env')).toMatch(/background:\s*var\(--raised\)[^}]*border:\s*var\(--border-thin\) solid var\(--rule\)/);
    expect(body('.env__box')).toMatch(/border:\s*var\(--border-thin\) solid var\(--border\)/);
    expect(body('.env__cmd code')).toMatch(/display:\s*inline-block/);
    expect(body('.env__alloc')).toMatch(/border:\s*var\(--border-strong\) dashed var\(--primary\)/);
    expect(body('.hero__figure figcaption')).toMatch(/color:\s*var\(--muted\)/);
    expect(bare).toMatch(/@media \(max-width: 30rem\)\s*\{[\s\S]*?\.env-pair\s*\{[^}]*grid-template-columns:\s*1fr/);
  });

  it('draws one filled primary action and underlined secondary links', () => {
    expect(body('.action--primary')).toMatch(/color:\s*var\(--on-primary\)[^}]*background:\s*var\(--primary\)/);
    expect(body('.action--primary:hover')).toMatch(/background:\s*var\(--primary-hover\)/);
    expect(body('.action')).toMatch(/border:\s*var\(--border-thin\) solid transparent/);
    expect(body('.hero__secondary-link')).toMatch(/min-block-size:\s*2\.75rem/);
    expect(body('.hero__quiet')).toMatch(/color:\s*var\(--muted\)/);
  });

  it('carries none of the retired home classes', () => {
    expect(bare).not.toMatch(/\.workflow-figure|\.compose-mapping|\.path-list|\.hero__visual|\.event-band__eyebrow|\.event-band__copy|\.big-idea|\.analogy/);
  });
});

describe('concept utilities', () => {
  it.each(CONCEPTS)('.c-%s sets --c and --c-bg from its tokens and draws its own shape', (key) => {
    expect(body(`.c-${key}`)).toMatch(new RegExp(`--c:\\s*var\\(--c-${key}\\);\\s*--c-bg:\\s*var\\(--c-${key}-bg\\)`));
    expect(body(`.c-${key}::before`)).toMatch(new RegExp(`content:\\s*var\\(--mark-${key}\\)`));
  });

  it('draws every shape from the one marks face, in the concept colour', () => {
    const shared = body('.c-step::before, .c-gate::before, .c-scratch::before, .c-net::before');
    expect(shared).toMatch(/font-family:\s*var\(--font-marks\)/);
    expect(shared).toMatch(/color:\s*var\(--c\)/);
  });

  it('drops the tint inside running text but keeps colour and shape', () => {
    expect(body(':is(p, li, dd, dt, figcaption, td, th) :is(.c-step, .c-gate, .c-scratch, .c-net)')).toMatch(/background:\s*none/);
  });
});

describe('concept rows', () => {
  it('sets the intro and notes in the reading serif and separates the rows with hairlines', () => {
    expect(body('.concepts__intro')).toMatch(/font-family:\s*var\(--font-reading\)/);
    expect(body('.concept')).toMatch(/border-block-end:\s*var\(--border-thin\) solid var\(--rule\)/);
    expect(body('.concept')).not.toMatch(/background|border:|box-shadow/);
    expect(body('.concept__note')).toMatch(/font-family:\s*var\(--font-reading\)/);
    expect(body('.concept__note')).not.toMatch(/max-inline-size/);
    expect(body('.concept__side')).toMatch(/font-family:\s*var\(--font-body\)/);
    expect(body('.concept__was')).toMatch(/font-size:\s*var\(--l-term\)/);
    expect(body('.concept__term')).toMatch(/font-size:\s*var\(--l-term\)/);
    expect(bare).toMatch(/@media \(min-width: 52rem\)\s*\{[\s\S]*?\.concept\s*\{[^}]*grid-template-columns:\s*3rem minmax\(0, 2fr\) minmax\(0, 3fr\)/);
  });
});

describe('timeline', () => {
  it('is a container, with the ordered list as the allocation frame', () => {
    expect(body('.timeline')).toMatch(/container-type:\s*inline-size/);
    expect(body('.timeline__steps')).toMatch(/border:\s*var\(--border-strong\) solid var\(--border\)/);
    expect(body('.timeline__steps')).toMatch(/list-style:\s*none/);
  });

  it('positions bars from data-span through custom properties, never inline style', () => {
    for (const span of ['begin', 'full', 'within', 'fade', 'stop']) expect(bare, span).toContain(`[data-span="${span}"]`);
    expect(body('.timeline__lane[data-span="within"]')).toMatch(/--from:\s*20%;\s*--to:\s*90%/);
    expect(body('.timeline__lane[data-lane="scratch"][data-span="begin"]')).toMatch(/--from:\s*40%/);
    expect(body('.timeline__lane[data-lane="coord"][data-span="begin"]')).toMatch(/--from:\s*35%/);
    expect(body('.timeline__lane[data-span="fade"]::after')).toMatch(/border-inline-start:\s*var\(--bw\) dotted var\(--bc\)/);
    expect(body('.timeline__lane[data-lane="workers"]')).toMatch(/--bs:\s*double/);
  });

  it('weights the lanes: scratch lightest, coordinator heaviest single line, workers double', () => {
    expect(body('.timeline__lane[data-lane="scratch"]')).toMatch(/--bw:\s*var\(--bar-scratch\)[^}]*--bc:\s*var\(--c-scratch\)/);
    expect(body('.timeline__lane[data-lane="coord"]')).toMatch(/--bw:\s*var\(--bar-coordinator\)[^}]*--bc:\s*var\(--c-step\)/);
    expect(body('.timeline__lane[data-lane="workers"]')).toMatch(/--bw:\s*var\(--bar-workers\)/);
  });

  it('draws the gate as a barrier across every lane and the verify mark as a drawn check', () => {
    expect(body('.timeline__step[data-step="3"] .timeline__bars::after')).toMatch(/border-block-start:\s*var\(--border-strong\) solid var\(--c-gate\)/);
    expect(body('.timeline__mark--gate')).toMatch(/color:\s*var\(--c-gate\)[^}]*font-family:\s*var\(--font-marks\)|font-family:\s*var\(--font-marks\)[^}]*color:\s*var\(--c-gate\)/);
    expect(body('.timeline__mark--verify')).toMatch(/border-width:\s*0 2\.5px 2\.5px 0/);
  });

  it('lights the current step with an outline, which survives forced colours', () => {
    expect(body('.timeline__step[aria-current="step"]')).toMatch(/outline:\s*var\(--border-strong\) solid var\(--primary\)/);
  });

  it('turns into six columns with horizontal lanes at 50rem and wider', () => {
    expect(inContainer('(min-width: 50rem)', '.timeline__steps')).toMatch(/grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/);
    expect(inContainer('(min-width: 50rem)', '.timeline__bars')).toMatch(/grid-template-rows:\s*repeat\(4, var\(--lane-h\)\)/);
  });

  it('keeps captions and the key at or above the 14 px floor', () => {
    expect(body('.timeline__caption')).toMatch(/font-size:\s*0\.9375rem/);
    expect(body('.timeline__after')).toMatch(/font-size:\s*var\(--text-fine\)/);
  });
});

describe('doors', () => {
  it('lays three doors in a row from 52rem, one column below', () => {
    expect(body('.doors')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(bare).toMatch(/@media \(min-width: 52rem\)\s*\{[\s\S]*?\.doors\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
  });

  it('draws the door as a bordered raised block with the door radius', () => {
    expect(body('.door')).toMatch(/background:\s*var\(--raised\)[^}]*border:\s*var\(--border-thin\) solid var\(--border\)[^}]*border-radius:\s*var\(--radius-door\)/);
    expect(body('.door__who')).toMatch(/font-size:\s*var\(--text-fine\)/);
  });

  it('never makes the whole door a click target', () => {
    const doorBlocks = blocks.filter((block) => block.selectors.some((selector) => /\.door(?![a-z_-])|\.door__/.test(selector)));
    expect(doorBlocks.length).toBeGreaterThan(4);
    for (const block of doorBlocks) expect(block.body, block.selectors.join()).not.toMatch(/cursor:\s*pointer/);
    expect(bare).not.toMatch(/\.door__link::after/);
  });
});

describe('crosswalk', () => {
  it('is a container; panes stack below 62rem and put compose beside the stacked sbatch and coordinator above', () => {
    expect(body('.crosswalk')).toMatch(/container-type:\s*inline-size/);
    expect(body('.crosswalk__panes')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(inContainer('(min-width: 62rem)', '.crosswalk__panes')).toMatch(/minmax\(0, 1fr\) minmax\(0, 1\.35fr\)/);
    expect(inContainer('(min-width: 62rem)', '.crosswalk__pane[data-pane="compose"]')).toMatch(/grid-row:\s*1 \/ span 2/);
  });

  it('wraps long lines under the code with a hanging indent and keeps the block selectable', () => {
    const line = body('.crosswalk__line');
    expect(line).toMatch(/display:\s*block/);
    expect(line).toMatch(/white-space:\s*pre-wrap/);
    expect(line).toMatch(/text-indent:\s*calc\(-1 \* var\(--ind\)\)/);
    expect(body('.crosswalk__line:has(.crosswalk__n)')).toMatch(/--ind:/);
    expect(body('.crosswalk__line .crosswalk__mark')).toMatch(/user-select:\s*none/);
    expect(body('.crosswalk__n')).toMatch(/user-select:\s*none/);
    expect(body('.crosswalk__mark')).toMatch(/-webkit-user-select:\s*none/);
    expect(body('.crosswalk__n')).toMatch(/-webkit-user-select:\s*none/);
    expect(body('.crosswalk__pane figcaption a')).toMatch(/font-size:\s*var\(--text-ui\)/);
  });

  it.each(CONCEPTS)('takes the rule colour for lines whose first concept is %s', (key) => {
    expect(body(`.crosswalk__line[data-concepts^="${key}"]`)).toMatch(new RegExp(`--cc:\\s*var\\(--c-${key}\\)`));
    expect(body(`.crosswalk__term[data-concept="${key}"]`)).toMatch(new RegExp(`--cc:\\s*var\\(--c-${key}\\)`));
  });

  it('draws a 3 px concept rule on tagged lines only', () => {
    expect(body('.crosswalk__line')).toMatch(/border-inline-start:\s*var\(--rule-concept\) solid transparent/);
    expect(body('.crosswalk__line[data-concepts]')).toMatch(/border-inline-start-color:\s*var\(--cc\)/);
  });

  it('sets code in the 15 px mono token on the surface', () => {
    expect(body('.crosswalk__pane pre')).toMatch(/font-size:\s*var\(--text-code\)[^}]*line-height:\s*var\(--leading-code\)|background:\s*var\(--surface\)/);
    expect(body('.crosswalk__pane pre')).toMatch(/background:\s*var\(--surface\)/);
  });
});

describe('amendments A1 to A3 hooks', () => {
  it('hides .crosswalk__sr by clipping it to 1 px, never display:none, and keeps it out of copied code', () => {
    const hidden = body('.vh, .crosswalk__sr');
    expect(hidden).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(hidden).toMatch(/inline-size:\s*1px;\s*block-size:\s*1px/);
    expect(hidden).toMatch(/user-select:\s*none/);
    expect(bare).not.toMatch(/\.crosswalk__sr[^{}]*\{[^}]*display:\s*none/);
  });

  it('keeps every crosswalk mark, legend marks included, out of text selection', () => {
    expect(body('.crosswalk__mark')).toMatch(/user-select:\s*none/);
    expect(body('.crosswalk__line .crosswalk__mark')).toMatch(/user-select:\s*none/);
  });

  it('draws no bar for data-span="none" lanes', () => {
    expect(bare).not.toMatch(/\[data-span="none"\]/);
  });

  it('sets the crosswalk subtitle and the scratch-tail sentence as muted text, shown by default', () => {
    expect(body('.crosswalk__subtitle')).toMatch(/color:\s*var\(--muted\)/);
    expect(body('.timeline__after')).toMatch(/color:\s*var\(--muted\)/);
    expect(body('.crosswalk__subtitle')).not.toMatch(/display:\s*none/);
    expect(body('.timeline__after')).not.toMatch(/display:\s*none/);
  });

  it('colours the timeline and crosswalk only from tokens, with no literal colour', () => {
    const scoped = blocks.filter((block) => block.selectors.some((selector) => /\.timeline|\.crosswalk/.test(selector)));
    expect(scoped.length).toBeGreaterThan(30);
    for (const block of scoped) expect(block.body, block.selectors.join()).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
  });
});

describe('home bottom', () => {
  it('draws the event band with an accent rule and the strip under a hairline', () => {
    expect(body('.event-band')).toMatch(/border-inline-start:\s*var\(--border-strong\) solid var\(--accent\)/);
    expect(body('.project-links')).toMatch(/border-block-start:\s*var\(--border-thin\) solid var\(--rule\)/);
    expect(body('.project-links a')).toMatch(/padding-block:\s*0\.25rem/);
  });

  it('keeps the evidence projection close under the hero on the landing profile', () => {
    expect(body('body[data-composition-profile="landing"] main > .applicability-projection')).toMatch(/margin-block-start:\s*var\(--space-6\)/);
  });
});
