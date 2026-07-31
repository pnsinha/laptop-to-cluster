import { describe, expect, it } from 'vitest';
import { IMPLEMENTATION_REFERENCE } from '../../site/src/content/implementation.js';

describe('release-pinned implementation reference', () => {
  it('loads the expected workflow source excerpts with immutable metadata', () => {
    expect(IMPLEMENTATION_REFERENCE.workflowId).toBe('module-2-baseline');
    expect(IMPLEMENTATION_REFERENCE.release).toBe('v0.1.0');
    expect(IMPLEMENTATION_REFERENCE.primarySourceUrl).toContain('/blob/v0.1.0/workflows/baseline-slurm-apptainer/slurm/baseline.sbatch');
    expect(IMPLEMENTATION_REFERENCE.excerpts).toHaveLength(6);
    for (const excerpt of IMPLEMENTATION_REFERENCE.excerpts) {
      expect(excerpt.integrity).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(excerpt.code.length).toBeGreaterThan(0);
      expect(excerpt.sourceUrl).toContain('/blob/v0.1.0/');
      expect(excerpt.sourceUrl).toContain(`#L${excerpt.lineStart}-L${excerpt.lineEnd}`);
    }
  });

  it('renders a sanitized success marker example with result-based completion', () => {
    expect(IMPLEMENTATION_REFERENCE.expectedOutput).toContain('"status": "success"');
    expect(IMPLEMENTATION_REFERENCE.expectedOutput).toContain('"taskCount": 4');
    expect(IMPLEMENTATION_REFERENCE.expectedOutput).not.toMatch(/submissionId|containerDigest|SLURM_JOB_ID|\/home\//i);
  });
});
