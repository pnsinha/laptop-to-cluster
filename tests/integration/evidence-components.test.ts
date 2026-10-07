import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import ApplicabilityProjectionView from '../../site/src/components/ApplicabilityProjection.astro';
import RecordSummary from '../../site/src/components/RecordSummary.astro';
import { EVIDENCE_ROW_LABELS } from '../../site/src/content/contracts.js';
import { projectApplicability, projectEvidencePanel, summarizeRecord } from '../../site/src/content/projections.js';
import { applicabilityRecordSchema, type ApplicabilityRecord } from '../../site/src/content/schema.js';

let container: AstroContainer;
beforeAll(async () => { container = await AstroContainer.create(); });

const digest = (character: string) => `sha256:${character.repeat(64)}`;
const plain = {
  tested: { text: 'It ran and every result was correct; a failure run stopped at the gate.', from: ['result.checks', 'related_evidence.0'] },
  you_need: [{ text: 'One node you can use.', from: ['assumptions.0'] }],
  depends_on_center: [{ text: 'Local-only access (loopback) on the node.', from: ['assumptions.1', 'portability_boundaries'] }],
};
function record(overrides: Record<string, unknown> = {}): ApplicabilityRecord {
  return applicabilityRecordSchema.parse({
    id: 'fixture-run', workflow_id: 'module-2-baseline', status: 'validated',
    environment: { public_name: 'Purdue Anvil', fallback: false, notes: 'Fixture environment.' },
    scheduler: { family: 'Slurm', version: 'slurm 9.9.9' }, runtime: { name: 'Apptainer', version: 'apptainer 8.8.8' },
    container_digest: digest('a'), workflow_revision: 'v0.1.0',
    validation_date: '2026-07-25', execution_date: '2026-07-25', submission_id: '424242',
    result: { terminal_state: 'COMPLETED', exit_code: 0, checks: ['check zero', 'check one'] },
    assumptions: ['assumption zero', 'assumption one'], limitations: ['limitation zero'],
    portability_boundaries: ['boundary zero', 'boundary one'],
    evidence: { id: 'fixture-success', path: 'evidence/fixture-success/manifest.json', integrity: digest('b') },
    related_evidence: [{ id: 'fixture-timeout', path: 'evidence/fixture-timeout/manifest.json', integrity: digest('d'), role: 'negative-test' }],
    provenance: [{ label: 'fixture', reference: { repository: 'https://github.com/example/project', release: 'v0.1.0', path: 'README.md', integrity: digest('c') } }],
    review_after: '2026-10-31',
    ...overrides,
  });
}
const failedResult = { terminal_state: 'FAILED', exit_code: 75, checks: ['check zero'] };
const render = (projection: ReturnType<typeof projectApplicability>) => container.renderToString(ApplicabilityProjectionView, { props: { projection } });
const decode = (html: string) => html.replaceAll('&#39;', "'").replaceAll('&amp;', '&');
const labels = (html: string) => [...html.matchAll(/<dt>([^<]+)<\/dt>/g)].map(([, label]) => label);

