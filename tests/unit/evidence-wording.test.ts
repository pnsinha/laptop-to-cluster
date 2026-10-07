import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { evidenceBadgeContext, evidenceBadgeLabel, evidenceStatusText, moduleHeaderLine, moduleKindLine, MODULE_TYPE_LABELS } from '../../site/src/content/wording.js';

const frontmatter = (path: string) => parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(path, 'utf8'))![1]) as Record<string, any>;

describe('evidence status wording', () => {
  it('generates the badge text for every record status', () => {
    expect(evidenceStatusText('validated', 'Fixture Cluster', 'Jul 2026')).toBe('Tested on Fixture Cluster · Jul 2026');
    expect(evidenceStatusText('stale', 'Fixture Cluster', 'Jul 2026')).toBe('Review due: last tested on Fixture Cluster · Jul 2026');
    expect(evidenceStatusText('failed', 'Fixture Cluster', 'Jul 2026')).toBe('Last run failed: see the test record');
    expect(evidenceStatusText('unvalidated', 'Fixture Cluster', 'Jul 2026')).toBe('Not yet tested on a cluster');
  });

  it('never names a system or date for failed or untested records', () => {
    for (const status of ['failed', 'unvalidated'] as const) {
      expect(evidenceStatusText(status, 'Fixture Cluster', 'Jul 2026')).not.toMatch(/Fixture Cluster|Jul 2026/);
    }
  });
});

describe('evidence badge pill and caption', () => {
  it('uses a short label for every status', () => {
    expect(evidenceBadgeLabel('validated')).toBe('Tested');
    expect(evidenceBadgeLabel('stale')).toBe('Review due');
    expect(evidenceBadgeLabel('failed')).toBe('Last run failed');
    expect(evidenceBadgeLabel('unvalidated')).toBe('Not yet tested');
  });

  it('names the system and month only for validated and stale records', () => {
    expect(evidenceBadgeContext('validated', 'Fixture Cluster', 'Jul 2026')).toBe('Fixture Cluster · Jul 2026');
    expect(evidenceBadgeContext('stale', 'Fixture Cluster', 'Jul 2026')).toBe('Last tested on Fixture Cluster · Jul 2026');
    expect(evidenceBadgeContext('failed', 'Fixture Cluster', 'Jul 2026')).toBeUndefined();
    expect(evidenceBadgeContext('unvalidated', 'Fixture Cluster', 'Jul 2026')).toBeUndefined();
  });
});

describe('module header line', () => {
  it('maps module type and time to reader language', () => {
    expect(MODULE_TYPE_LABELS.runnable).toBe('Hands-on');
    expect(moduleKindLine('runnable', 30)).toBe('Hands-on · about 30 min');
    expect(moduleKindLine('conceptual', 20)).toBe('Reading · about 20 min');
    expect(moduleKindLine('hybrid')).toBe('Reading and hands-on');
    expect(moduleHeaderLine({ module_number: 2, module_type: 'runnable', estimated_minutes: 30 })).toBe('Module 2 · Hands-on · about 30 min');
  });

  it('produces the published Module 2 header from its frontmatter', () => {
    const module2 = frontmatter('site/src/content/content-items/02-baseline-single-node-pattern.md');
    expect(moduleHeaderLine(module2 as Parameters<typeof moduleHeaderLine>[0])).toBe(`Module 2 · Hands-on · about ${module2.estimated_minutes} min`);
  });
});
