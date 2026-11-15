import { describe, expect, it } from 'vitest';
import { collectApplicabilityFacts, recordSummaryBlocks, validateRecordSummaries, validateSourceDuplication } from '../../scripts/publication.mjs';

const list = (heading: string, items: string[]) => `<h2>${heading}</h2><ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
function canonicalPage(id: string, over: { env?: string; scheduler?: string; runtime?: string; date?: string; submission?: string; checks?: string[]; boundaries?: string[] } = {}) {
  const { env = 'Purdue Anvil', scheduler = 'Slurm 25.11.1', runtime = 'Apptainer 1.4.3', date = '2026-07-25', submission = 'sub-20260725', checks = ['The check passed.'], boundaries = ['Partition names differ.'] } = over;
  return {
    source: `/applicability/${id}/`,
    html: `<body data-composition-profile="applicability"><section class="applicability-record" data-source-id="${id}"><dl>`
      + `<div><dt>Status</dt><dd>validated</dd></div><div><dt>Environment</dt><dd>${env}</dd></div><div><dt>Scheduler</dt><dd>${scheduler}</dd></div>`
      + `<div><dt>Runtime</dt><dd>${runtime}</dd></div><div><dt>Execution date</dt><dd><time datetime="${date}">Long date</time></dd></div><div><dt>Validation date</dt><dd><time datetime="${date}">Long date</time></dd></div>`
      + `<div><dt>Submission ID</dt><dd>${submission}</dd></div></dl>`
      + list('Result checks', checks) + list('Assumptions', ['A Slurm allocation.']) + list('Limitations', ['One node.']) + list('Portability boundaries', boundaries) + `</section></body>`,
  };
}
const old = canonicalPage('m1-baseline-anvil', { scheduler: 'Slurm 25.11.1', runtime: 'Apptainer 1.4.3', date: '2026-07-25', submission: 'sub-20260725' });
const current = canonicalPage('m2-baseline-anvil-2026-10', { scheduler: 'Slurm 26.05.4', runtime: 'Apptainer 1.5.3', date: '2026-10-09', submission: 'sub-20261009' });
const summary = (id = 'm2-baseline-anvil-2026-10', tested = 'Tested on Purdue Anvil · Oct 2026', scope = '<li>Partition names differ.</li>', link = `/applicability/${id}/`) =>
  `<section class="record-summary" data-source-id="${id}" aria-label="What was tested"><p class="record-summary__tested">${tested}</p><ul class="record-summary__scope">${scope}</ul><p><a href="${link}">Test record</a></p></section>`;
const page = (source: string, profile: string, body: string) => ({ source, html: `<body data-composition-profile="${profile}"><header class="content-header"><h1>T</h1><p class="lede">S.</p></header>${body}</body>` });
const facts = collectApplicabilityFacts([old, current]);

describe('applicability facts', () => {
  it('reads every canonical record page, keyed by source ID', () => {
    expect([...facts.byId.keys()]).toEqual(['m1-baseline-anvil', 'm2-baseline-anvil-2026-10']);
    expect(facts.errors).toEqual([]);
    expect(facts.byId.get('m2-baseline-anvil-2026-10')).toMatchObject({ environment: 'Purdue Anvil', schedulerVersion: '26.05.4', validationDateIso: '2026-10-09', boundary: 'Partition names differ.' });
    expect(collectApplicabilityFacts([{ source: '/applicability/wrong/', html: old.html }]).errors.join()).toMatch(/SOURCE-AGREEMENT/);
  });
});

describe('RECORD-SUMMARY', () => {
  const ok = (body: string, profile = 'adoption') => validateRecordSummaries([page('/adoption/evaluate/', profile, body)], facts.byId);

  it('accepts a summary on the adoption profile that agrees with its record', () => {
    expect(ok(summary())).toEqual([]);
    expect(ok(summary(undefined, 'The example ran and its output was checked.', '<li data-from="result.checks assumptions.0">Anything you like.</li>'))).toEqual([]);
    expect(recordSummaryBlocks(`<p>x</p>${summary()}<p>y</p>`)).toHaveLength(1);
  });

  it('accepts the scheduler and runtime scope items that summarizeRecord writes, and rejects a stale one', () => {
    const scope = (sched: string) => `<li>${sched}</li><li>Runtime: Apptainer 1.5.3</li><li>One node.</li>`;
    expect(ok(summary(undefined, undefined, scope('Scheduler: Slurm 26.05.4')))).toEqual([]);
    expect(ok(summary(undefined, undefined, scope('Scheduler: Slurm 25.11.1'))).join('\n')).toMatch(/RECORD-SUMMARY/);
  });

  it('allows the summary only on the adoption profile', () => {
    for (const profile of ['landing', 'learning-runnable', 'milestone', 'about']) expect(ok(summary(), profile).join('\n'), profile).toMatch(/RECORD-SUMMARY.*only the adoption profile/);
  });

  it('rejects a missing record, a wrong link, a stale value, and untraced scope', () => {
    expect(ok(summary('nope')).join('\n')).toMatch(/missing canonical source nope/);
    expect(ok(summary(undefined, undefined, undefined, '/applicability/m1-baseline-anvil/')).join('\n')).toMatch(/canonical record link/);
    expect(ok(summary(undefined, 'Tested on Purdue Anvil · Jul 2026')).join('\n')).toMatch(/not the record validation month/);
    expect(ok(summary(undefined, 'Tested on SDSC Expanse · Oct 2026')).join('\n')).toMatch(/different environment/);
    expect(ok(summary(undefined, 'Ran with Slurm 25.11.1.')).join('\n')).toMatch(/belongs to a different record/);
    expect(ok(summary(undefined, undefined, '<li>Made-up claim.</li>')).join('\n')).toMatch(/neither traced nor an item/);
    expect(ok(summary(undefined, undefined, '<li data-from="assumptions.4">x</li>')).join('\n')).toMatch(/assumptions\.4, which is not on the canonical record page/);
    expect(ok(summary(undefined, ''), 'adoption').join('\n')).toMatch(/tested sentence .* is required/);
  });
});

describe('SOURCE-DUPLICATION', () => {
  const pages = (extra: ReturnType<typeof page>[]) => [old, current, ...extra];
  const dup = (extra: ReturnType<typeof page>[]) => validateSourceDuplication(pages(extra), facts.byId);

  it('ignores every canonical record page, so two records of one system do not collide', () => {
    expect(dup([])).toEqual([]);
  });

  it('strips record summaries and generated projections but flags handwritten canonical values', () => {
    expect(dup([page('/adoption/evaluate/', 'adoption', summary())])).toEqual([]);
    const projection = '<section class="applicability-projection" data-projection-id="milestone:m2-baseline-anvil-2026-10" data-source-id="m2-baseline-anvil-2026-10"><p class="evidence-badge">Tested</p></section>';
    expect(dup([page('/milestones/2/', 'milestone', projection)])).toEqual([]);
    for (const text of ['<p>Validated on Purdue Anvil.</p>', '<p>Runs on Slurm 26.05.4.</p>', '<p>Result: The check passed.</p>', '<p>Run sub-20261009.</p>']) {
      expect(dup([page('/guide/x/', 'learning-conceptual', text)]).join('\n'), text).toMatch(/SOURCE-DUPLICATION/);
    }
  });
});
