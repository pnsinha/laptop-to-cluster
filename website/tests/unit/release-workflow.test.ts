import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { validateReleaseWorkflow } from '../../scripts/publication.mjs';
import { planRelease } from '../../scripts/release-plan.mjs';
import { releaseLine } from '../../scripts/verify-live-release.mjs';

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

  it('maps the boundary pattern secret on the boundary scan step only', () => {
    for (const workflow of [releaseYaml, parse(read('ci.yml')) as any]) {
      const holders = steps(workflow).filter((step) => JSON.stringify(step.env ?? {}).includes('L2C_BOUNDARY_PATTERN'));
      expect(holders.map((step) => step.run)).toEqual(['npm run validate:boundary']);
    }
  });
});

describe('scripts that release and rollback jobs run without node_modules', () => {
  const scripts = fileURLToPath(new URL('../../scripts/', import.meta.url));
  for (const name of ['publication.mjs', 'release-plan.mjs', 'release-version.mjs', 'generate-release-record.mjs', 'update-recovery-index.mjs', 'verify-live-release.mjs', 'check-public-release.mjs', 'rollback.mjs', 'boundary.mjs']) {
    it(`${name} imports only Node built-ins and sibling scripts`, () => {
      const source = readFileSync(`${scripts}${name}`, 'utf8');
      const bare = [...source.matchAll(/^import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((match) => match[1]).filter((spec) => !spec.startsWith('node:') && !spec.startsWith('./') && !spec.startsWith('../'));
      expect(bare).toEqual([]);
    });
  }
});

describe('verify-live-release', () => {
  it('tells one release from the next by the footer release link', () => {
    const page = (version: string) => `<footer><a href="/milestones/2/#release-${version.replaceAll('.', '-')}">Release ${version}</a></footer>`;
    expect(releaseLine(page('v0.2.1'))).toBe('<a href="/milestones/2/#release-v0-2-1">Release v0.2.1</a>');
    expect(releaseLine(page('v0.2.0'))).not.toBe(releaseLine(page('v0.2.1')));
    expect(releaseLine('<p>no marker</p>')).toBeUndefined();
  });
});
