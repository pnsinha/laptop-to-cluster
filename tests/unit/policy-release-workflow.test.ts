import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentReleaseVersion } from '../../site/src/content/release';
import { RELEASE } from './helpers/release-workflow-fixture';
import { resolveReleaseVersion, tagPatternMatches, tagTriggers, validateDeploymentWorkflow, validateFrozenPublicationWorkflow, validateReleaseWorkflow, workflowTagPatterns } from '../../scripts/publication.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
function releasesTree(versions: Record<string, object>) {
  const root = mkdtempSync(join(tmpdir(), 'bssw-releases-'));
  temporary.push(root);
  for (const [name, body] of Object.entries(versions)) {
    mkdirSync(join(root, 'releases', name), { recursive: true });
    writeFileSync(join(root, 'releases', name, 'release-candidate.json'), JSON.stringify(body));
  }
  return root;
}

describe('tag patterns', () => {
  it('follows the GitHub filter characters we use', () => {
    expect(tagPatternMatches('v0.2.0', 'v0.2.0')).toBe(true);
    expect(tagPatternMatches('v0.2.0', 'v0x2x0')).toBe(false);
    expect(tagPatternMatches('v[0-9]+.[0-9]+.[0-9]+', 'v0.2.0')).toBe(true);
    expect(tagPatternMatches('v[0-9]+.[0-9]+.[0-9]+', 'v0.2.0-rc.1')).toBe(false);
    expect(tagTriggers(['v[0-9]+.[0-9]+.[0-9]+', '!v0.1.0'], 'v0.1.0')).toBe(false);
    expect(tagTriggers(['v[0-9]+.[0-9]+.[0-9]+', '!v0.1.0'], 'v0.2.0')).toBe(true);
    expect(tagTriggers(['!v0.1.0', 'v[0-9]+.[0-9]+.[0-9]+'], 'v0.1.0')).toBe(true);
    expect(tagPatternMatches('v0.2.0-rc.*', 'v0.2.0-rc.1')).toBe(true);
    expect(tagPatternMatches('v0.2.0-rc.*', 'v0.2.0')).toBe(false);
    expect(tagPatternMatches('v*', 'v0.1.0')).toBe(true);
    expect(tagPatternMatches('v[0-9]*', 'v0.1.0')).toBe(true);
    expect(tagPatternMatches('v0.[2-9].*', 'v0.1.0')).toBe(false);
    expect(tagPatternMatches('v**', 'v0/1')).toBe(true);
    expect(tagPatternMatches('v*', 'v0/1')).toBe(false);
  });

  it('reads inline and block tag lists', () => {
    expect(workflowTagPatterns("on:\n  push:\n    tags: ['v0.2.0', \"v0.2.0-rc.*\"]\n")).toEqual(['v0.2.0', 'v0.2.0-rc.*']);
    expect(workflowTagPatterns(RELEASE)).toEqual(['v[0-9]+.[0-9]+.[0-9]+', 'v[0-9]+.[0-9]+.[0-9]+-rc.[0-9]+', '!v0.1.0']);
    const a11 = ['v[0-9]+.[0-9]+.[0-9]+', 'v[0-9]+.[0-9]+.[0-9]+-rc.[0-9]+', '!v0.1.0'];
    expect(workflowTagPatterns("on:\n  push:\n    tags: ['v[0-9]+.[0-9]+.[0-9]+', 'v[0-9]+.[0-9]+.[0-9]+-rc.[0-9]+', '!v0.1.0']\n")).toEqual(a11);
    expect(workflowTagPatterns("on:\n  push:\n    tags:\n      - 'v0.2.0'\n      - v0.2.0-rc.*\n  workflow_dispatch:\n")).toEqual(['v0.2.0', 'v0.2.0-rc.*']);
  });
});

