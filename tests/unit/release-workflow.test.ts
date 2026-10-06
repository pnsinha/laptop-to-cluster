import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { validateDeploymentWorkflow, validateReleaseWorkflow } from '../../scripts/publication.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const text = readFileSync(`${root}/.github/workflows/release.yml`, 'utf8');
const workflow = parse(text) as any;
const jobs = workflow.jobs as Record<string, any>;
const steps = (job: string): any[] => jobs[job].steps;
const find = (job: string, predicate: (step: any) => boolean) => steps(job).find(predicate);
const uses = (job: string, prefix: string) => steps(job).filter((step) => String(step.uses ?? '').startsWith(prefix));
const count = (pattern: RegExp) => text.match(pattern)?.length ?? 0;

describe('release workflow: triggers', () => {
  it('previews on the showcase branch and on release-candidate tags, publishes exact tags, and excludes the frozen release', () => {
    expect(workflow.on.push.branches).toEqual(['v0.2.0-showcase']);
    expect(workflow.on.push.tags).toEqual(['v[0-9]+.[0-9]+.[0-9]+', 'v[0-9]+.[0-9]+.[0-9]+-rc.[0-9]+', '!v0.1.0']);
  });

  it('offers a manual dispatch that needs a release input', () => {
    expect(workflow.on.workflow_dispatch.inputs.release.required).toBe(true);
  });

  it('names the frozen release only in its exclusion', () => {
    expect(count(/v0\.1\.0/g)).toBe(1);
  });

  /* Evaluates the two concurrency expressions for one trigger, the way Actions would. */
  const concurrencyFor = (event: string, refType: 'branch' | 'tag', refName: string) => {
    const ref = refType === 'branch' ? `refs/heads/${refName}` : `refs/tags/${refName}`;
    const production = event === 'workflow_dispatch' || (refType === 'tag' && !refName.includes('-rc.'));
    return {
      group: production ? 'release-production' : `release-${ref}`,
      cancel: event === 'push' && refType === 'branch',
    };
  };

  it('cancels superseded branch previews but never an in-flight tag or dispatch run', () => {
    expect(workflow.concurrency.group).toBe("${{ (github.event_name == 'workflow_dispatch' || (github.ref_type == 'tag' && !contains(github.ref_name, '-rc.'))) && 'release-production' || format('release-{0}', github.ref) }}");
    expect(workflow.concurrency['cancel-in-progress']).toBe("${{ github.event_name == 'push' && github.ref_type == 'branch' }}");
    expect(concurrencyFor('push', 'branch', 'v0.2.0-showcase')).toEqual({ group: 'release-refs/heads/v0.2.0-showcase', cancel: true });
    expect(concurrencyFor('push', 'tag', 'v0.2.0-rc.1')).toEqual({ group: 'release-refs/tags/v0.2.0-rc.1', cancel: false });
    /* A dispatch from main and the exact tag push both deploy production: one group, never cancelled. */
    expect(concurrencyFor('workflow_dispatch', 'branch', 'main')).toEqual({ group: 'release-production', cancel: false });
    expect(concurrencyFor('push', 'tag', 'v0.2.0')).toEqual({ group: 'release-production', cancel: false });
  });

  it('puts every production-capable run (dispatch or final tag) in one shared group', () => {
    const group = String(workflow.concurrency.group);
    expect(group).toContain("github.event_name == 'workflow_dispatch'");
    expect(group).toContain("github.ref_type == 'tag' && !contains(github.ref_name, '-rc.')");
    expect(group).toContain("'release-production'");
    expect(group).toContain("format('release-{0}', github.ref)");
  });

  it('installs poppler-utils in the build job before any validator runs', () => {
    const steps = jobs['build-once'].steps;
    const poppler = steps.findIndex((step: any) => /apt-get install -y poppler-utils/.test(step.run ?? ''));
    expect(poppler).toBeGreaterThanOrEqual(0);
    expect(steps[poppler].run).toContain('pdftotext -v');
    expect(poppler).toBeLessThan(steps.findIndex((step: any) => /npm run validate|publication:validate/.test(step.run ?? '')));
  });

  it('passes the planned SHA to the build so the release record names the built commit', () => {
    expect(jobs['build-once'].env.RELEASE_SHA).toBe('${{ needs.plan.outputs.sha }}');
  });
});

