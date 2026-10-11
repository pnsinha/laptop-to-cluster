import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { contentItemSchema } from '../../site/src/content/schema';

const root = fileURLToPath(new URL('../..', import.meta.url));
const source = readFileSync(`${root}/site/src/content/content-items/release-v0.2.0.md`, 'utf8');
const [, frontMatter, body] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source) ?? [];
const candidate = JSON.parse(readFileSync(`${root}/releases/v0.2.0/release-candidate.json`, 'utf8'));
const currentRecord = candidate.evidenceIds.find((id: string) => !id.startsWith('accessibility-review-'));

describe('release-v0.2.0 content item', () => {
  const item = contentItemSchema.parse(parse(frontMatter));

  it('has the frozen identity from the contracts', () => {
    expect(item).toMatchObject({ id: 'release-v0-2-0', stable_slug: 'v0-2-0', artifact_type: 'release', milestone: 2, status: 'published' });
  });

  it('cites the same applicability record as the release candidate', () => {
    expect(item.applicability_records).toEqual([currentRecord]);
  });

  it('relates to the milestone it renders inside', () => {
    expect(item.related).toContain('milestone-2');
  });

  it('titles the section and carries release notes only, with no id of its own', () => {
    expect(item.title).toBe('Release v0.2.0: included changes');
    expect(body.trimStart().startsWith('### Added')).toBe(true);
    for (const heading of ['### Added', '### Changed', '### Deprecated', '### Corrected']) expect(body).toContain(heading);
    expect(body).not.toMatch(/\bid=|release-v0-2-0/);
  });

  it('describes what ships: the redesigned home, the timeline on the tour, one theme toggle and the dated test record', () => {
    for (const phrase of ['two-environment figure', 'three doors', 'Compose-to-sbatch crosswalk', 'six-step timeline', 'on the five-minute tour and in Modules 1–2', 'dated test record', 'One toggle switches the theme and remembers your choice']) expect(body).toContain(phrase);
    expect(body).not.toContain('full, dated');
    expect(body).not.toMatch(/light, dark or system|plain-language big idea, a six-step timeline/);
  });

  it('names the October re-test and says the July image was reused, leaving the system and versions to the linked record', () => {
    expect(body).toContain('re-tested in October 2026');
    // The publication gate keeps canonical record values (system, versions, exact dates) out of hand-written text.
    expect(body).not.toMatch(/Purdue|Anvil|Slurm \d|Apptainer \d|October 7, 2026|\d{4}-\d{2}-\d{2}/);
    expect(body).toMatch(/image was reused, not rebuilt: it has the same digest as the July build/);
    expect(body).toContain(`](/applicability/${currentRecord}/)`);
  });

  it('labels material not run on a cluster as Shim-tested or Designed, not run', () => {
    expect(body).toContain('“Shim-tested”');
    expect(body).toContain('“Designed, not run”');
  });
});
