import { describe, expect, it } from 'vitest';
import { CONCEPTS, DESIGNED_NOT_RUN, UNTESTED_HREF } from '../../site/src/content/contracts.js';
import { h2s, readItem } from './w6-content-helpers';

const { body, data } = readItem('01-scheduler-as-orchestrator.md');
const section = (title: string): string => {
  const start = body.indexOf(`## ${title}`);
  const next = body.indexOf('\n## ', start + 1);
  return body.slice(start, next === -1 ? undefined : next);
};

describe('W6 Module 1', () => {
  it('follows the D12 section order', () => {
    expect(h2s(body)).toEqual([
      'Your Compose stack, before',
      'The same stack on a cluster',
      'Map each responsibility',
      'What varies by center',
      'Adapt it',
      'Key points',
    ]);
  });

  it('places the figures with slot markers: timeline in the map section, diagrams beside what they explain', () => {
    for (const name of ['timeline', 'diagram-compose-to-hpc', 'diagram-readiness-sequence']) {
      expect(body.match(new RegExp(`^<!-- l2c:${name} -->$`, 'gm'))).toHaveLength(1);
    }
    expect(section('Map each responsibility')).toContain('<!-- l2c:timeline -->');
    expect(section('Map each responsibility')).toContain('<!-- l2c:diagram-compose-to-hpc -->');
    expect(section('The same stack on a cluster')).toContain('<!-- l2c:diagram-readiness-sequence -->');
  });

  it('states exactly three goals', () => {
    expect(data.learning_outcomes).toHaveLength(3);
  });

  it('labels the Compose sketch with the exact unrun label', () => {
    const before = section('Your Compose stack, before');
    expect(before).toContain('```yaml');
    expect(before).toContain(DESIGNED_NOT_RUN);
  });

  it('introduces each concept in plain language first, with its utility class and a glossary anchor', () => {
    const cluster = section('The same stack on a cluster');
    for (const concept of CONCEPTS) {
      expect(cluster).toContain(concept.plain);
      expect(cluster).toMatch(new RegExp(`<a class="c-${concept.key}" href="/about/glossary/#[a-z-]+">[^<]*${concept.plain.split(' ').slice(0, 2).join(' ')}`));
    }
  });

  it('names the six steps in order as prose, with no ordered list', () => {
    const cluster = section('The same stack on a cluster').toLowerCase();
    const order = ['allocation', 'start the coordinator', 'readiness gate', 'run the workers', 'verify the results', 'clean up'];
    const positions = order.map((phrase) => cluster.indexOf(phrase));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(body).not.toMatch(/^\s*\d+\.\s/m);
    expect(body).not.toContain('<ol');
  });

  it('separates the readiness gate from result verification', () => {
    const cluster = section('The same stack on a cluster');
    expect(cluster).toMatch(/can serve/i);
    expect(cluster).toMatch(/results are correct/i);
  });

  it('maps all six responsibilities, marking the unrun accelerator row', () => {
    const map = section('Map each responsibility');
    for (const row of ['service', 'image or build', 'dependency or health check', 'volume', 'port', 'device request']) {
      expect(map).toContain(`| ${row} |`);
    }
    expect(map).toContain(DESIGNED_NOT_RUN);
  });

  it('makes no tested claim and points at the untested list', () => {
    expect(body).not.toMatch(/Anvil|Expanse|Slurm \d|Apptainer \d|\b20\d\d\b|validated|tested on/i);
    expect(section('What varies by center')).toContain(`(${UNTESTED_HREF})`);
  });

  it('uses anchored glossary links and no layout-relative wording', () => {
    expect(body).not.toContain('](/about/glossary/)');
    expect(body).not.toMatch(/\b(?:above|below)\b/i);
  });

  it('keeps the frontmatter the registry needs', () => {
    expect(data.section_kinds).toEqual(['concept', 'limitations', 'next-steps']);
    expect(data.module_type).toBe('conceptual');
    expect(data.completion_check.kind).toBe('decision-exercise');
  });
});