describe('validateReleaseWorkflow', () => {
  it('accepts a workflow with every required property', () => {
    expect(validateReleaseWorkflow(RELEASE)).toEqual([]);
    expect(validateDeploymentWorkflow(RELEASE, 'release.yml')).toEqual([]);
  });

  it('accepts A11 literal inline tag list and a block branch list', () => {
    const block = "\n    tags:\n      - 'v[0-9]+.[0-9]+.[0-9]+'\n      - 'v[0-9]+.[0-9]+.[0-9]+-rc.[0-9]+'\n      - '!v0.1.0'";
    expect(RELEASE).toContain(block);
    const inline = RELEASE.replace(block, "\n    tags: ['v[0-9]+.[0-9]+.[0-9]+', 'v[0-9]+.[0-9]+.[0-9]+-rc.[0-9]+', '!v0.1.0']");
    expect(validateReleaseWorkflow(inline)).toEqual([]);
    expect(validateReleaseWorkflow(RELEASE.replace('branches: [v0.2.0-showcase]', 'branches:\n      - v0.2.0-showcase'))).toEqual([]);
  });

  it('rejects each missing property with a precise field', () => {
    const cases: Array<[string, string, RegExp]> = [
      ['no exclusion of the frozen tag', RELEASE.replace("\n      - '!v0.1.0'", ''), /match the frozen v0\.1\.0 tag/],
      ['no tag for the release candidate', RELEASE.replace("\n      - 'v[0-9]+.[0-9]+.[0-9]+-rc.[0-9]+'", ''), /no tag pattern triggers v0\.2\.0-rc\.1/],
      ['a mention of the frozen release outside the filter', RELEASE.replace('name: release', 'name: release # redeploys v0.1.0'), /may appear only inside the !v0\.1\.0 filter/],
      ['no preview branch trigger', RELEASE.replace('branches: [v0.2.0-showcase]', 'branches: [main]'), /v0\.2\.0-showcase/],
      ['write permissions', RELEASE.replace('contents: read', 'contents: write'), /permissions/],
      ['no boundary secret', RELEASE.replace(/  L2C_BOUNDARY_PATTERN:.*\n/, ''), /L2C_BOUNDARY_PATTERN must be mapped/],
      ['no plan job', RELEASE.replace('  plan:', '  planning:'), /jobs\.plan/],
      ['a shallow checkout', RELEASE.replace('with: { fetch-depth: 0 }', 'with: { fetch-depth: 1 }'), /fetch-depth: 0/],
      ['a reduced validation chain', RELEASE.replace('npm run validate\n', 'npm run validate:built\n'), /full npm run validate/],
      ['an artifact name without the version', RELEASE.replace(/(upload-artifact@v4\.6\.2\n\s+with:\n\s+name: ).*/, '$1validated-site'), /retained artifact name must be/],
      ['a rebuild during deploy', RELEASE.replace('      - uses: actions/download-artifact@v4.3.0\n        with:\n          name: @{{ needs.plan.outputs.artifact-name }}\n      - run: node scripts/publication.mjs verify site/dist publication/artifact-manifest.json\n      - uses: cloudflare/wrangler-action@v3.14.1\n        env:\n          CLOUDFLARE_API_TOKEN: @{{ secrets.CLOUDFLARE_API_TOKEN }}\n          CLOUDFLARE_ACCOUNT_ID: @{{ secrets.CLOUDFLARE_ACCOUNT_ID }}\n          CLOUDFLARE_ZONE_ID'.replaceAll('@{{', '${{'), '      - run: npm run build\n$&'.replace('$&', '      - uses: actions/download-artifact@v4.3.0\n        with:\n          name: x\n      - run: node scripts/publication.mjs verify site/dist m\n      - uses: cloudflare/wrangler-action@v3.14.1\n        env:\n          CLOUDFLARE_API_TOKEN: x\n          CLOUDFLARE_ACCOUNT_ID: x\n          CLOUDFLARE_ZONE_ID')), /BUILD-ONCE\] forbidden deployment operation/],
      ['no checksum verification', RELEASE.replaceAll('publication.mjs verify', 'publication.mjs show'), /ARTIFACT-IDENTITY/],
      ['main branch in the preview job', RELEASE.replace('--branch=preview', '--branch=main'), /--branch=preview must appear only in deploy-preview/],
      ['preview branch in the production job', RELEASE.replace('--branch=main', '--branch=preview'), /--branch=main must appear only in deploy/],
      ['a release record written by the preview job', RELEASE.replace('    steps:\n      - uses: actions/download-artifact@v4.3.0', '    steps:\n      - run: node scripts/generate-release-record.mjs .\n      - uses: actions/download-artifact@v4.3.0'), /production job only/],
      ['no recovery index step', RELEASE.replace('update-recovery-index.mjs', 'echo'), /update-recovery-index\.mjs must run in the deploy job/],
      ['an ungated production job', RELEASE.replace("    if: needs.plan.outputs.mode == 'production'\n", ''), /jobs\.deploy.*must be gated on the plan mode output/],
      ['no post-deploy check', RELEASE.replace('check-public-release.mjs', 'echo done'), /post-deploy job/],
      ['swapped preview and production gates', RELEASE.replace("mode == 'preview'", 'TMP').replace("mode == 'production'", "mode == 'preview'").replace('TMP', "mode == 'production'"), /must be gated on the plan mode output/],
      ['a release record artifact without the sha', RELEASE.replace('${{ needs.plan.outputs.record-artifact-name }}', 'release-record-${{ needs.plan.outputs.version }}'), /release record artifact name/],
      ['a validated-site artifact without the sha', RELEASE.replace('name: ${{ needs.plan.outputs.artifact-name }}\n          path', 'name: validated-site-${{ needs.plan.outputs.version }}\n          path'), /retained artifact name must be/],
      ['an artifact name from a literal version', RELEASE.replace('name: ${{ needs.plan.outputs.artifact-name }}\n          path', 'name: validated-site-${{ needs.plan.outputs.version }}-${{ github.sha }}\n          path'), /retained artifact name must be/],
      ['a preview job gated on preview == 1', RELEASE.replace("mode == 'preview'", "preview == '1'"), /jobs\.deploy-preview.*must be gated on the plan mode output/],
      ['a production job gated on preview != 1', RELEASE.replace("mode == 'production'", "preview != '1'"), /jobs\.deploy.*must be gated on the plan mode output/],
      ['a release record named with github.sha', RELEASE.replace('${{ needs.plan.outputs.record-artifact-name }}', 'release-record-${{ needs.plan.outputs.version }}-${{ github.sha }}'), /release record artifact name/],
      ['a plan job with no version output', RELEASE.replace('      version: ${{ steps.v.outputs.version }}\n', ''), /plan job must output the release version/],
      ['build-once without needs plan', RELEASE.replace('  build-once:\n    needs: plan\n', '  build-once:\n'), /build-once must need plan/],
      ['post-deploy needing only the preview job', RELEASE.replace('needs: [deploy-preview, deploy]', 'needs: [deploy-preview]'), /post-deploy job/],
      ['a missing publication.yml var', RELEASE.replaceAll('vars.CLOUDFLARE_REDIRECT_RULE_ID', 'secrets.X'), /vars\.CLOUDFLARE_REDIRECT_RULE_ID/],
      ['a shallow checkout in another job', RELEASE.replace('  deploy-preview:', '  extra:\n    steps:\n      - uses: actions/checkout@v4.2.2\n  deploy-preview:'), /checkout step 2 needs fetch-depth: 0/],
    ];
    for (const [name, text, expected] of cases) expect(validateReleaseWorkflow(text).join('\n'), name).toMatch(expected);
  });
});

