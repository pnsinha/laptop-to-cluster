import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { h2s, read, readItem } from './w6-content-helpers';

const { body, data } = readItem('getting-started.md');
const section = (title: string): string => {
  const start = body.indexOf(`## ${title}`);
  if (start < 0) throw new Error(`no section ${title}`);
  const next = body.indexOf('\n## ', start + 1);
  return body.slice(start, next === -1 ? undefined : next);
};
const workflow = (path: string) => `workflows/baseline-slurm-apptainer/${path}`;
const SBATCH_COMMAND = /sbatch --export=ALL,BSSW_SCRATCH_ROOT=<path>[^\n]* slurm\/baseline\.sbatch/;

describe('W6 Run the example', () => {
  it('is titled "Run the example" and keeps the /start/ route inputs', () => {
    expect(data.title).toBe('Run the example');
    expect(data.route_namespace).toBe('start');
    expect(data.stable_slug).toBe('getting-started');
  });

  it('has the ten sections, in running order', () => {
    expect(h2s(body)).toEqual([
      'Can I run this?', 'Get the code', 'Check the prerequisites', 'Record your local values', 'Get the container image',
      'Check the input', 'Submit the job', 'Check that it worked', 'Copy your results out', 'If it still fails',
    ]);
  });

  it('starts with Get the code: a clone at the release token, and an honest statement about what changed', () => {
    const code = section('Get the code');
    expect(code).toContain('git clone --branch @release https://github.com/pnsinha/laptop-to-cluster.git && cd laptop-to-cluster');
    expect(code).toContain('only its README changed');
    expect(section('Get the container image')).toContain('(#get-the-code)');
  });

  it('warns that some centers do not allow an unprivileged image build, without changing the package', () => {
    const image = section('Get the container image');
    expect(image).toContain('Some centers do not allow an unprivileged `apptainer build`.');
    expect(image).toContain('could not build the image without extra privileges');
    expect(image).toContain('the test used the earlier build with the same digest');
    expect(image).toContain('rather than a BSSW ID');
    expect(image).toContain('If a check in the script fails, it prints a `BSSW-PREQ-*` or `BSSW-INTEGRITY-*` ID');
    expect(image).not.toContain('If the script fails');
  });

  it('tells readers to get the image with acquire.sh, a script that exists', () => {
    expect(section('Get the container image')).toContain(workflow('container/acquire.sh'));
    expect(existsSync(new URL(`../../${workflow('container/acquire.sh')}`, import.meta.url))).toBe(true);
  });

  it('checks the input from inside inputs/, matching how the sidecar names its file', () => {
    expect(section('Check the input')).toContain('(cd inputs && sha256sum -c tasks.json.sha256)');
    expect(read(workflow('inputs/tasks.json.sha256'))).toMatch(/^[0-9a-f]{64} {2}tasks\.json\n?$/);
  });

  it('gives the exact sbatch command, and every exported variable is a real adapter variable', () => {
    const submit = section('Submit the job');
    const command = SBATCH_COMMAND.exec(submit)?.[0];
    expect(command).toBeDefined();
    const readme = read(workflow('README.md'));
    const exported = [...command!.matchAll(/([A-Z][A-Z0-9_]+)=/g)].map((m) => m[1]).filter((name) => name !== 'ALL');
    expect(exported).toEqual(expect.arrayContaining(['BSSW_SCRATCH_ROOT', 'IMAGE_PATH', 'INPUT_PATH', 'INPUT_SHA256_FILE', 'EXPECTED_PATH']));
    for (const name of exported) expect(readme).toContain(`\`${name}\``);
    expect(submit).toMatch(/spool/i);
  });

  it('says where output lands, and the script really writes there', () => {
    const worked = section('Check that it worked');
    expect(worked).toContain('slurm-<job id>.out');
    expect(worked).toContain('bssw-<job id>');
    const script = read(workflow('slurm/baseline.sbatch'));
    expect(script).toContain('#SBATCH --output=slurm-%j.out');
    expect(script).toContain('bssw-${SLURM_JOB_ID}');
  });

  it('defines success by result.json status and the event order, and those events exist in the script', () => {
    const worked = section('Check that it worked');
    expect(worked).toContain('result.json');
    expect(worked).toContain('"status": "success"');
    expect(worked).toContain('coordinator-ready');
    expect(worked).toContain('worker-start');
    expect(worked).toMatch(/zero exit/i);
    const script = read(workflow('slurm/baseline.sbatch'));
    expect(script).toContain('emit_event "coordinator-ready"');
    expect(script).toContain('emit_event "worker-start"');
  });

  it('explains how to copy results out', () => {
    expect(section('Copy your results out')).toMatch(/cp -r .*bssw-<job id>/);
  });

  it('has a local-values table with a "How to find it" column and at least eight rows', () => {
    const lines = section('Record your local values').split('\n').filter((line) => line.startsWith('|'));
    expect(lines[0].replace(/\s+/g, ' ')).toBe('| Value | What it is | How to find it |');
    const rows = lines.slice(2);
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const row of rows) {
      const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
      expect(cells).toHaveLength(3);
      expect(cells.every((cell) => cell.length > 0)).toBe(true);
    }
  });

  it('links failures to printed diagnostic IDs only, and glossary terms to anchors', () => {
    expect(body).not.toMatch(/diagnostics\/#bssw-(?:prereq|storage-unavailable|readiness)/);
    expect(body).toContain('(/diagnostics/#bssw-preq-slurm)');
    expect(body).toContain('(/diagnostics/#bssw-ready-timeout)');
    expect(body).not.toContain('](/about/glossary/)');
    expect(body).not.toContain('how-to-use-this-guide');
  });

  it('claims no test result of its own, beyond the one dated limitation about the image build', () => {
    const buildNote = /On the Apptainer used for the October 2026 test, this script could not build the image without extra privileges, and the test used the earlier build with the same digest\./;
    expect(body).toMatch(buildNote);
    expect(body.replace(buildNote, '')).not.toMatch(/Anvil|Expanse|\b20\d\d\b|validated|tested on/i);
    expect(body).not.toMatch(/Anvil|Expanse|validated|tested on/i);
  });
});
