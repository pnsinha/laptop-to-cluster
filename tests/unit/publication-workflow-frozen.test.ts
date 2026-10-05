import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { validateDeploymentWorkflow } from '../../scripts/publication.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const text = readFileSync(`${root}/.github/workflows/publication.yml`, 'utf8');
const workflow = parse(text) as any;

describe('publication.yml stays frozen for the first release', () => {
  it('is triggered only by the first release tag or a manual dispatch for it', () => {
    expect(workflow.on.push.tags).toEqual(['v0.1.0']);
    expect(workflow.on.workflow_dispatch.inputs.release.default).toBe('v0.1.0');
    expect(Object.keys(workflow.jobs)).toEqual(['build-once', 'deploy', 'post-deploy-release-checks']);
  });

  it('checks out the frozen tag in every job, so a dispatch can never redeploy main', () => {
    for (const [name, job] of Object.entries<any>(workflow.jobs)) {
      const checkouts = job.steps.filter((step: any) => String(step.uses).startsWith('actions/checkout@'));
      expect(checkouts.length, name).toBe(1);
      expect(checkouts[0].with.ref, name).toBe('refs/tags/v0.1.0');
    }
    expect(workflow.jobs['build-once'].steps[0].with['fetch-depth']).toBe(0);
  });

  it('refuses any run whose recorded commit is not the checked-out frozen tag', () => {
    const guard = workflow.jobs['build-once'].steps[1];
    expect(guard.uses).toBeUndefined();
    expect(guard.run).toContain('"$(git rev-parse HEAD)" != "$GITHUB_SHA"');
    expect(guard.run).toContain('exit 1');
    expect(guard.run).toContain('gh workflow run publication.yml --ref v0.1.0');
  });

  it('still publishes v0.1.0 to production by Direct Upload and passes the deployment policy', () => {
    expect(validateDeploymentWorkflow(text)).toEqual([]);
    expect(text).toContain('--branch=main');
    expect(text).toContain('RELEASE_VERSION: v0.1.0');
    expect(text).toContain('validated-site-v0.1.0-');
    expect(text).toContain('release-record-v0.1.0-');
  });
});