describe('release workflow: planning', () => {
  it('lets the planner decide, and checks out the tag only for a manual dispatch', () => {
    expect(jobs).toHaveProperty(['plan']);
    const plan = find('plan', (step) => step.id === 'plan');
    expect(plan.run).toContain('RELEASE_SHA="$(git rev-parse HEAD)" node scripts/release-plan.mjs . > "$RUNNER_TEMP/plan.txt"');
    // The default step shell has no pipefail: a pipe into tee would hide a planner failure.
    expect(plan.run).not.toMatch(/\|\s*tee/);
    expect(plan.run).toContain('>> "$GITHUB_OUTPUT"');
    expect(plan.env.INPUT_RELEASE).toBe('${{ inputs.release }}');
    const checkout = uses('plan', 'actions/checkout@')[0];
    expect(checkout.with['fetch-depth']).toBe(0);
    expect(checkout.with.ref).toContain("format('refs/tags/{0}', inputs.release)");
  });

  it('requires a production release to be on main', () => {
    const gate = find('plan', (step) => /merge-base --is-ancestor HEAD origin\/main/.test(step.run ?? ''));
    expect(gate.if).toBe("steps.plan.outputs.mode == 'production'");
  });

  it('exports every plan output the later jobs read', () => {
    for (const key of ['mode', 'version', 'date', 'sha', 'preview', 'full-gate', 'artifact-name', 'record-artifact-name']) {
      expect(jobs.plan.outputs[key]).toBe(`\${{ steps.plan.outputs.${key} }}`);
    }
  });

  it('pins every later job to the planned commit, never to a movable ref', () => {
    for (const job of ['build-once', 'deploy-preview', 'deploy', 'post-deploy-release-checks']) {
      for (const checkout of uses(job, 'actions/checkout@')) expect(checkout.with.ref, job).toBe('${{ needs.plan.outputs.sha }}');
    }
  });

  it('checks out with full history in every job', () => {
    const checkouts = Object.values(jobs).flatMap((job) => job.steps.filter((step) => String(step.uses ?? '').startsWith('actions/checkout@')));
    expect(checkouts.length).toBe(5);
    for (const step of checkouts) expect(step.with['fetch-depth']).toBe(0);
  });
});

