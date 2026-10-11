import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import RecordPage from '../../site/src/pages/applicability/[id].astro';
import { currentReleaseVersion } from '../../site/src/content/release.js';
import { applicabilityRecordSchema, type ApplicabilityRecord } from '../../site/src/content/schema.js';

let container: AstroContainer;
beforeAll(async () => { container = await AstroContainer.create(); });

const m1 = applicabilityRecordSchema.parse(parse(readFileSync('site/src/content/applicability/m1-baseline-anvil.yml', 'utf8')));
const renderRecord = (record: ApplicabilityRecord) =>
  container.renderToString(RecordPage, { props: { entry: { data: record } }, request: new Request(`https://laptop-to-cluster.org/applicability/${record.id}/`) });
const decode = (html: string) => html.replaceAll('&#39;', "'").replaceAll('&amp;', '&').replaceAll('&quot;', '"');

describe('canonical record page', () => {
  it('renders the plain-language rows above the literal lists, each item traced', async () => {
    const html = decode(await renderRecord(m1));
    const plainAt = html.indexOf('<h2 id="plain-language">What this means for you</h2>');
    expect(plainAt).toBeGreaterThan(html.indexOf('<dt>Review after</dt>'));
    expect(plainAt).toBeLessThan(html.indexOf('<h2>Result checks</h2>'));
    for (const item of [m1.plain_language!.tested, ...m1.plain_language!.you_need, ...m1.plain_language!.depends_on_center]) {
      expect(html).toContain(`<li data-from="${item.from.join(' ')}">${item.text}</li>`);
    }
    for (const value of [...m1.result.checks, ...m1.assumptions, ...m1.limitations, ...m1.portability_boundaries]) expect(html).toContain(`<li>${value}</li>`);
  });

  it('lists the deliberate failure run under Evidence and integrity, after the primary evidence link', async () => {
    const html = await renderRecord(m1);
    const [related] = m1.related_evidence;
    expect(html).toMatch(new RegExp(`<h2>Evidence and integrity</h2><p><a href="[^"]+">${m1.evidence.id}</a></p>`));
    const section = html.slice(html.indexOf('<h2>Evidence and integrity</h2>'), html.indexOf('<h2>Provenance</h2>'));
    expect(section).toContain(`/blob/v0.1.0/${related.path}">${related.id}</a> (negative test)`);
    expect(section).toContain(`<code class="integrity">${related.integrity}</code>`);
  });

  it('links evidence at the release named by a matching provenance entry', async () => {
    const pinned = { ...m1, provenance: [...m1.provenance, { label: 'Recorded evidence bundle', reference: { repository: 'https://github.com/pnsinha/laptop-to-cluster', release: 'v0.2.0', path: m1.evidence.path, integrity: m1.evidence.integrity } }] };
    const html = await renderRecord(pinned);
    expect(html).toContain(`/blob/v0.2.0/${m1.evidence.path}">${m1.evidence.id}</a>`);
    expect(html).toContain(`/blob/v0.1.0/${m1.related_evidence[0].path}">`);
  });

  it('keeps the README provenance link on v0.1.0 and says it predates the run, pointing at the current release', async () => {
    const html = decode(await renderRecord(m1));
    const provenance = html.slice(html.indexOf('<h2>Provenance</h2>'));
    expect(provenance).toContain('/blob/v0.1.0/workflows/baseline-slurm-apptainer/README.md">');
    const release = currentReleaseVersion();
    expect(provenance).toContain(`This README predates the test run; the current README is in <a href="https://github.com/pnsinha/laptop-to-cluster/blob/${release}/workflows/baseline-slurm-apptainer/README.md">the release</a>.`);
    const noReadme = await renderRecord({ ...m1, provenance: m1.provenance.filter(({ reference }) => !reference.path.endsWith('README.md')) });
    expect(noReadme).not.toContain('predates the test run');
  });

  it('shows no superseded notice or review extension when the record has neither', async () => {
    const html = await renderRecord({ ...m1, superseded_by: undefined });
    expect(html).not.toContain('<strong>Superseded:</strong>');
    expect(html).not.toContain('id="review-extension"');
  });

  it('shows a visible superseded notice that links the newer record', async () => {
    const html = await renderRecord({ ...m1, superseded_by: 'm2-baseline-anvil-2026-10' });
    expect(html).toContain('<p class="notice" role="note"><strong>Superseded:</strong> a newer test record replaces this one. See <a href="/applicability/m2-baseline-anvil-2026-10/">m2-baseline-anvil-2026-10</a>.</p>');
    expect(html.indexOf('<strong>Superseded:</strong>')).toBeLessThan(html.indexOf('class="applicability-record"'));
  });

  it('renders a review extension with reviewer, dates, and scope note', async () => {
    const extension = { reviewed_by: 'Project reviewer', reviewed_on: '2026-10-13', review_by: '2027-01-31', scope_note: 'This record describes the July 2026 run of v0.1.0.' };
    const html = await renderRecord({ ...m1, review_extension: extension });
    const section = html.slice(html.indexOf('<h2 id="review-extension">'), html.indexOf('<h2>Result checks</h2>'));
    expect(section).toContain('<dt>Reviewed by</dt><dd>Project reviewer</dd>');
    expect(section).toContain('<time datetime="2026-10-13">');
    expect(section).toContain('<dt>Review again by</dt><dd><time datetime="2027-01-31">');
    expect(section).toContain('<p>This record describes the July 2026 run of v0.1.0.</p>');
    expect(html).toContain('<dt>Review after</dt>');
  });
});
