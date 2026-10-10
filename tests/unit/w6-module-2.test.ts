import { describe, expect, it } from 'vitest';
import { DESIGNED_NOT_RUN, UNTESTED_HREF } from '../../site/src/content/contracts.js';
import { h2s, read, readItem } from './w6-content-helpers';

const { body, data } = readItem('02-baseline-single-node-pattern.md');
const section = (title: string): string => {
  const start = body.search(new RegExp(`^(?:## ${title}|<h2[^>]*>${title}</h2>)$`, 'm'));
  if (start < 0) throw new Error(`no section ${title}`);
  const next = body.slice(start + 1).search(/^(?:## |<h2)/m);
  return body.slice(start, next === -1 ? undefined : start + 1 + next);
};
const sbatch = read('workflows/baseline-slurm-apptainer/slurm/baseline.sbatch').split('\n');
const lines = (from: number, to: number): string => sbatch.slice(from - 1, to).join('\n');

describe('W6 Module 2', () => {
  it('follows the D12 section order (10 sections)', () => {
    expect(h2s(body)).toEqual([
      'Your Compose stack, before',
      'The same stack in one allocation',
      'How the baseline works',
      'Files the workflow reads and writes',
      'Procedure',
      'Expected result',
      'What varies by center',
      'Failure modes',
      'Adapt it',
      'Safety and scope limitations',
      'Key points',
    ]);
  });

  it('places the figures with slot markers inside "How the baseline works"', () => {
    for (const name of ['timeline', 'diagram-single-node-architecture', 'implementation-reference']) {
      expect(body.match(new RegExp(`^<!-- l2c:${name} -->$`, 'gm'))).toHaveLength(1);
    }
    const how = section('How the baseline works');
    const at = (name: string) => how.indexOf(`<!-- l2c:${name} -->`);
    expect(at('timeline')).toBeGreaterThan(0);
    expect(at('timeline')).toBeLessThan(how.indexOf('| Step |'));
    expect(at('diagram-single-node-architecture')).toBeGreaterThan(how.indexOf('| 6. Clean up'));
    expect(at('implementation-reference')).toBeGreaterThan(at('diagram-single-node-architecture'));
  });

  it('states exactly three goals', () => {
    expect(data.learning_outcomes).toHaveLength(3);
  });

  it('keeps the procedure heading id that SAFE-ORDERING looks for', () => {
    expect(body).toContain('<h2 id="procedure">Procedure</h2>');
  });

  it('says the verifier runs inside the job, and the cited lines agree with the script', () => {
    const how = section('How the baseline works');
    expect(how).toMatch(/inside the job/i);
    expect(how).toContain('245–251');
    expect(lines(245, 251)).toContain('verify.py');
    expect(lines(245, 251)).toContain('verification-success');
    expect(body).not.toMatch(/run the (?:workflow )?\[?verifier/i);
  });

  it('cites script lines that really contain what the table says they contain', () => {
    expect(lines(200, 206)).toContain('coordinator.py');
    expect(lines(219, 222)).toContain('readiness.py');
    expect(lines(228, 237)).toContain('worker.py');
    expect(lines(120, 120)).toContain('trap cleanup EXIT');
    for (const range of ['2–7', '123–198', '200–206', '208–225', '227–242', '243–251', '82–114']) {
      expect(section('How the baseline works')).toContain(range);
    }
  });

  it('answers the JSON question: machine-parsed, two human-authored, no contradiction', () => {
    const files = section('Files the workflow reads and writes');
    expect(files).toMatch(/machine-parsed|read by a program|read by programs/i);
    expect(files).toMatch(/two/i);
    for (const file of ['inputs/tasks.json', 'expected/results.json', 'container/image-lock.json', 'diagnostics.json', 'endpoint.json', 'results.json', 'result.json', 'events.jsonl']) {
      expect(files).toContain(`\`${file}\``);
    }
    expect(files).not.toMatch(/site \+ humans/i);
    expect(body).not.toMatch(/worker-results\.json|renames/i);
  });

  it('names the files a person opens, and describes diagnostics.json as a subset of the script IDs', () => {
    const files = section('Files the workflow reads and writes');
    expect(files).not.toMatch(/nothing in the pattern asks you to read them/i);
    expect(files).toMatch(/you open two to confirm success \(`result\.json`, `events\.jsonl`\)/);
    const listed = Object.values(JSON.parse(read('workflows/baseline-slurm-apptainer/diagnostics.json')).diagnostics as Record<string, string>);
    const printed = new Set([...sbatch.join('\n').matchAll(/"(BSSW-[A-Z-]+)"/g)].map(([, id]) => id));
    expect(listed.every((id) => printed.has(id))).toBe(true);
    expect(listed.length).toBeLessThan(printed.size);
    expect(files).toContain('a subset of the IDs in [Troubleshooting](/diagnostics/)');
  });

  it('labels the unrun forced stop and time-limit path in the cleanup row', () => {
    const row = section('How the baseline works').split('\n').find((line) => line.startsWith('| 6. Clean up'))!;
    expect(row).toContain(`**${DESIGNED_NOT_RUN}**`);
    expect(row).toMatch(/forced stop/);
    expect(row).toMatch(/time-limit path/);
  });

  it('puts readiness.py and common.py on the edit list, with the hard-coded contract lines', () => {
    const adapt = section('Adapt it');
    expect(adapt).toMatch(/\*\*12 files\*\*/);
    for (const file of ['slurm/baseline.sbatch', 'inputs/tasks.json', 'inputs/tasks.json.sha256', 'expected/results.json', 'bin/coordinator.py', 'bin/worker.py', 'bin/verify.py', 'bin/validate_input.py', 'bin/readiness.py', 'bin/common.py', 'container/Apptainer.def', 'container/image-lock.json']) {
      expect(adapt).toContain(`\`${file}\``);
    }
    expect(adapt).not.toMatch(/Left unchanged:[^.]*readiness\.py/);
    expect(adapt).toContain('lines 29–31');
    expect(adapt).toContain('lines 27–28');
    const readiness = read('workflows/baseline-slurm-apptainer/bin/readiness.py').split('\n');
    expect(readiness.slice(28, 31).join('\n')).toContain('"status": "ready"');
    const coordinator = read('workflows/baseline-slurm-apptainer/bin/coordinator.py').split('\n');
    expect(coordinator.slice(26, 28).join('\n')).toContain('"status": "ready"');
  });

  it('lists all 14 adapter variables from the package README', () => {
    const readme = read('workflows/baseline-slurm-apptainer/README.md');
    const variables = [...readme.matchAll(/^\| `((?:BSSW_)?[A-Z0-9_]+)` \|/gm)].map((m) => m[1]).filter((name) => name !== 'BSSW_APP_ROOT' && name !== 'BSSW_KILL_CMD');
    expect(variables).toHaveLength(14);
    for (const name of variables) expect(section('Adapt it')).toContain(`\`${name}\``);
  });

  it('shows no expected-output hash, no system, no version and no date', () => {
    expect(body).not.toMatch(/[0-9a-f]{64}|sha256:/);
    expect(body).not.toMatch(/Anvil|Expanse|Slurm \d|Apptainer \d|\b20\d\d\b|v0\.2\.0|rc\.1/);
  });

  it('uses the exact unrun label, links the untested list, and never says above or below', () => {
    expect(section('Safety and scope limitations')).toContain(DESIGNED_NOT_RUN);
    expect(section('Safety and scope limitations')).toContain(`(${UNTESTED_HREF})`);
    expect(body).not.toMatch(/\b(?:above|below)\b/i);
    expect(body).toContain('(#implementation-reference)');
  });

  it('never names the program reviewer', () => {
    expect(body).not.toMatch(/Elsa|Gonsiorowski|reviewer|requested/i);
  });

  it('links failure modes to the printed diagnostic IDs', () => {
    const failures = section('Failure modes');
    for (const id of ['preq-slurm', 'preq-apptainer', 'preq-storage', 'integrity-input', 'integrity-image', 'ready-timeout', 'worker-exit', 'verify-result']) {
      expect(failures).toContain(`(/diagnostics/#bssw-${id})`);
      expect(failures).toContain(`BSSW-${id.toUpperCase()}`);
    }
  });

  it('keeps the frontmatter the registry needs', () => {
    expect(data.section_kinds).toEqual(['concept', 'procedure', 'expected-result', 'limitations', 'next-steps']);
    expect(data.module_type).toBe('runnable');
    expect(body).not.toContain('](/about/glossary/)');
  });
});
