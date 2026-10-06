import { describe, expect, it } from 'vitest';
import { DESIGNED_NOT_RUN, REQUIRED_FRAGMENTS } from '../../site/src/content/contracts.js';
import { readItem } from './w6-content-helpers';

const { body } = readItem('about-glossary.md');
const ids = [...body.matchAll(/<dt id="([^"]+)"/g)].map((m) => m[1]);
const definition = (id: string): string => {
  const match = new RegExp(`<dt id="${id}"[^>]*>[\\s\\S]*?</dt>\\s*<dd>([\\s\\S]*?)</dd>`).exec(body);
  if (!match) throw new Error(`no glossary entry ${id}`);
  return match[1];
};

/** Every anchor that existed on the live glossary (v0.1.0 + the branch); none may disappear. */
const LEGACY_ANCHORS = [
  'allocation', 'batch-scheduler', 'job', 'job-step', 'coordinator', 'worker', 'orchestration-boundary',
  'reclamation', 'terminal-state', 'wall-time', 'bind', 'immutable-image', 'job-scoped-scratch', 'module-load',
  'rootless-runtime', 'checksum-sha-256', 'inert-input', 'loopback', 'readiness-check', 'semantic-readiness',
  'ssh-tunnel', 'success-marker', 'readiness-contract', 'verifier', 'workflow-package', 'teaching-excerpt',
  'applicability-record', 'release-pinned', 'demonstrator-vs-template',
];

describe('W6 glossary', () => {
  it('has unique anchors, including every required fragment and every legacy anchor', () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [...REQUIRED_FRAGMENTS.glossary, 'evidence-vocabulary', ...LEGACY_ANCHORS]) expect(ids).toContain(id);
  });

  it('lists the ten core terms first, in learning order', () => {
    expect(ids.slice(0, 10)).toEqual([
      'batch-scheduler', 'allocation', 'job-step', 'coordinator', 'worker',
      'readiness-gate', 'verification', 'job-scoped-scratch', 'loopback', 'ssh-tunnel',
    ]);
    expect([...REQUIRED_FRAGMENTS.glossary].sort()).toEqual([...ids.slice(0, 10)].sort());
  });

  it('keeps the readiness gate and verification apart', () => {
    const gate = definition('readiness-gate');
    expect(gate).toMatch(/coordinator/i);
    expect(gate).toMatch(/can serve/i);
    expect(gate).toMatch(/verification/i);
    const verification = definition('verification');
    expect(verification).toMatch(/results? (?:is|are) correct/i);
    expect(verification).toMatch(/readiness gate/i);
    expect(verification).toMatch(/Compose/);
  });

  it('draws each concept term with its utility class', () => {
    for (const [id, cls] of [['job-step', 'c-step'], ['readiness-gate', 'c-gate'], ['job-scoped-scratch', 'c-scratch'], ['loopback', 'c-net']]) {
      expect(body).toMatch(new RegExp(`<dt id="${id}"><strong class="${cls}">`));
    }
  });

  it('defines the evidence words with the exact label and names no system or date', () => {
    const start = body.indexOf('id="evidence-vocabulary"');
    const section = body.slice(start, body.indexOf('</dl>', start));
    expect(section).toContain(DESIGNED_NOT_RUN);
    expect(section).toContain('Tested');
    expect(section).toContain('Shim-tested');
    expect(section).not.toMatch(/Anvil|Expanse|Slurm \d|Apptainer \d|\b20\d\d\b/);
  });

  it('says loopback is the default and that wider access needs center approval', () => {
    expect(definition('loopback')).toMatch(/listen on it by default/);
    expect(definition('loopback')).toMatch(/access your center approves/);
  });

  it('names the evidence words with the exact labels', () => {
    expect(body).toContain(`<dt id="evidence-vocabulary"><strong>Tested, Shim-tested, ${DESIGNED_NOT_RUN}</strong></dt>`);
  });

  it('starts each core entry in plain language, not with the term', () => {
    for (const id of REQUIRED_FRAGMENTS.glossary) {
      const text = definition(id).replace(/<[^>]+>/g, '').trim();
      expect(text.length).toBeGreaterThan(40);
      expect(text).toMatch(/^(?:A|An|The|Your|Temporary|Local-only)\b/);
    }
  });
});
