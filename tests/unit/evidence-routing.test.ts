import { describe, expect, it } from 'vitest';
import {
  COMPOSITION_PROFILES, compositionProfileFor, projectApplicabilityForProfile, projectLandingPage,
} from '../../site/src/content/projections.js';
import { canonicalPath, hasNoStandalonePage, releaseNotesHref } from '../../site/src/content/registry.js';
import { applicabilityRecordSchema, type ApplicabilityRecord, type ContentItem } from '../../site/src/content/schema.js';

const digest = (character: string) => `sha256:${character.repeat(64)}`;
const common = { status: 'published', publication_date: '2026-07-31', milestone: 1, topics: ['t'], keywords: ['k'], audiences: ['a'], applicability_records: [] } as const;
const item = (fields: Record<string, unknown>) => ({ ...common, ...fields }) as unknown as ContentItem;

function record(overrides: Record<string, unknown> = {}): ApplicabilityRecord {
  return applicabilityRecordSchema.parse({
    id: 'july-run', workflow_id: 'baseline', status: 'validated',
    environment: { public_name: 'Purdue Anvil', fallback: false, notes: 'Fixture environment.' },
    scheduler: { family: 'Slurm', version: 'slurm 1.0' }, runtime: { name: 'Apptainer', version: 'apptainer 1.0' },
    container_digest: digest('a'), workflow_revision: 'v0.1.0',
    validation_date: '2026-07-25', execution_date: '2026-07-25', submission_id: '1',
    result: { terminal_state: 'COMPLETED', exit_code: 0, checks: ['check zero'] },
    assumptions: ['assumption zero'], limitations: ['limitation zero'], portability_boundaries: ['boundary zero'],
    evidence: { id: 'july-success', path: 'evidence/july-success/manifest.json', integrity: digest('b') },
    provenance: [{ label: 'fixture', reference: { repository: 'https://github.com/example/project', release: 'v0.1.0', path: 'README.md', integrity: digest('c') } }],
    review_after: '2026-10-31',
    ...overrides,
  });
}

const july = record({ superseded_by: 'october-run' });
const october = record({ id: 'october-run', validation_date: '2026-10-08', execution_date: '2026-10-08', review_after: '2027-01-31', evidence: { id: 'october-success', path: 'evidence/october-success/manifest.json', integrity: digest('e') } });

const landingContent = (baselineRecords: string[], v020Records: string[]) => [
  item({ id: 'model', stable_slug: 'model', artifact_type: 'learning-module', module_number: 1, estimated_minutes: 20, title: 'Model', summary: 'Model.' }),
  item({ id: 'start', stable_slug: 'start', route_namespace: 'start', artifact_type: 'guidance-note', title: 'Start', summary: 'Start.' }),
  item({ id: 'baseline', stable_slug: 'baseline', artifact_type: 'learning-module', module_number: 2, estimated_minutes: 30, title: 'Baseline', summary: 'Run.', applicability_records: baselineRecords }),
  item({ id: 'milestone-1', stable_slug: 'milestone-1', artifact_type: 'milestone', title: 'Milestone 1', summary: 'M1.' }),
  item({ id: 'release-v0-1-0', stable_slug: 'v0-1-0', artifact_type: 'release', title: 'Release v0.1.0', summary: 'R1.', applicability_records: ['july-run'] }),
  item({ id: 'release-v0-2-0', stable_slug: 'v0-2-0', artifact_type: 'release', milestone: 2, publication_date: '2026-10-15', title: 'Release v0.2.0', summary: 'R2.', applicability_records: v020Records }),
];

describe('adoption composition profile', () => {
  it('assigns checklists in the adoption namespace to the adoption profile at /adoption/<slug>/', () => {
    const evaluate = item({ id: 'adoption-evaluate', stable_slug: 'evaluate', artifact_type: 'checklist', title: 'Evaluate', summary: 'Evaluate.' });
    expect(COMPOSITION_PROFILES).toContain('adoption');
    expect(compositionProfileFor(evaluate)).toBe('adoption');
    expect(compositionProfileFor(item({ ...evaluate, route_namespace: 'adoption' }))).toBe('adoption');
    expect(canonicalPath(evaluate)).toBe('/adoption/evaluate/');
    expect(() => compositionProfileFor(item({ ...evaluate, route_namespace: 'guide' }))).toThrow(/expected adoption/);
  });

  it('keeps adoption out of the applicability consumers', () => {
    expect(projectApplicabilityForProfile('adoption', record())).toBeUndefined();
  });

  it('routes the talks and papers report to /about/talks-and-papers/ on the about profile', () => {
    const talks = item({ id: 'talks-and-papers', stable_slug: 'talks-and-papers', route_namespace: 'about', artifact_type: 'report', title: 'Talks', summary: 'Talks.' });
    expect(canonicalPath(talks)).toBe('/about/talks-and-papers/');
    expect(compositionProfileFor(talks)).toBe('about');
    expect(hasNoStandalonePage(talks)).toBe(false);
  });
});

describe('release consolidation', () => {
  it('consolidates both v0.1.0 and v0.2.0 notes onto their milestone page under an anchor named by the item id', () => {
    const [, , , , v010, v020] = landingContent([], []);
    expect(canonicalPath(v020)).toBe('/milestones/2/');
    expect(hasNoStandalonePage(v020)).toBe(true);
    expect(releaseNotesHref(v020)).toBe('/milestones/2/#release-v0-2-0');
    expect(releaseNotesHref(v010)).toBe('/milestones/1/#release-v0-1-0');
    const standalone = item({ id: 'release-v9-9-9', stable_slug: 'v9-9-9', artifact_type: 'release', title: 'R9', summary: 'R9.' });
    expect(releaseNotesHref(standalone)).toBe('/releases/v9-9-9/');
  });
});

describe('landing selection', () => {
  it('projects the current record and the newest published release', () => {
    const landing = projectLandingPage(landingContent(['october-run'], ['october-run']), [july, october]);
    expect(landing.applicability_projection?.recordId).toBe('october-run');
    expect(landing.release).toEqual({
      id: 'release-v0-2-0', title: 'Release v0.2.0', status: 'published', url: '/milestones/2/', href: '/milestones/2/#release-v0-2-0',
    });
  });

  it('chooses the release by publication date, not by input order or by which release cites the record', () => {
    const landing = projectLandingPage(landingContent(['july-run'], []), [record()]);
    expect(landing.applicability_projection?.recordId).toBe('july-run');
    expect(landing.release.id).toBe('release-v0-2-0');
    expect(projectLandingPage(landingContent(['july-run'], []).reverse(), [record()]).release.id).toBe('release-v0-2-0');
  });

  it('ignores a release that is not published yet', () => {
    const draftRelease = landingContent(['july-run'], []).map((entry) => entry.id === 'release-v0-2-0' ? { ...entry, status: 'draft' } as ContentItem : entry);
    expect(projectLandingPage(draftRelease, [record()]).release.id).toBe('release-v0-1-0');
  });

  it('refuses to claim a superseded record as current', () => {
    const landing = projectLandingPage(landingContent(['july-run'], ['july-run']), [july, october]);
    expect(landing.applicability_projection).toBeUndefined();
    expect(landing.validation_unavailable_reason).toBe('Every listed applicability record is superseded.');
  });
});
