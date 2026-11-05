import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { currentReadmeHref, evidenceHref, olderReadme, recordTitle, repositoryHref } from '../../site/src/content/record-page.js';
import { currentReleaseVersion } from '../../site/src/content/release.js';
import { applicabilityRecordSchema } from '../../site/src/content/schema.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const m1 = applicabilityRecordSchema.parse(parse(readFileSync(resolve(root, 'site/src/content/applicability/m1-baseline-anvil.yml'), 'utf8')));
const built = (id: string) => readFileSync(resolve(root, 'site/dist/applicability', id, 'index.html'), 'utf8');
const decode = (html: string) => html.replaceAll('&#39;', "'").replaceAll('&amp;', '&').replaceAll('&quot;', '"');

describe('canonical record page, as built', () => {
  const html = decode(built(m1.id));

  it('titles the record by system and month, keeps the id above the title, and reads top down', () => {
    expect(html).toContain(`<h1 id="_top">${recordTitle(m1)}</h1>`);
    expect(html).toContain(`<p class="content-header__line">Applicability record ${m1.id}</p>`);
    const plainAt = html.indexOf('<h2 id="plain-language">What this means for you</h2>');
    expect(plainAt).toBeGreaterThan(html.indexOf('class="applicability-record"'));
    expect(plainAt).toBeLessThan(html.indexOf('<h2 id="tested-configuration">Tested configuration</h2>'));
    expect(html.indexOf('<h2 id="tested-configuration">')).toBeLessThan(html.indexOf('<h2 id="result-checks">Result checks</h2>'));
    expect(html.indexOf('<h2 id="evidence-and-integrity">')).toBeLessThan(html.indexOf('<h2 id="provenance">Provenance</h2>'));
  });

  it('renders every plain-language item traced, and every literal list item', () => {
    for (const item of [m1.plain_language!.tested, ...m1.plain_language!.you_need, ...m1.plain_language!.depends_on_center]) {
      expect(html).toContain(`<li data-from="${item.from.join(' ')}">${item.text}</li>`);
    }
    for (const value of [...m1.result.checks, ...m1.assumptions, ...m1.limitations, ...m1.portability_boundaries]) expect(html).toContain(`<li>${value}</li>`);
  });

  it('lists the deliberate failure run under Evidence and integrity, after the primary evidence link', () => {
    const [related] = m1.related_evidence;
    expect(html).toMatch(new RegExp(`<h2 id="evidence-and-integrity">Evidence and integrity</h2><p><a href="[^"]+">${m1.evidence.id}</a></p>`));
    const section = html.slice(html.indexOf('<h2 id="evidence-and-integrity">'), html.indexOf('<h2 id="provenance">'));
    expect(section).toContain(`/blob/v0.1.0/${related.path}">${related.id}</a> (negative test)`);
    expect(section).toContain(`<code class="integrity">${related.integrity}</code>`);
  });

  it('keeps the README provenance link on v0.1.0 and says it predates the run, pointing at the current release', () => {
    const provenance = html.slice(html.indexOf('<h2 id="provenance">'));
    expect(provenance).toContain('/blob/v0.1.0/workflows/baseline-slurm-apptainer/README.md">');
    const release = currentReleaseVersion();
    expect(provenance).toContain(`This README predates the test run; the current README is in <a href="https://github.com/pnsinha/laptop-to-cluster/blob/${release}/workflows/baseline-slurm-apptainer/README.md">the release</a>.`);
  });

  it('shows a visible superseded notice that links the newer record, before the record itself', () => {
    expect(m1.superseded_by).toBeTruthy();
    expect(html).toContain(`<p class="notice" role="note"><strong>Superseded:</strong> a newer test record replaces this one. See <a href="/applicability/${m1.superseded_by}/">${m1.superseded_by}</a>.</p>`);
    expect(html.indexOf('<strong>Superseded:</strong>')).toBeLessThan(html.indexOf('class="applicability-record"'));
    const current = decode(built(m1.superseded_by!));
    expect(current).not.toContain('<strong>Superseded:</strong>');
  });

  it('renders a review extension only when the record has one', () => {
    const withExtension = [m1.id, m1.superseded_by!].filter((id) => built(id).includes('id="review-extension"'));
    const records = [m1, applicabilityRecordSchema.parse(parse(readFileSync(resolve(root, 'site/src/content/applicability', `${m1.superseded_by}.yml`), 'utf8')))];
    expect(withExtension).toEqual(records.filter((record) => record.review_extension).map((record) => record.id));
    for (const record of records.filter((record) => record.review_extension)) {
      const page = built(record.id);
      const section = page.slice(page.indexOf('<h2 id="review-extension">'), page.indexOf('<h2 id="result-checks">'));
      expect(section).toContain(`<dt>Reviewed by</dt><dd>${record.review_extension!.reviewed_by}</dd>`);
      expect(section).toContain(`<time datetime="${record.review_extension!.reviewed_on}">`);
      expect(section).toContain(`<dt>Review again by</dt><dd><time datetime="${record.review_extension!.review_by}">`);
      expect(section).toContain(`<p>${record.review_extension!.scope_note}</p>`);
    }
  });
});

describe('record page links', () => {
  it('links evidence at the release named by a matching provenance entry, else at the workflow revision', () => {
    expect(evidenceHref(m1, m1.evidence.path)).toBe(`https://github.com/pnsinha/laptop-to-cluster/blob/${m1.workflow_revision}/${m1.evidence.path}`);
    const pinned = { ...m1, provenance: [...m1.provenance, { label: 'Recorded evidence bundle', reference: { repository: 'https://github.com/pnsinha/laptop-to-cluster', release: 'v0.2.0', path: m1.evidence.path, integrity: m1.evidence.integrity } }] };
    expect(evidenceHref(pinned, m1.evidence.path)).toContain(`/blob/v0.2.0/${m1.evidence.path}`);
    expect(evidenceHref(pinned, m1.related_evidence[0].path)).toContain(`/blob/${m1.workflow_revision}/${m1.related_evidence[0].path}`);
  });

  it('builds repository links with the release and the optional line anchor, encoding each path segment', () => {
    expect(repositoryHref({ repository: 'https://github.com/x/y', release: 'v0.1.0', path: 'a b/c.py', line_anchor: '#L10' })).toBe('https://github.com/x/y/blob/v0.1.0/a%20b/c.py#L10');
    expect(repositoryHref({ repository: 'https://github.com/x/y', release: 'v0.1.0', path: 'README.md' })).toBe('https://github.com/x/y/blob/v0.1.0/README.md');
  });

  it('finds a README that predates the current release and points at the current copy', () => {
    const reference = olderReadme(m1, 'v0.2.0');
    expect(reference?.path).toBe('workflows/baseline-slurm-apptainer/README.md');
    expect(currentReadmeHref(reference!, 'v0.2.0')).toBe('https://github.com/pnsinha/laptop-to-cluster/blob/v0.2.0/workflows/baseline-slurm-apptainer/README.md');
    expect(olderReadme(m1, 'v0.1.0')).toBeUndefined();
    expect(olderReadme({ ...m1, provenance: m1.provenance.filter(({ reference: entry }) => !entry.path.endsWith('README.md')) }, 'v0.2.0')).toBeUndefined();
  });

  it('names the record by its system and validation month', () => {
    expect(recordTitle(m1)).toBe(`Test record: ${m1.environment.public_name}, Jul 2026`);
  });
});
