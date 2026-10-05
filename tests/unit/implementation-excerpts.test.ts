import { describe, expect, it } from 'vitest';
import { IMPLEMENTATION_REFERENCE } from '../../site/src/content/implementation.js';

describe('implementation reference carries code excerpts only', () => {
  it('has no expected-output payload and no digest values anywhere', () => {
    expect(IMPLEMENTATION_REFERENCE).not.toHaveProperty('expectedOutput');
    const serialized = JSON.stringify(IMPLEMENTATION_REFERENCE);
    expect(serialized).not.toMatch(/"sha256"\s*:/);
    expect(serialized).not.toMatch(/[a-f0-9]{64}/);
  });

  it('keeps the six release-pinned excerpts and the package links', () => {
    expect(IMPLEMENTATION_REFERENCE.excerpts).toHaveLength(6);
    expect(IMPLEMENTATION_REFERENCE.packageUrl).toContain('/tree/v0.1.0/workflows/baseline-slurm-apptainer');
    expect(IMPLEMENTATION_REFERENCE.primarySourceUrl).toContain('/blob/v0.1.0/workflows/baseline-slurm-apptainer/slurm/baseline.sbatch');
  });
});
