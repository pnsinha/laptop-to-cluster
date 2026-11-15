import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = fileURLToPath(new URL('../..', import.meta.url));
const text = readFileSync(`${root}/../.github/workflows/rollback.yml`, 'utf8');
const workflow = parse(text) as any;
const content: any[] = workflow.jobs['recover-content'].steps;
const policy: any[] = workflow.jobs['recover-hostname-policy'].steps;

describe('rollback.yml: version-parametrised recovery', () => {
  it('requires the release being recovered, with no default', () => {
    expect(workflow.on.workflow_dispatch.inputs.release.required).toBe(true);
    expect(workflow.on.workflow_dispatch.inputs.release.default).toBeUndefined();
    expect(text).not.toMatch(/v0\.\d+\.\d+/);
  });

  it('validates the release and commit before it uses either', () => {
    for (const steps of [content, policy]) {
      expect(steps[0].name).toBe('Check the requested release and commit');
      expect(steps[0].env).toEqual({ RELEASE: '${{ inputs.release }}', SOURCE_COMMIT: '${{ inputs.source-commit }}' });
      expect(steps[0].run).toContain('^v[0-9]+\\.[0-9]+\\.[0-9]+$');
      expect(steps[0].run).toContain('^[0-9a-f]{40}$');
    }
  });

  it('downloads the artifacts of the requested release into the requested release directory', () => {
    const downloads = content.filter((step) => String(step.uses).startsWith('actions/download-artifact@'));
    expect(downloads.map((step) => step.with.name)).toEqual([
      'validated-site-${{ inputs.release }}-${{ inputs.source-commit }}',
      'release-record-${{ inputs.release }}-${{ inputs.source-commit }}',
    ]);
    expect(downloads[0].with.path).toBe('${{ steps.layout.outputs.root }}');
    expect(downloads[1].with.path).toBe('${{ steps.layout.outputs.root }}/publication/${{ inputs.release }}');
  });

  it('detects the layout of the source commit, so releases cut before the website/ move stay recoverable', () => {
    for (const steps of [content, policy]) {
      const checkout = steps.findIndex((step) => String(step.uses).startsWith('actions/checkout@'));
      expect(steps[checkout + 1].id).toBe('layout');
      expect(steps[checkout + 1].run).toContain('[ -d website ]');
      expect(steps[checkout + 1].run).toContain("echo 'dist=site/dist'");
      expect(steps.slice(0, checkout).every((step) => step['working-directory'] === undefined)).toBe(true);
    }
    expect(workflow.defaults).toBeUndefined();
    expect(content.find((step) => String(step.uses).startsWith('cloudflare/wrangler-action@')).with.command).toContain('pages deploy ${{ steps.layout.outputs.deploy }}');
  });

  it('refuses a retained record that belongs to another release, then verifies checksums', () => {
    const verify = content.find((step) => /rollback\.mjs/.test(step.run ?? ''));
    expect(verify.env).toEqual({ RELEASE: '${{ inputs.release }}', SITE_DIST: '${{ steps.layout.outputs.dist }}' });
    expect(verify['working-directory']).toBe('${{ steps.layout.outputs.root }}');
    expect(verify.run).toContain(`jq -e --arg release "$RELEASE" '.release == $release'`);
    expect(verify.run).toContain('node scripts/rollback.mjs "$SITE_DIST" "publication/${RELEASE}/artifact-manifest.json" "publication/${RELEASE}/deployment-record.json" "$RELEASE"');
    expect(verify.run.indexOf('jq -e')).toBeLessThan(verify.run.indexOf('node scripts/rollback.mjs'));
  });

  it('maps the boundary pattern on the policy step only', () => {
    expect(text.match(/secrets\.L2C_BOUNDARY_PATTERN/g)).toHaveLength(1);
    expect(workflow.env).toBeUndefined();
    const step = policy.find((entry) => entry.run === 'node scripts/publication.mjs policy "$REPOSITORY_ROOT"');
    expect(step.env.REPOSITORY_ROOT).toBe('${{ steps.layout.outputs.repo }}');
    expect(step.env.L2C_BOUNDARY_PATTERN).toBe('${{ secrets.L2C_BOUNDARY_PATTERN }}');
  });

  it('keeps its confirmation gate, environment, read-only permissions and no rebuild', () => {
    for (const job of Object.values<any>(workflow.jobs)) {
      expect(job.environment).toBe('production-recovery');
      expect(job.if).toContain("inputs.confirmation == 'RECOVER_WITHOUT_REBUILD'");
    }
    expect(workflow.permissions).toEqual({ actions: 'read', contents: 'read' });
    expect(text).not.toMatch(/npm (?:ci|install|run build)|astro build/);
    expect(content.find((step) => String(step.uses).startsWith('cloudflare/wrangler-action@')).with.command).toContain('--branch=main');
  });

  it('never expands a GitHub expression inside a shell script', () => {
    for (const step of [...content, ...policy]) if (step.run) expect(step.run).not.toContain('${{');
  });
});
