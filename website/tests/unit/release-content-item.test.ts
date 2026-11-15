import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/* The v0.2.0 release notes are a section of the Milestone 2 page. */
const root = fileURLToPath(new URL('../..', import.meta.url));
const page = readFileSync(`${root}/src/content/docs/milestones/2.mdx`, 'utf8');
const [, section = ''] = /(<section class="release-notes"[\s\S]*?<\/section>)/.exec(page) ?? [];
const body = section.replace(/^[\s\S]*?\{#release-v0-2-0-heading\}\n/, '').replace(/<\/section>$/, '').replace(/<h3 id="[^"]+">([^<]+)<\/h3>/g, '### $1');
const candidate = JSON.parse(readFileSync(`${root}/releases/v0.2.0/release-candidate.json`, 'utf8'));
const currentRecord = candidate.evidenceIds.find((id: string) => !id.startsWith('accessibility-review-'));

describe('release-v0.2.0 notes on the Milestone 2 page', () => {
  it('has the frozen identity from the contracts', () => {
    expect(section).toContain('id="release-v0-2-0"');
    expect(section).toContain('aria-labelledby="release-v0-2-0-heading"');
  });

  it('cites the same applicability record as the release candidate', () => {
    expect(page).toContain(`<TestedBadge record="${currentRecord}" />`);
  });

  it('titles the section and carries release notes only', () => {
    expect(section).toContain('## Release v0.2.0: included changes {#release-v0-2-0-heading}');
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