describe('validateFrozenPublicationWorkflow', () => {
  const frozen = "on:\n  push:\n    tags: ['v0.1.0']\njobs:\n  build-once:\n    steps:\n      - uses: actions/checkout@v4.2.2\n        with: { fetch-depth: 0, ref: v0.1.0 }\n  deploy:\n    steps:\n      - uses: actions/checkout@v4.2.2\n        with:\n          ref: v0.1.0\n";
  it('requires the v0.1.0 tag trigger and a pinned ref on every checkout', () => {
    expect(validateFrozenPublicationWorkflow(frozen)).toEqual([]);
    expect(validateFrozenPublicationWorkflow(frozen.replace("['v0.1.0']", "['v0.1.0', 'v0.2.0']")).join('\n')).toMatch(/FROZEN-RELEASE.*exactly v0\.1\.0/);
    expect(validateFrozenPublicationWorkflow(frozen.replace('          ref: v0.1.0\n', '')).join('\n')).toMatch(/pinned with ref: v0\.1\.0/);
  });
});

describe('one release-version rule', () => {
  // The release job exports RELEASE_VERSION; these cases are about what happens without it, so they clear it.
  let saved: string | undefined;
  beforeEach(() => { saved = process.env.RELEASE_VERSION; delete process.env.RELEASE_VERSION; });
  afterEach(() => { if (saved === undefined) delete process.env.RELEASE_VERSION; else process.env.RELEASE_VERSION = saved; });
  const tree = () => releasesTree({ 'v0.1.0': { version: 'v0.1.0' }, 'v0.2.0': { version: 'v0.2.0' }, 'v0.10.0': { version: 'v0.10.0' }, 'not-a-version': {} });

  it('agrees with currentReleaseVersion for the environment, the newest record, and numeric ordering', () => {
    const root = tree();
    expect(resolveReleaseVersion(root, {})).toBe('v0.10.0');
    expect(currentReleaseVersion(root)).toBe('v0.10.0');
    const saved = process.env.RELEASE_VERSION;
    process.env.RELEASE_VERSION = ' v0.2.0 ';
    try {
      expect(resolveReleaseVersion(root)).toBe('v0.2.0');
      expect(currentReleaseVersion(root)).toBe('v0.2.0');
    } finally {
      if (saved === undefined) delete process.env.RELEASE_VERSION; else process.env.RELEASE_VERSION = saved;
    }
    expect(resolveReleaseVersion(releasesTree({ 'v0.2.0': {} }), {})).toBe('v0.2.0');
  });

  it('never falls back to v0.1.0 when nothing is configured', () => {
    expect(() => resolveReleaseVersion(releasesTree({}), {})).toThrow(/set RELEASE_VERSION/);
    expect(() => currentReleaseVersion(releasesTree({}))).toThrow(/set RELEASE_VERSION/);
  });

  it('prints the version from the CLI and exits 1 when there is none', () => {
    const run = (root: string) => spawnSync(process.execPath, [join(repoRoot, 'scripts/publication.mjs'), 'release-version', root], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } });
    expect(run(tree()).stdout.trim()).toBe('v0.10.0');
    const none = run(releasesTree({}));
    expect(none.status).toBe(1);
    expect(none.stderr).toMatch(/ERROR: resolveReleaseVersion/);
  });
});