describe('ApplicabilityProjection (validated)', () => {
  it('renders the badge, the visible record link, and a collapsed three-row panel with the untested link', async () => {
    const html = decode(await render(projectApplicability(record({ plain_language: plain }), 'runnable-module')));
    expect(html).toMatch(/^<section class="applicability-projection" data-projection-id="runnable-module:fixture-run" data-source-id="fixture-run" aria-label="Tested workflow scope">/);
    expect(html).toContain('<p class="evidence-badge">Tested</p><p class="evidence-link">Purdue Anvil · Jul 2026 · <a href="/applicability/fixture-run/">Test record</a></p>');
    expect(html).toContain('<details class="evidence-panel"><summary>What this means for you</summary><dl class="evidence-rows">');
    expect(html).toContain('<p class="evidence-untested"><a href="/adoption/evaluate/#not-tested">What hasn\'t been tested yet</a></p></details></section>');
    expect(labels(html)).toEqual([...EVIDENCE_ROW_LABELS]);
    expect(html.match(/<div class="evidence-row">/g)).toHaveLength(3);
    expect(html).toContain('<li data-from="assumptions.1 portability_boundaries">Local-only access (loopback) on the node.</li>');
  });

  it('has exactly two top-level paragraphs, one disclosure, one record link, and no nested projection class', async () => {
    const html = await render(projectApplicability(record({ plain_language: plain }), 'landing'));
    const topLevel = html.replace(/<details[\s\S]*?<\/details>/, '');
    expect(topLevel.match(/<p(?:\s|>)/g)).toHaveLength(2);
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html.match(/href="\/applicability\/[^"]+\/"/g)).toEqual(['href="/applicability/fixture-run/"']);
    expect(html.match(/applicability-projection/g)).toHaveLength(1);
    expect(html).not.toMatch(/<section[\s\S]*<section/);
  });

  it('renders every literal list item when the record has no plain language', async () => {
    const html = await render(projectApplicability(record(), 'milestone'));
    for (const text of ['check zero', 'check one', 'assumption zero', 'assumption one', 'boundary zero', 'boundary one']) expect(html).toContain(`>${text}</li>`);
  });

  it('keeps canonical-only values out of the projection', async () => {
    const html = await render(projectApplicability(record({ plain_language: plain }), 'release'));
    for (const forbidden of ['9.9.9', '8.8.8', '2026-07-25', '424242', 'sha256:', 'Submission ID', 'Result checks', 'Evidence and integrity', 'Provenance']) {
      expect(html).not.toContain(forbidden);
    }
  });
});

describe('ApplicabilityProjection (escalated)', () => {
  it('renders stale, failed, and unvalidated records as a visible warning with no disclosure', async () => {
    const cases = [
      [record({ status: 'stale' }), 'Review due', 'Last tested on Purdue Anvil · Jul 2026 · '],
      [record({ status: 'failed', result: failedResult }), 'Last run failed', ''],
      [record({ status: 'unvalidated', result: failedResult }), 'Not yet tested', ''],
    ] as const;
    for (const [escalated, badge, caption] of cases) {
      const html = await render(projectApplicability(escalated, 'runnable-module'));
      expect(html, escalated.status).toMatch(/^<section class="applicability-projection applicability-projection--escalated" data-projection-id="runnable-module:fixture-run"/);
      expect(html, escalated.status).toContain(`<p class="evidence-badge evidence-badge--warning"><strong>Warning:</strong> ${badge}</p>`);
      expect(html, escalated.status).toContain(`<p class="evidence-link">${caption}<a href="/applicability/fixture-run/">Test record</a></p>`);
      expect(html, escalated.status).not.toContain('<details');
      expect(labels(html), escalated.status).toEqual([...EVIDENCE_ROW_LABELS]);
      expect(html.match(/applicability-projection(?!--)/g), escalated.status).toHaveLength(1);
    }
  });
});

describe('RecordSummary', () => {
  it('renders the record-reading summary block with its source ID and a record link', async () => {
    const summarized = record({ plain_language: plain });
    const html = await container.renderToString(RecordSummary, { props: { record: summarized } });
    const summary = summarizeRecord(summarized);
    const traces = new Map(projectEvidencePanel(summarized).rows[0].items.map(({ text, from }) => [text, from.join(' ')]));
    expect(html).toMatch(/^<section class="record-summary" data-source-id="fixture-run" aria-label="What was tested">/);
    expect(html).toContain(`<p class="record-summary__tested">${summary.tested}</p>`);
    expect(decode(html)).toContain(`<ul class="record-summary__scope">${summary.scope.map((value) => (traces.has(value) ? `<li data-from="${traces.get(value)}">${value}</li>` : `<li>${value}</li>`)).join('')}</ul>`);
    expect(html).toContain('<p><a href="/applicability/fixture-run/">Test record</a></p></section>');
  });
});
