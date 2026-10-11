import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { currentRecord } from '../../site/src/content/projections.js';
import { applicabilityRecordSchema } from '../../site/src/content/schema.js';

const readme = readFileSync('workflows/baseline-slurm-apptainer/README.md', 'utf8');
const directory = 'site/src/content/applicability';
const records = readdirSync(directory).filter((name) => /\.ya?ml$/.test(name))
  .map((name) => applicabilityRecordSchema.parse(parse(readFileSync(`${directory}/${name}`, 'utf8'))));
const validationLines = readme.split('\n').filter((line) => line.startsWith('Validation record:'));

describe('baseline workflow README', () => {
  it('no longer says the workflow has not been run', () => {
    expect(readme).not.toMatch(/NOT RUN|Neither has happened yet|unbuilt on real metal/i);
  });

  it('links the canonical page of the current applicability record, once', () => {
    expect(validationLines).toHaveLength(1);
    const match = /^Validation record: https:\/\/laptop-to-cluster\.org\/applicability\/([a-z0-9-]+)\/$/.exec(validationLines[0]);
    expect(match, validationLines[0]).not.toBeNull();
    expect(match![1]).toBe(currentRecord(records)?.id);
  });

  it('restates no system, version, or date next to the link', () => {
    expect(validationLines[0].replace(/https:\/\/\S+/, '')).not.toMatch(/Anvil|Expanse|Slurm|Apptainer|\d{4}-\d{2}-\d{2}|\d+\.\d+/i);
  });

  it('checks the input checksum from the inputs directory, where the sidecar names a bare file', () => {
    expect(readme).not.toMatch(/sha256sum -c workflows\//);
    expect(readme).toMatch(/\(cd workflows\/baseline-slurm-apptainer\/inputs && sha256sum -c tasks\.json\.sha256\)/);
  });

  it('submits with absolute paths because Slurm runs a spooled copy of the script', () => {
    const submit = readme.split('\n').filter((line) => /^\s*(WORKFLOW|sbatch)/.test(line) || line.includes('sbatch --export'));
    expect(readme).not.toMatch(/^sbatch workflows\/baseline-slurm-apptainer\/slurm\/baseline\.sbatch$/m);
    expect(submit.join('\n')).toMatch(/sbatch --export=ALL,BSSW_SCRATCH_ROOT=<path>,INPUT_PATH=.*EXPECTED_PATH=.*IMAGE_PATH=.*INPUT_SHA256_FILE=/);
  });
});
