import { describe, expect, it } from 'vitest';
import { EVIDENCE_ROW_LABELS as CONTRACT_LABELS, UNTESTED_HREF as CONTRACT_UNTESTED } from '../../site/src/content/contracts';
import { EVIDENCE_ROW_LABELS, UNTESTED_HREF } from '../../scripts/publication.mjs';
import { evidenceRows, isProjectionSection, projectionShapeIssues, validatePageComposition } from '../../scripts/publication.mjs';

const row = (label: string, items: string[]) => `<div class="evidence-row"><dt>${label}</dt><dd><ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul></dd></div>`;
const rows = `<dl class="evidence-rows">${row('Tested', ['Result matched.'])}${row('You need', ['A Slurm allocation.'])}${row('Depends on your center', ['Partition names.'])}</dl>`;
const open = (consumer: string, extra = '') => `<section class="applicability-projection${extra}" data-projection-id="${consumer}:m1" data-source-id="m1" aria-label="Tested workflow scope">`;
const anchor = '<a href="/applicability/m1/">Test record</a>';
const link = `<p class="evidence-link">Purdue Anvil · Jul 2026 · ${anchor}</p>`;
const escalatedLink = `<p class="evidence-link">Last tested on Purdue Anvil · Jul 2026 · ${anchor}</p>`;
const validated = (consumer = 'milestone') => `${open(consumer)}<p class="evidence-badge">Tested</p>${link}<details class="evidence-panel"><summary>What this means for you</summary>${rows}<p class="evidence-untested"><a href="/adoption/evaluate/#not-tested">What hasn’t been tested yet</a></p></details></section>`;
const escalated = (consumer = 'milestone') => `${open(consumer, ' applicability-projection--escalated')}<p class="evidence-badge evidence-badge--warning"><strong>Warning:</strong> Review due</p>${escalatedLink}${rows}</section>`;
const page = (block: string, profile = 'milestone', body = '<article><h2>Deliverables</h2><p>Published work.</p></article>') =>
  `<body data-composition-profile="${profile}"><header class="content-header"><h1>Milestone</h1><p class="lede">Summary.</p></header>${block}${body}<section class="sources-scope">Sources and scope</section></body>`;

describe('isProjectionSection', () => {
  it('matches the section with or without modifier classes and nothing else', () => {
    expect(isProjectionSection(validated())).toBe(true);
    expect(isProjectionSection(escalated())).toBe(true);
    expect(isProjectionSection('<section class="applicability-projection__x">')).toBe(false);
    expect(isProjectionSection('<section class="notice applicability-projection">')).toBe(false);
  });
});

describe('PROJECTION-SHAPE for the evidence badge and panel', () => {
  it('accepts the validated and the escalated shapes on every consumer profile', () => {
    expect(validatePageComposition('/milestones/2/', page(validated()))).toEqual([]);
    expect(validatePageComposition('/milestones/2/', page(escalated()))).toEqual([]);
    const home = page(validated('landing'), 'landing').replace('<header class="content-header">', '<header class="hero">');
    expect(validatePageComposition('/', home).join('\n')).not.toMatch(/PROJECTION-SHAPE|APPLICABILITY-OWNERSHIP/);
    expect(validatePageComposition('/guide/m/', page(validated('runnable-module'), 'learning-runnable', '<h2 id="procedure">Procedure</h2>'))).toEqual([]);
    expect(validatePageComposition('/releases/v0-2-0/', page(validated('release'), 'release'))).toEqual([]);
  });

  it('parses the rows, including optional data-from attributes', () => {
    const traced = rows.replace('<li>A Slurm allocation.</li>', '<li data-from="assumptions.0 assumptions.1">A Slurm allocation.</li>');
    expect(evidenceRows(traced)?.[1]).toEqual({ label: 'You need', items: [{ text: 'A Slurm allocation.', from: ['assumptions.0', 'assumptions.1'] }] });
    expect(evidenceRows('<p>none</p>')).toBeUndefined();
  });

  it('rejects each broken shape with PROJECTION-SHAPE', () => {
    const swapped = rows.replace('>Tested<', '>Tmp<').replace('>You need<', '>Tested<').replace('>Tmp<', '>You need<');
    const mutations: Record<string, string> = {
      'validated without a disclosure': validated().replace(/<details[\s\S]*<\/details>/, rows),
      'validated with a third top-level paragraph': validated().replace('</section>', '<p>Extra.</p></section>'),
      'validated badge using the warning class': validated().replace('class="evidence-badge"', 'class="evidence-badge evidence-badge--warning"'),
      'escalated with a disclosure': escalated().replace(rows, `<details class="evidence-panel"><summary>x</summary>${rows}</details>`),
      'escalated badge without the Warning label': escalated().replace('<strong>Warning:</strong> ', ''),
      'rows out of order': validated().replace(rows, swapped),
      'a row with no items': validated().replace('<li>Partition names.</li>', ''),
      'untested link missing': validated().replace(/<p class="evidence-untested">[\s\S]*?<\/p>/, ''),
      'untested link pointing elsewhere': validated().replace('#not-tested', '#elsewhere'),
      'inner class repeating the section name': validated().replace('<summary>', '<summary class="applicability-projection__summary">'),
      'canonical link missing': validated().replace(link, '<p class="evidence-link">No link</p>'),
      'legacy three-paragraph shape': `${open('milestone')}<p>The baseline workflow was validated on Purdue Anvil with Slurm and Apptainer.</p><p class="applicability-supplement">Boundary.</p><p><a href="/applicability/m1/">Review</a></p></section>`,
    };
    for (const [name, block] of Object.entries(mutations)) {
      const text = validatePageComposition('/milestones/2/', page(block)).join('\n');
      expect(text, name).toMatch(/PROJECTION-SHAPE/);
    }
    expect(projectionShapeIssues(validated())).toEqual([]);
  });

  it('requires the projection to follow the content header and forbids a second one', () => {
    const before = `<body data-composition-profile="milestone">${validated()}<header class="content-header"><h1>M</h1><p class="lede">S.</p></header><article></article></body>`;
    expect(validatePageComposition('/milestones/2/', before).join('\n')).toMatch(/PROJECTION-SHAPE.*after the content header/);
    expect(validatePageComposition('/milestones/2/', page(validated() + validated())).join('\n')).toMatch(/APPLICABILITY-OWNERSHIP/);
  });
});

