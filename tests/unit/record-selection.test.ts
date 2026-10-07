import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { currentRecord } from '../../site/src/content/projections.js';
import { applicabilityRecordSchema } from '../../site/src/content/schema.js';

const directory = 'site/src/content/applicability';
const records = readdirSync(directory).filter((name) => /\.ya?ml$/.test(name))
  .map((name) => applicabilityRecordSchema.parse(parse(readFileSync(`${directory}/${name}`, 'utf8'))));
const current = currentRecord(records);

/** The applicability_records of a content item, or undefined when the item does not exist (yet). */
function linked(file: string): string[] | undefined {
  try {
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(`site/src/content/content-items/${file}`, 'utf8'))![1];
    return (parse(frontmatter) as { applicability_records?: string[] }).applicability_records ?? [];
  } catch { return undefined; }
}

describe('which applicability record each page uses', () => {
  it('has exactly one current record', () => {
    expect(current).toBeDefined();
    expect(records.filter(({ superseded_by }) => !superseded_by)).toHaveLength(1);
  });

  it('uses the current record on Module 2, Milestone 2 and the v0.2.0 release notes', () => {
    for (const file of ['02-baseline-single-node-pattern.md', 'milestone-2.md', 'release-v0.2.0.md']) {
      const ids = linked(file);
      if (ids === undefined) continue;
      expect(ids, file).toEqual([current!.id]);
    }
  });

  it('keeps Milestone 1 and the v0.1.0 release notes on the first record', () => {
    for (const file of ['milestone-1.md', 'release-v0.1.0.md']) expect(linked(file), file).toEqual(['m1-baseline-anvil']);
  });
});
