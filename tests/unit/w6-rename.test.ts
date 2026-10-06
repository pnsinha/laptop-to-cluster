import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { read, readItem } from './w6-content-helpers';

const OLD_SLUG = 'how-to-use-this-guide';

describe('W6 Module 0 rename (D17)', () => {
  it.each(['getting-started.md', 'milestone-2.md', '01-scheduler-as-orchestrator.md'])(
    '%s does not link to the retired Module 0 slug',
    (name) => {
      expect(read(`site/src/content/content-items/${name}`)).not.toContain(OLD_SLUG);
    },
  );

  it('milestone-2.yml points Module 0 at the tour route', () => {
    const record = parse(read('site/src/content/milestones/milestone-2.yml')) as {
      deliverables: { item_id: string; public_url?: string }[];
    };
    const row = record.deliverables.find(({ item_id }) => item_id === 'module-0-orientation');
    expect(row?.public_url).toBe('/guide/tour/');
  });

  it('Module 1 asks readers to take the tour, not to read "Module 0: How to use this guide"', () => {
    const { data } = readItem('01-scheduler-as-orchestrator.md');
    const prerequisite = data.prerequisites.find((entry: { id: string }) => entry.id === 'module-0-orientation');
    expect(prerequisite.check).toMatch(/five-minute tour/i);
  });
});
