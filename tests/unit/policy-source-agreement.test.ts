import { describe, expect, it } from 'vitest';
import { RECORD_LINK_TEXT, evidenceBadgeParts, evidenceBadgeText, formatMonthYear, rowAgreementIssues, validateProjectionSourceAgreement } from '../../scripts/publication.mjs';

type Status = 'validated' | 'stale' | 'failed' | 'unvalidated';
const list = (heading: string, items: string[]) => `<h2>${heading}</h2><ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
// The validation date mirrors site/src/pages/applicability/[id].astro:23: <time datetime=ISO>Long date</time>.
const DEFAULT_DATE_DD = '<time datetime="2026-07-25">July 25, 2026</time>';
function canonical(status: Status = 'validated', extra = '', dateDd = DEFAULT_DATE_DD) {
  return `<body data-composition-profile="applicability"><section class="applicability-record" data-source-id="m1"><dl>`
    + `<div><dt>Status</dt><dd>${status}</dd></div><div><dt>Environment</dt><dd>Purdue Anvil</dd></div>`
    + `<div><dt>Scheduler</dt><dd>Slurm 25.11</dd></div><div><dt>Runtime</dt><dd>Apptainer 1.4</dd></div>`
    + `<div><dt>Validation date</dt><dd>${dateDd}</dd></div></dl>`
    + list('Result checks', ['The check passed.', 'The log matched.']) + list('Assumptions', ['A Slurm allocation.', 'Apptainer is installed.'])
    + list('Limitations', ['One node only.']) + list('Portability boundaries', ['Partition names differ.', 'Module names differ.']) + extra + `</section></body>`;
}
const li = (text: string, from = '') => `<li${from ? ` data-from="${from}"` : ''}>${text}</li>`;
const rowsOf = (tested: string[], need: string[], depends: string[]) => `<dl class="evidence-rows">`
  + `<div class="evidence-row"><dt>Tested</dt><dd><ul>${tested.join('')}</ul></dd></div>`
  + `<div class="evidence-row"><dt>You need</dt><dd><ul>${need.join('')}</ul></dd></div>`
  + `<div class="evidence-row"><dt>Depends on your center</dt><dd><ul>${depends.join('')}</ul></dd></div></dl>`;
const literalRows = rowsOf([li('The check passed.'), li('The log matched.')], [li('A Slurm allocation.'), li('Apptainer is installed.')], [li('Partition names differ.'), li('Module names differ.')]);
const anchor = '<a href="/applicability/m1/">Test record</a>';
const linkLine = (caption?: string | null) => `<p class="evidence-link">${caption ? `${caption} · ` : ''}${anchor}</p>`;
const validated = (rows = literalRows, badge = 'Tested', caption: string | null = 'Purdue Anvil · Jul 2026') =>
  `<section class="applicability-projection" data-projection-id="milestone:m1" data-source-id="m1" aria-label="Tested workflow scope"><p class="evidence-badge">${badge}</p>${linkLine(caption)}<details class="evidence-panel"><summary>What this means for you</summary>${rows}<p class="evidence-untested"><a href="/adoption/evaluate/#not-tested">What hasn’t been tested yet</a></p></details></section>`;
const escalated = (badge: string, caption?: string, rows = literalRows) =>
  `<section class="applicability-projection applicability-projection--escalated" data-projection-id="milestone:m1" data-source-id="m1" aria-label="Tested workflow scope"><p class="evidence-badge evidence-badge--warning"><strong>Warning:</strong> ${badge}</p>${linkLine(caption)}${rows}</section>`;
const check = (block: string, page = canonical()) => validateProjectionSourceAgreement('/milestones/2/', block, '/applicability/m1/', page);

describe('badge text', () => {
  it('formats the month and year in UTC without locale data', () => {
    expect(formatMonthYear('2026-07-25')).toBe('Jul 2026');
    expect(formatMonthYear('2027-01-01')).toBe('Jan 2027');
    expect(formatMonthYear('2026-13-01')).toBeUndefined();
    expect(formatMonthYear('July 2026')).toBeUndefined();
  });

  it('builds the C1 text for each status', () => {
    expect(evidenceBadgeText('validated', 'Purdue Anvil', '2026-07-25')).toBe('Tested on Purdue Anvil · Jul 2026');
    expect(evidenceBadgeText('stale', 'Purdue Anvil', '2026-07-25')).toBe('Review due: last tested on Purdue Anvil · Jul 2026');
    expect(evidenceBadgeText('failed', 'Purdue Anvil', '2026-07-25')).toBe('Last run failed: see the test record');
    expect(evidenceBadgeText('unvalidated', 'Purdue Anvil', '2026-07-25')).toBe('Not yet tested on a cluster');
    expect(evidenceBadgeText('validated', '', '2026-07-25')).toBeUndefined();
  });

  it('builds the pill label and caption for each status (A17)', () => {
    expect(evidenceBadgeParts('validated', 'Purdue Anvil', '2026-07-25')).toEqual({ label: 'Tested', context: 'Purdue Anvil · Jul 2026' });
    expect(evidenceBadgeParts('stale', 'Purdue Anvil', '2026-07-25')).toEqual({ label: 'Review due', context: 'Last tested on Purdue Anvil · Jul 2026' });
    expect(evidenceBadgeParts('failed', 'Purdue Anvil', '2026-07-25')).toEqual({ label: 'Last run failed' });
    expect(evidenceBadgeParts('unvalidated', 'Purdue Anvil', '2026-07-25')).toEqual({ label: 'Not yet tested' });
    expect(evidenceBadgeParts('validated', '', '2026-07-25')).toBeUndefined();
    expect(RECORD_LINK_TEXT).toBe('Test record');
  });
});

describe('SOURCE-AGREEMENT between a projection and its canonical record', () => {
  it('accepts a literal-row validated projection and every escalated state', () => {
    expect(check(validated())).toEqual([]);
    expect(check(escalated('Review due', 'Last tested on Purdue Anvil · Jul 2026'), canonical('stale'))).toEqual([]);
    expect(check(escalated('Last run failed'), canonical('failed'))).toEqual([]);
    expect(check(escalated('Not yet tested'), canonical('unvalidated'))).toEqual([]);
  });

  it('accepts a middle dot written as an entity', () => {
    expect(check(validated(literalRows, 'Tested', 'Purdue Anvil &middot; Jul 2026'))).toEqual([]);
  });

  it('keeps tool versions and the full date canonical-only', () => {
    const block = validated();
    expect(block).not.toMatch(/25\.11|1\.4|2026-07-25/);
    expect(check(block, canonical().replace('Slurm 25.11', 'Slurm 26.5').replace('Apptainer 1.4', 'Apptainer 1.5'))).toEqual([]);
  });

  it('rejects a badge that drifted from the environment, the month, or the status', () => {
    const drift = [
      check(validated(literalRows, 'Tested', 'SDSC Expanse · Jul 2026')),
      check(validated(literalRows, 'Tested', 'Purdue Anvil · Aug 2026')),
      check(validated(literalRows, 'Tested', null)),
      check(validated(literalRows, 'Tested on Purdue Anvil · Jul 2026')),
      check(validated(literalRows, 'Tested on Purdue Anvil · Jul 2026', null)),
      check(validated(), canonical('stale')),
      check(escalated('Review due', 'Last tested on Purdue Anvil · Jul 2026'), canonical('validated')),
      check(escalated('Review due', 'Last tested on Purdue Anvil · Jul 2026'), canonical('failed')),
    ];
    for (const errors of drift) expect(errors.join('\n')).toMatch(/SOURCE-AGREEMENT/);
  });

  it('rejects the old long-form pill, a wrong caption month and a missing caption with their own diagnostics', () => {
    expect(check(validated(literalRows, 'Tested on Purdue Anvil · Jul 2026', null)).join('\n')).toMatch(/badge label must be generated/);
    expect(check(validated(literalRows, 'Tested', 'Purdue Anvil · Aug 2026')).join('\n')).toMatch(/badge caption must be generated/);
    expect(check(validated(literalRows, 'Tested', null)).join('\n')).toMatch(/badge caption must be generated/);
    expect(check(validated(literalRows, 'Tested', 'Purdue Anvil · Aug 2026')).join('\n')).not.toMatch(/badge label/);
  });

  it('takes the month from the datetime attribute, not the displayed text', () => {
    const page = canonical('validated', '', '<time datetime="2026-08-03">August 3, 2026</time>');
    expect(check(validated(literalRows, 'Tested', 'Purdue Anvil · Jul 2026'), page).join('\n')).toMatch(/SOURCE-AGREEMENT/);
    expect(check(validated(literalRows, 'Tested', 'Purdue Anvil · Aug 2026'), page)).toEqual([]);
  });

  it('rejects a long-form date with no time element', () => {
    expect(check(validated(), canonical('validated', '', 'July 25, 2026')).join('\n')).toMatch(/SOURCE-AGREEMENT/);
  });

  it('falls back to a bare ISO date in the definition', () => {
    expect(check(validated(), canonical('validated', '', '2026-07-25'))).toEqual([]);
  });

  it('rejects a stale source ID or canonical link, and a missing canonical record', () => {
    expect(check(validated().replace('data-source-id="m1"', 'data-source-id="stale"')).join('\n')).toMatch(/SOURCE-AGREEMENT/);
    expect(check(validated().replace('href="/applicability/m1/"', 'href="/applicability/other/"')).join('\n')).toMatch(/SOURCE-AGREEMENT/);
    expect(check(validated(), canonical().replaceAll('data-source-id="m1"', 'data-source-id="renamed"')).join('\n')).toMatch(/SOURCE-AGREEMENT/);
  });
});

describe('row agreement', () => {
  const lists = { 'result.checks': ['C0', 'C1'], assumptions: ['A0'], limitations: ['L0'], portability_boundaries: ['B0', 'B1'], related_evidence: ['R0'] };
  const rows = (items: Array<{ text: string; from: string[] }>) => [{ label: 'Tested', items }];

  it('requires untraced rows to equal the record list in order', () => {
    expect(check(validated(rowsOf([li('The log matched.'), li('The check passed.')], [li('A Slurm allocation.'), li('Apptainer is installed.')], [li('Partition names differ.'), li('Module names differ.')]))).join('\n')).toMatch(/result\.checks exactly/);
    expect(check(validated(rowsOf([li('The check passed.')], [li('A Slurm allocation.'), li('Apptainer is installed.')], [li('Partition names differ.'), li('Module names differ.')]))).join('\n')).toMatch(/result\.checks exactly/);
    expect(check(validated(rowsOf([li('The check passed.'), li('The log matched.')], [li('Made up claim.')], [li('Partition names differ.'), li('Module names differ.')]))).join('\n')).toMatch(/assumptions exactly/);
  });

  it('accepts plain-language items whose traces resolve, including related evidence when the page lists it', () => {
    const plain = rowsOf(
      [li('The example ran and was checked.', 'result.checks result.checks.1 related_evidence.0')],
      [li('An allocation on a Slurm cluster.', 'assumptions.1')],
      [li('Your partition and module names.', 'portability_boundaries')],
    );
    expect(check(validated(plain), canonical('validated', '<h3 id="related-evidence">Related evidence</h3><ul class="related-evidence"><li>A failed-gate run.</li></ul>'))).toEqual([]);
    expect(check(validated(plain)).join('\n')).toMatch(/related_evidence\.0, which is not on the canonical record page/);
  });

  it('rejects traces to a missing index, an unknown list, mixed rows and empty text', () => {
    expect(rowAgreementIssues(rows([{ text: 'x', from: ['result.checks.2'] }]), lists).join()).toMatch(/result\.checks\.2/);
    expect(rowAgreementIssues(rows([{ text: 'x', from: ['notes.0'] }]), lists).join()).toMatch(/unknown source notes\.0/);
    expect(rowAgreementIssues(rows([{ text: 'x', from: ['assumptions.0'] }, { text: 'C0', from: [] }]), lists).join()).toMatch(/mixes traced and literal/);
    expect(rowAgreementIssues(rows([{ text: '', from: ['assumptions.0'] }]), lists).join()).toMatch(/empty traced item/);
    expect(rowAgreementIssues(rows([{ text: 'x', from: ['limitations'] }, { text: 'y', from: ['related_evidence.0'] }]), lists)).toEqual([]);
  });
});