describe('release workflow: the one build', () => {
  it('maps the plan into RELEASE_VERSION, RELEASE_DATE, PREVIEW and RELEASE_SHA', () => {
    expect(jobs['build-once'].env).toEqual({
      RELEASE_VERSION: '${{ needs.plan.outputs.version }}', RELEASE_DATE: '${{ needs.plan.outputs.date }}', PREVIEW: '${{ needs.plan.outputs.preview }}',
      RELEASE_SHA: '${{ needs.plan.outputs.sha }}',
    });
  });

  it('runs the whole chain for tags and the fast gate for branch pushes, and never both', () => {
    const full = find('build-once', (step) => step.run === 'npm run validate');
    const fast = find('build-once', (step) => /npm run build/.test(step.run ?? ''));
    expect(full.if).toBe("needs.plan.outputs.full-gate == 'true'");
    expect(fast.if).toBe("needs.plan.outputs.full-gate != 'true'");
    expect(fast.run).toContain('npm run publication:validate');
    expect(fast.run).toContain('npm run publication:prepare');
  });

  it('requires a signed accessibility review for production only', () => {
    const review = find('build-once', (step) => /validate-accessibility-review/.test(step.run ?? ''));
    expect(review.if).toBe("needs.plan.outputs.mode == 'production'");
    expect(review.run).toContain('--require-complete');
    expect(review.run).not.toMatch(/releases\//);
  });

  it('maps the boundary pattern on the two gate steps only', () => {
    expect(count(/secrets\.L2C_BOUNDARY_PATTERN/g)).toBe(2);
    expect(workflow.env).toBeUndefined();
    for (const [name, job] of Object.entries(jobs)) expect(job.env?.L2C_BOUNDARY_PATTERN, name).toBeUndefined();
    for (const step of steps('build-once').filter((entry) => entry.env?.L2C_BOUNDARY_PATTERN)) {
      expect(step.env.L2C_BOUNDARY_PATTERN).toBe('${{ secrets.L2C_BOUNDARY_PATTERN }}');
      expect(step.run).toMatch(/npm run (?:validate|publication:validate)/);
    }
  });

  it('uploads a version-named artifact, kept longer for production', () => {
    const upload = uses('build-once', 'actions/upload-artifact@')[0];
    expect(upload.with.name).toBe('${{ needs.plan.outputs.artifact-name }}');
    expect(upload.with.path).toContain('publication/${{ needs.plan.outputs.version }}/');
    expect(upload.with['retention-days']).toBe("${{ needs.plan.outputs.mode == 'production' && 90 || 30 }}");
  });
});

describe('release workflow: deployment', () => {
  const wrangler = (job: string) => find(job, (step) => String(step.uses).startsWith('cloudflare/wrangler-action@'));

  it('sends previews to the preview alias and production to main, each exactly once', () => {
    expect(jobs['deploy-preview'].if).toBe("needs.plan.outputs.mode == 'preview'");
    expect(jobs.deploy.if).toBe("needs.plan.outputs.mode == 'production'");
    expect(wrangler('deploy-preview').with.command).toContain('--branch=preview');
    expect(wrangler('deploy-preview').with.command).not.toContain('--branch=main');
    expect(wrangler('deploy').with.command).toContain('--branch=main');
    expect(wrangler('deploy').with.command).not.toContain('--branch=preview');
    expect(count(/--branch=main/g)).toBe(1);
    expect(count(/--branch=preview/g)).toBe(1);
    for (const job of ['deploy-preview', 'deploy']) {
      expect(wrangler(job).with.command).toContain('--commit-hash=${{ needs.plan.outputs.sha }}');
      expect(wrangler(job).with.apiToken).toBe('${{ secrets.CLOUDFLARE_API_TOKEN }}');
      expect(wrangler(job).with.accountId).toBe('${{ secrets.CLOUDFLARE_ACCOUNT_ID }}');
    }
  });

  it('satisfies the existing build-once deployment policy for the production job', () => {
    expect(validateDeploymentWorkflow(text)).toEqual([]);
  });

  it('passes the A11/A18 release-workflow policy', () => {
    expect(validateReleaseWorkflow(text)).toEqual([]);
  });

  it('never installs or builds in a deploy job', () => {
    for (const job of ['deploy-preview', 'deploy']) {
      const body = JSON.stringify(jobs[job]);
      expect(body, job).toContain('actions/download-artifact@');
      expect(body, job).toContain('publication.mjs verify');
      expect(body, job).not.toMatch(/npm (?:ci|install)|astro (?:build|sync|check)|npm run (?:build|validate)/);
    }
  });

  it('writes release records, and updates the recovery index, in the production job only', () => {
    for (const script of ['generate-release-record.mjs', 'update-recovery-index.mjs', 'cloudflare-readiness']) {
      expect(JSON.stringify(jobs.deploy), script).toContain(script);
      expect(JSON.stringify(jobs['deploy-preview']), script).not.toContain(script);
    }
    expect(jobs.deploy.environment).toBe('production');
    expect(jobs['deploy-preview'].environment).toBeUndefined();
    const record = uses('deploy', 'actions/upload-artifact@')[0];
    expect(record.with.name).toBe('${{ needs.plan.outputs.record-artifact-name }}');
    expect(record.with['retention-days']).toBe(90);
  });

  it('checks the live apex after production deploys, including that it serves this release', () => {
    expect(jobs['post-deploy-release-checks'].needs).toEqual(['plan', 'deploy']);
    const body = JSON.stringify(jobs['post-deploy-release-checks']);
    expect(body).toContain('check-public-release.mjs');
    expect(body).toContain('verify-live-release.mjs');
    expect(body).toContain('RELEASE_VERSION');
    expect(body).toContain('${{ needs.deploy.outputs.pages-url }}');
  });
});

describe('release workflow: hygiene', () => {
  it('pins every action to an exact version and holds read-only permissions', () => {
    const refs = [...text.matchAll(/uses:\s*([^\s]+)/g)].map((match) => match[1]);
    expect(refs.length).toBeGreaterThan(8);
    for (const reference of refs) expect(reference).toMatch(/@v\d+\.\d+\.\d+$/);
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(text).not.toMatch(/:\s*write\b/);
    expect(text).not.toContain('pull_request_target');
  });

  it('never expands a GitHub expression inside a shell script', () => {
    for (const [name, job] of Object.entries(jobs)) {
      for (const step of job.steps) if (step.run) expect(step.run, `${name}: ${step.name ?? step.run.slice(0, 40)}`).not.toContain('${{');
    }
  });
});
