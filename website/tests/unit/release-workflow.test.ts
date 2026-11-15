import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { validateReleaseWorkflow } from '../../scripts/publication.mjs';
import { planRelease } from '../../scripts/release-plan.mjs';

const workflows = fileURLToPath(new URL('../../../.github/workflows/', import.meta.url));
const read = (name: string) => readFileSync(`${workflows}${name}`, 'utf8');
const release = read('release.yml');
const releaseYaml = parse(release) as any;
const rollback = parse(read('rollback.yml')) as any;
const steps = (workflow: any) => Object.values<any>(workflow.jobs).flatMap((job) => job.steps ?? []);
const uploadName = (job: string) => releaseYaml.jobs[job].steps.find((step: any) => String(step.uses).startsWith('actions/upload-artifact@')).with.name;

describe('release.yml', () => {
  it('passes the release policy', () => {
    expect(validateReleaseWorkflow(release)).toEqual([]);
  });

  it('gates production on the production environment and reaches it only after the build', () => {
    expect(releaseYaml.jobs.deploy.environment).toBe('production');
    expect(releaseYaml.jobs.deploy.needs).toEqual(['plan', 'build-once']);
    expect(releaseYaml.jobs.deploy.if).toBe("needs.plan.outputs.mode == 'production'");
    expect(releaseYaml.jobs['deploy-preview'].environment).toBeUndefined();
  });

  it('expands no ${{ }} expression inside a run: script', () => {
    for (const file of ['release.yml', 'ci.yml', 'rollback.yml']) {
      for (const step of steps(parse(read(file)))) expect(step.run ?? '', `${file}: ${step.name ?? step.run}`).not.toContain('${{');
    }
  });

  it('uploads the artifact names rollback.yml downloads', () => {
    const downloads = steps(rollback).filter((step: any) => String(step.uses).startsWith('actions/download-artifact@')).map((step: any) => step.with.name);
    expect(downloads).toEqual(['validated-site-${{ inputs.release }}-${{ inputs.source-commit }}', 'release-record-${{ inputs.release }}-${{ inputs.source-commit }}']);
    expect(uploadName('build-once')).toBe('${{ needs.plan.outputs.artifact-name }}');
    expect(uploadName('deploy')).toBe('${{ needs.plan.outputs.record-artifact-name }}');
    expect(releaseYaml.jobs.plan.outputs['artifact-name']).toBe('${{ steps.plan.outputs.artifact-name }}');
    expect(releaseYaml.jobs.plan.outputs['record-artifact-name']).toBe('${{ steps.plan.outputs.record-artifact-name }}');
    expect(planRelease({ commitDate: '2026-11-15', sha: 'b'.repeat(40), eventName: 'push', refType: 'tag', refName: 'v1.2.3' })).toMatchObject({ artifactName: `validated-site-v1.2.3-${'b'.repeat(40)}`, recordArtifactName: `release-record-v1.2.3-${'b'.repeat(40)}` });
  });

  it('rejects a workflow that skips the approval or expands an expression in a script', () => {
    expect(validateReleaseWorkflow(release.replace('environment: production', 'environment: staging')).join('\n')).toContain('production environment');
    expect(validateReleaseWorkflow(release.replace('run: npm run validate', 'run: echo ${{ github.ref_name }}')).join('\n')).toContain('expands');
  });
});