describe('profiles, CRITICAL-VISIBILITY and SAFE-ORDERING', () => {
  it('accepts the adoption profile without a projection and forbids a standard projection there', () => {
    const adoption = '<body data-composition-profile="adoption"><header class="content-header"><h1>Evaluate</h1><p class="lede">S.</p></header><article><h2 id="not-tested">Not tested</h2></article></body>';
    expect(validatePageComposition('/adoption/evaluate/', adoption)).toEqual([]);
    expect(validatePageComposition('/adoption/evaluate/', adoption.replace('<article>', `${validated()}<article>`)).join('\n')).toMatch(/APPLICABILITY-OWNERSHIP/);
    expect(validatePageComposition('/x/', adoption.replace('adoption', 'unknown-profile')).join('\n')).toMatch(/COMPOSITION-PROFILE/);
  });

  it('never allows stale or failed state, or a badge, inside a disclosure or a hidden element', () => {
    const inDetails = page(escalated(), 'milestone', '<details><summary>More</summary><p class="evidence-badge evidence-badge--warning"><strong>Warning:</strong> hidden</p></details>');
    expect(validatePageComposition('/milestones/2/', inDetails).join('\n')).toMatch(/CRITICAL-VISIBILITY/);
    const wrapped = page(`<details><summary>Scope</summary>${escalated()}</details>`);
    expect(validatePageComposition('/milestones/2/', wrapped).join('\n')).toMatch(/CRITICAL-VISIBILITY/);
    const hiddenSection = page(validated(), 'milestone', '<section hidden><p class="evidence-badge">x</p></section>');
    expect(validatePageComposition('/milestones/2/', hiddenSection).join('\n')).toMatch(/CRITICAL-VISIBILITY/);
  });

  it('does not treat a visually-hidden class or an unrelated hidden element as hiding critical content', () => {
    const body = '<article><h2>Deliverables</h2></article><section class="visually-hidden"><p>Skip link.</p></section><div class="theme-control" hidden></div>';
    expect(validatePageComposition('/milestones/2/', page(validated(), 'milestone', body))).toEqual([]);
  });

  it('applies SAFE-ORDERING to an escalated projection too', () => {
    const afterProcedure = `<body data-composition-profile="learning-runnable"><header class="content-header"><h1>M</h1><p class="lede">S.</p></header><h2 id="procedure">Procedure</h2>${escalated('runnable-module')}</body>`;
    expect(validatePageComposition('/guide/m/', afterProcedure).join('\n')).toMatch(/SAFE-ORDERING/);
    const before = afterProcedure.replace(/(<h2 id="procedure">Procedure<\/h2>)(<section[\s\S]*<\/section>)/, '$2$1');
    expect(validatePageComposition('/guide/m/', before).join('\n')).not.toMatch(/SAFE-ORDERING/);
  });
});


describe('duplicated constants stay equal to the frozen contract', () => {
  it('matches contracts.ts', () => {
    expect([...EVIDENCE_ROW_LABELS]).toEqual([...CONTRACT_LABELS]);
    expect(UNTESTED_HREF).toBe(CONTRACT_UNTESTED);
  });
});
