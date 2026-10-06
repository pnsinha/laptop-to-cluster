import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = fileURLToPath(new URL('../..', import.meta.url));
const text = readFileSync(`${root}/.github/workflows/ci.yml`, 'utf8');
const workflow = parse(text) as any;
const steps: any[] = workflow.jobs['publication-gates'].steps;
const index = (predicate: (step: any) => boolean) => steps.findIndex(predicate);

describe('ci.yml: version-parametrised blocking validation', () => {
  it('still runs on every pull request and on pushes to main', () => {
    expect(workflow.on.pull_request).toBeNull();
    expect(workflow.on.push.branches).toEqual(['main', 'master']);
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(text).not.toContain('pull_request_target');
  });

  it('installs poppler-utils before any validator so hosted PDFs are scanned', () => {
    const poppler = index((step) => /apt-get install -y poppler-utils/.test(step.run ?? ''));
    expect(poppler).toBeGreaterThanOrEqual(0);
    expect(steps[poppler].run).toContain('pdftotext -v');
    expect(poppler).toBeLessThan(index((step) => step.run === 'npm run publication:validate'));
  });

  it('checks out full history for the history scan', () => {
    expect(steps.find((step) => String(step.uses).startsWith('actions/checkout@')).with['fetch-depth']).toBe(0);
  });

  it('resolves RELEASE_VERSION from the candidate record before anything uses it', () => {
    const resolve = index((step) => /release-version\.mjs/.test(step.run ?? ''));
    expect(resolve).toBeGreaterThanOrEqual(0);
    expect(steps[resolve].run).toBe('echo "RELEASE_VERSION=$(node scripts/release-version.mjs)" >> "$GITHUB_ENV"');
    expect(resolve).toBeLessThan(index((step) => step.run === 'npm run publication:prepare'));
    expect(resolve).toBeLessThan(index((step) => String(step.uses).startsWith('actions/upload-artifact@')));
  });

  it('names the artifact and its path after the resolved version, not a fixed release', () => {
    const upload = steps.find((step) => String(step.uses).startsWith('actions/upload-artifact@'));
    expect(upload.with.name).toBe('validated-site-${{ env.RELEASE_VERSION }}-${{ github.sha }}');
    expect(upload.with.path).toContain('publication/${{ env.RELEASE_VERSION }}/');
    expect(text).not.toMatch(/v0\.\d+\.\d+/);
  });

  it('maps the boundary pattern on the publication gate step only', () => {
    expect(text.match(/secrets\.L2C_BOUNDARY_PATTERN/g)).toHaveLength(1);
    expect(workflow.env).toBeUndefined();
    /* R23/A14: there is no L2C_BOUNDARY_FORK_PR; fork PRs are detected from GITHUB_EVENT_NAME/GITHUB_EVENT_PATH. */
    expect(text).not.toContain('L2C_BOUNDARY_FORK_PR');
    const gate = steps.find((step) => step.run === 'npm run publication:validate');
    expect(gate.env).toEqual({ L2C_BOUNDARY_PATTERN: '${{ secrets.L2C_BOUNDARY_PATTERN }}' });
  });

  it('explains a fork pull request instead of failing silently, and only for forks', () => {
    const notice = steps.find((step) => /::notice/.test(step.run ?? ''));
    expect(notice.if).toBe("github.event_name == 'pull_request' && github.event.pull_request.head.repo.fork == true");
    expect(index((step) => step === notice)).toBeLessThan(index((step) => step.run === 'npm run publication:validate'));
  });

  it('keeps the gates it had: one build, publication validators, static and browser accessibility', () => {
    const runs = steps.map((step) => step.run).filter(Boolean);
    expect(runs.filter((run) => run === 'npm run build')).toHaveLength(1);
    for (const run of ['npm run check', 'npm run publication:validate', 'npm run publication:prepare', 'npm run test:integration:built && npm run test:accessibility:built && npm run test:accessibility:browser']) expect(runs).toContain(run);
  });

  it('never expands a GitHub expression inside a shell script', () => {
    for (const step of steps) if (step.run) expect(step.run).not.toContain('${{');
  });
});
