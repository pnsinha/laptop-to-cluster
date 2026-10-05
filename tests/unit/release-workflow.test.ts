import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = fileURLToPath(new URL('../..', import.meta.url));
const text = readFileSync(`${root}/.github/workflows/release.yml`, 'utf8');
const workflow = parse(text) as any;
const steps = (job: string): any[] => workflow.jobs[job].steps;
const find = (job: string, predicate: (step: any) => boolean) => steps(job).find(predicate);

describe('release workflow: job graph and triggers', () => {
  it('has the contract job chain', () => {
    expect(Object.keys(workflow.jobs)).toEqual(['plan', 'build-once', 'deploy-preview', 'deploy', 'post-deploy-release-checks']);
    expect(workflow.jobs['build-once'].needs).toBe('plan');
    expect(workflow.jobs['deploy-preview'].needs).toEqual(['plan', 'build-once']);
    expect(workflow.jobs.deploy.needs).toEqual(['plan', 'build-once']);
    expect(workflow.jobs['post-deploy-release-checks'].needs).toEqual(['plan', 'deploy']);
  });

  it('previews on a push to the showcase branch and on version tags, never the frozen tag', () => {
    expect(workflow.on.push.branches).toContain('v0.2.0-showcase');
    expect(workflow.on.push.tags).toEqual(['v[0-9]+.[0-9]+.[0-9]+', 'v[0-9]+.[0-9]+.[0-9]+-rc.[0-9]+', '!v0.1.0']);
    expect(text.match(/v0\.1\.0/g)).toHaveLength(1);
  });

  it('plans mode, version, date and artifact names once', () => {
    const outputs = workflow.jobs.plan.outputs;
    for (const key of ['mode', 'version', 'date', 'artifact-name', 'record-name']) expect(outputs).toHaveProperty(key);
    expect(workflow.jobs.plan.steps.find((s: any) => s.id === 'plan').run).toContain('validated-site-${VERSION}-${GITHUB_SHA}');
  });
});

describe('release workflow: build once', () => {
  it('validates with full history and uploads a version-named artifact', () => {
    const checkout = find('build-once', (step) => String(step.uses).startsWith('actions/checkout@'));
    expect(checkout.with['fetch-depth']).toBe(0);
    const validates = steps('build-once').filter((step) => /npm run validate\b(?!:)/.test(step.run ?? ''));
    expect(validates).toHaveLength(1);
    const builds = steps('build-once').filter((step) => /npm run build\b/.test(step.run ?? ''));
    expect(builds).toHaveLength(0);
    const upload = find('build-once', (step) => String(step.uses).startsWith('actions/upload-artifact@'));
    expect(upload.with.name).toBe('${{ needs.plan.outputs.artifact-name }}');
    expect(workflow.jobs['build-once'].env.RELEASE_VERSION).toBe('${{ needs.plan.outputs.version }}');
    expect(workflow.jobs['build-once'].env.PREVIEW).toContain("needs.plan.outputs.mode == 'preview'");
  });

  it('maps the boundary pattern on the validate step only', () => {
    const gate = find('build-once', (step) => step.run === 'npm run validate');
    expect(gate.env.L2C_BOUNDARY_PATTERN).toBe('${{ secrets.L2C_BOUNDARY_PATTERN }}');
    expect(workflow.env).toBeUndefined();
    expect(text.match(/secrets\.L2C_BOUNDARY_PATTERN/g)).toHaveLength(1);
  });
});

describe('release workflow: deploy paths', () => {
  it('deploys the retained artifact to the preview alias only in preview mode', () => {
    const job = workflow.jobs['deploy-preview'];
    expect(job.if).toContain("== 'preview'");
    const deploy = find('deploy-preview', (step) => String(step.uses).startsWith('cloudflare/wrangler-action@'));
    expect(deploy.with.command).toContain('pages deploy site/dist');
    expect(deploy.with.command).toContain('--branch=preview');
    expect(deploy.with.command).not.toContain('--branch=main');
    expect(deploy.with.apiToken).toBe('${{ secrets.CLOUDFLARE_API_TOKEN }}');
    expect(deploy.with.accountId).toBe('${{ secrets.CLOUDFLARE_ACCOUNT_ID }}');
    expect(deploy.with.command).toContain('${{ vars.CLOUDFLARE_PAGES_PROJECT }}');
  });

  it('deploys to production only in production mode', () => {
    const job = workflow.jobs.deploy;
    expect(job.if).toContain("== 'production'");
    expect(job.environment).toBe('production');
    const deploy = find('deploy', (step) => String(step.uses).startsWith('cloudflare/wrangler-action@'));
    expect(deploy.with.command).toContain('--branch=main');
    expect(deploy.with.command).not.toContain('--branch=preview');
    expect(text.match(/--branch=main/g)).toHaveLength(1);
    expect(text.match(/--branch=preview/g)).toHaveLength(1);
    const names = steps('deploy').map((step) => step.run ?? '').join('\n');
    expect(names).toContain('generate-release-record.mjs');
    expect(names).toContain('update-recovery-index.mjs');
    expect(JSON.stringify(workflow.jobs['deploy-preview'])).not.toContain('generate-release-record');
  });

  it('keeps the build-once rule: deploy jobs download and verify, never install or build', () => {
    for (const name of ['deploy-preview', 'deploy']) {
      const body = JSON.stringify(workflow.jobs[name]);
      expect(body).toContain('actions/download-artifact@');
      expect(body).toContain('publication.mjs verify');
      expect(body).not.toMatch(/npm (?:ci|install)|astro (?:build|sync|check)|npm run build/);
    }
  });

  it('pins every action to an exact version and holds read-only permissions', () => {
    const uses = [...text.matchAll(/uses:\s*([^\s]+)/g)].map((match) => match[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const reference of uses) expect(reference).toMatch(/@v\d+\.\d+\.\d+$/);
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(text).not.toMatch(/:\s*write\b/);
  });
});
