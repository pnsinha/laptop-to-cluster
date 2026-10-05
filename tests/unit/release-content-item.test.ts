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
});
