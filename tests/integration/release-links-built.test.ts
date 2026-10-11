import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { currentReleaseVersion } from '../../site/src/content/release.js';

/* Needs a built site: `npm run build` first. */
const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = `${root}/site/dist`;
const read = (path: string) => readFileSync(`${dist}/${path}`, 'utf8');
const pages = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? pages(path) : name === 'index.html' ? [path] : [];
});
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
beforeAll(() => { if (!existsSync(`${dist}/index.html`)) throw new Error('site/dist is missing: run `npm run build` first'); });

describe('release-pinned links as built', () => {
  const release = currentReleaseVersion();

  it('leaves no unresolved release token on any page', () => {
    for (const page of pages(dist)) expect(readFileSync(page, 'utf8'), page).not.toContain('@release');
  });

  it('shows the clone command at the current release on /start/, before the prerequisites', () => {
    const start = read('start/index.html');
    expect(text(start)).toContain(`git clone --branch ${release} https://github.com/pnsinha/laptop-to-cluster.git && cd laptop-to-cluster`);
    expect(start.indexOf('id="get-the-code"')).toBeGreaterThan(0);
    expect(start.indexOf('id="get-the-code"')).toBeLessThan(start.indexOf('id="check-the-prerequisites"'));
    expect(start).toContain('href="#get-the-code"');
  });

  it('points Module 2 and Module 3 package, README and example-job links at the current release', () => {
    const stale = /href="https:\/\/github\.com\/pnsinha\/laptop-to-cluster\/(?:tree\/v0\.1\.0\/workflows\/baseline-slurm-apptainer|blob\/v0\.1\.0\/workflows\/baseline-slurm-apptainer\/README\.md)"/;
    const module2 = read('guide/baseline-single-node-pattern/index.html');
    const module3 = read('guide/compose-to-hpc-translation/index.html');
    expect(module2).toContain(`href="https://github.com/pnsinha/laptop-to-cluster/tree/${release}/workflows/baseline-slurm-apptainer"`);
    expect(module2).toContain(`href="https://github.com/pnsinha/laptop-to-cluster/blob/${release}/workflows/baseline-slurm-apptainer/README.md"`);
    expect(module3).toContain(`href="https://github.com/pnsinha/laptop-to-cluster/tree/${release}/workflows/baseline-slurm-apptainer"`);
    expect(module3).toContain(`/blob/${release}/workflows/baseline-slurm-apptainer/bin/coordinator.py#L27-L28`);
    expect(module2).not.toMatch(stale);
    expect(module3).not.toMatch(stale);
    expect(module3).toContain('href="/start/#get-the-code"');
  });

  it('keeps the excerpt links pinned to the tag their line numbers come from', () => {
    const module2 = read('guide/baseline-single-node-pattern/index.html');
    for (const range of ['L1-L28', 'L200-L225', 'L227-L252']) expect(module2).toContain(`/blob/v0.1.0/workflows/baseline-slurm-apptainer/slurm/baseline.sbatch#${range}"`);
  });

  it('shows the unbounded-wait fix: the deadline and named errors on Module 2, and no bare wait', () => {
    const module2 = text(read('guide/baseline-single-node-pattern/index.html'));
    expect(module2).toContain('ENDPOINT_DEADLINE=$((SECONDS + READINESS_TIMEOUT))');
    expect(module2).toContain('BSSW-COORDINATOR-EXIT');
    expect(module2).toContain('wait "$worker_pid"');
    expect(module2).not.toMatch(/\n\s*wait\s*\n/);
  });

  it('adds the README note beside the v0.1.0 provenance links on both test records', () => {
    for (const id of ['m1-baseline-anvil', 'm2-baseline-anvil-2026-10']) {
      const html = read(`applicability/${id}/index.html`);
      expect(html, id).toContain('/blob/v0.1.0/workflows/baseline-slurm-apptainer/README.md"');
      expect(text(html), id).toContain('This README predates the test run; the current README is in the release.');
    }
  });

  it('describes the shipped release in Milestone 2', () => {
    const milestone = text(read('milestones/2/index.html'));
    for (const phrase of ['two-environment figure', 'on the five-minute tour and in Modules 1–2', 'One toggle switches the theme and remembers your choice', 'dated test record', 're-tested in October 2026']) expect(milestone, phrase).toContain(phrase);
    expect(milestone).not.toContain('full, dated test record');
  });
});
