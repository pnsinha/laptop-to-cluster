import { describe, expect, it } from 'vitest';
import { LEARNING_PATH } from '../../site/src/content/contracts.js';
import { projectLearningPath, projectLearningPathNavigation } from '../../site/src/content/projections.js';
import type { ContentItem } from '../../site/src/content/schema.js';

const common = { status: 'published', publication_date: '2026-10-15', milestone: 2, summary: 'Summary.' } as const;
const content = [
  { ...common, id: 'adoption-evaluate', stable_slug: 'evaluate', artifact_type: 'checklist', title: 'Evaluate and adopt' },
  { ...common, id: 'module-2-baseline', stable_slug: 'baseline-single-node-pattern', artifact_type: 'learning-module', module_number: 2, title: 'Module 2' },
  { ...common, id: 'start-guide', stable_slug: 'getting-started', route_namespace: 'start', artifact_type: 'guidance-note', title: 'Run the example' },
  { ...common, id: 'module-0-orientation', stable_slug: 'tour', artifact_type: 'learning-module', module_number: 0, title: 'The five-minute tour' },
  { ...common, id: 'module-1-scheduler-orchestrator', stable_slug: 'scheduler-as-orchestrator', artifact_type: 'learning-module', module_number: 1, title: 'Module 1' },
  { ...common, id: 'module-3-compose-to-hpc-translation', stable_slug: 'compose-to-hpc-translation', artifact_type: 'learning-module', module_number: 3, title: 'Translate' },
  { ...common, id: 'glossary', stable_slug: 'glossary', route_namespace: 'about', artifact_type: 'report', title: 'Glossary' },
] as unknown as ContentItem[];

describe('learning path projection', () => {
  it('orders published items by LEARNING_PATH, not by input order or module number', () => {
    const path = projectLearningPath(content);
    expect(path.map(({ id }) => id)).toEqual([...LEARNING_PATH]);
    expect(path.map(({ url }) => url)).toEqual([
      '/guide/tour/', '/guide/scheduler-as-orchestrator/', '/start/', '/guide/baseline-single-node-pattern/',
      '/guide/compose-to-hpc-translation/', '/adoption/evaluate/',
    ]);
  });

  it('skips unpublished entries and links neighbours across the gap', () => {
    const drafts = content.map((item) => item.id === 'module-3-compose-to-hpc-translation' ? { ...item, status: 'draft' } as ContentItem : item);
    const navigation = projectLearningPathNavigation(drafts);
    expect(navigation['module-3-compose-to-hpc-translation']).toBeUndefined();
    expect(navigation['module-2-baseline'].next).toEqual({ id: 'adoption-evaluate', title: 'Evaluate and adopt', url: '/adoption/evaluate/' });
    expect(navigation['adoption-evaluate'].previous?.id).toBe('module-2-baseline');
    expect(navigation['module-0-orientation'].previous).toBeUndefined();
    expect(navigation['adoption-evaluate'].next).toBeUndefined();
    expect(navigation['start-guide']).toEqual({
      previous: { id: 'module-1-scheduler-orchestrator', title: 'Module 1', url: '/guide/scheduler-as-orchestrator/' },
      next: { id: 'module-2-baseline', title: 'Module 2', url: '/guide/baseline-single-node-pattern/' },
    });
  });
});
