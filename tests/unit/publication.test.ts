import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CANONICAL_ORIGIN,
  REDIRECT_HOSTS,
  createArtifactManifest,
  redirectLocation,
  validateCanonicalConfig,
  validateDeploymentRecord,
  validateDeploymentWorkflow,
  validateFrontendPolicy,
  validateHostnamePolicy,
  validatePageComposition,
  validateProjectionSourceAgreement,
  verifyArtifactManifest,
} from '../../scripts/publication.mjs';

const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
const root = new URL('../..', import.meta.url).pathname;

function artifactTree() {
  const directory = mkdtempSync(join(tmpdir(), 'bssw-publication-'));
  temporary.push(directory);
  mkdirSync(join(directory, 'guide'), { recursive: true });
  writeFileSync(join(directory, 'index.html'), '<h1>Home</h1>\n');
  writeFileSync(join(directory, 'guide/index.html'), '<h1>Guide</h1>\n');
  return directory;
}

const policy = JSON.parse(readFileSync(join(root, 'infrastructure/cloudflare/hostname-redirects.v1.json'), 'utf8'));

describe('publication artifact identity', () => {
  it('is deterministic and rejects any retained-output mutation', () => {
    const directory = artifactTree();
    const first = createArtifactManifest(directory);
    expect(createArtifactManifest(directory)).toEqual(first);
    expect(verifyArtifactManifest(directory, first)).toEqual([]);
    writeFileSync(join(directory, 'index.html'), '<h1>Changed</h1>\n');
    expect(verifyArtifactManifest(directory, first).join('\n')).toMatch(/ARTIFACT-IDENTITY/);
  });
});

describe('canonical and hostname release policy', () => {
  it('accepts only the literal apex config and exact three permanent redirect hosts', () => {
    const config = readFileSync(join(root, 'site/astro.config.mjs'), 'utf8');
    expect(validateCanonicalConfig(config)).toEqual([]);
    expect(validateCanonicalConfig(config.replace(CANONICAL_ORIGIN, '${process.env.SITE}'))).not.toEqual([]);
    expect(validateHostnamePolicy(policy)).toEqual([]);
    expect(validateHostnamePolicy({ ...policy, rules: policy.rules.slice(1) }).join('\n')).toMatch(/missing exact host|exactly three/);
  });

  it('preserves complete path and query for every source hostname', () => {
    for (const host of REDIRECT_HOSTS) {
      expect(redirectLocation(policy, `https://${host}/guide/a%20b/?x=1&x=2`)).toBe(`${CANONICAL_ORIGIN}/guide/a%20b/?x=1&x=2`);
    }
  });

  it('rejects deployment jobs that rebuild or omit retained-artifact verification', () => {
    const workflow = readFileSync(join(root, '.github/workflows/publication.yml'), 'utf8');
    expect(validateDeploymentWorkflow(workflow)).toEqual([]);
    expect(validateDeploymentWorkflow(workflow.replace('node scripts/publication.mjs verify', 'npm run build && node scripts/publication.mjs verify')).join('\n')).toMatch(/BUILD-ONCE/);
  });
});

describe('typed deployment records', () => {
  it('binds Direct Upload identity and rejects inconsistent checksums', () => {
    const artifact = createArtifactManifest(artifactTree());
    const record = {
      release: 'v0.1.0', sourceCommit: 'a'.repeat(40), cloudflareDeploymentId: 'deployment-1',
      artifactSha256: artifact.artifactSha256, artifactFileManifestSha256: artifact.artifactFileManifestSha256,
      canonicalOrigin: CANONICAL_ORIGIN, pagesDevFallbackUrl: 'https://deployment.example.pages.dev',
      builtOnce: true, deployedVia: 'cloudflare-pages-direct-upload',
    };
    expect(validateDeploymentRecord(record, artifact)).toEqual([]);
    expect(validateDeploymentRecord({ ...record, artifactSha256: '0'.repeat(64) }, artifact).join('\n')).toMatch(/must match validated artifact/);
  });
});


describe('composition and source-agreement publication gates', () => {
  const projection = '<section class="applicability-projection" data-projection-id="milestone:m1" data-source-id="m1" aria-label="Tested workflow scope"><p>The baseline workflow was validated on Purdue Anvil with Slurm and Apptainer.</p><p class="applicability-supplement applicability-supplement--boundary"><strong>Boundary:</strong> Adapt the partition.</p><p><a href="/applicability/m1/">Review the complete applicability record</a></p></section>';
  const valid = `<body data-composition-profile="milestone"><header class="content-header"><h1>Milestone</h1><p class="lede">Summary.</p></header>${projection}<article><h2>Deliverables</h2><p>Published work.</p></article><section class="sources-scope">Sources and scope</section></body>`;

  it('accepts the exact concise shape and rejects duplicate, stale-ID, stale-link, and canonical-only output', () => {
    expect(validatePageComposition('/milestones/1/', valid)).toEqual([]);
    const mutations = [
      valid.replace('</article>', `</article>${projection}`),
      valid.replace('data-source-id="m1"', 'data-source-id="stale"'),
      valid.replace('href="/applicability/m1/"', 'href="/applicability/other/"'),
      valid.replace('</article>', '<h2>Evidence and integrity</h2></article>'),
      valid.replace('</article>', '</article><aside class="support-state degraded">Degraded</aside>'),
      valid.replace('</article>', '</article><details><strong>Warning:</strong> hidden</details>'),
    ];
    for (const changed of mutations) expect(validatePageComposition('/milestones/1/', changed), changed).not.toEqual([]);
  });

  it('detects semantic source drift across every consumer while keeping version and date canonical-only', () => {
    const canonical = '<body data-composition-profile="applicability"><section class="applicability-record" data-source-id="m1"><dl><div><dt>Status</dt><dd>validated</dd></div><div><dt>Environment</dt><dd>Purdue Anvil</dd></div><div><dt>Scheduler</dt><dd>Slurm 25.11</dd></div><div><dt>Runtime</dt><dd>Apptainer 1.4</dd></div><div><dt>Validation date</dt><dd>2026-07-25</dd></div></dl><h2>Portability boundaries</h2><ul><li>Adapt the partition.</li></ul></section></body>';
    const consumers = ['landing', 'runnable-module', 'milestone', 'release'];
    const blocks = consumers.map((consumer) => projection.replaceAll('milestone:m1', `${consumer}:m1`));
    for (const block of blocks) expect(validateProjectionSourceAgreement('/consumer/', block, '/applicability/m1/', canonical)).toEqual([]);

    const drift = [
      canonical.replace('Purdue Anvil', 'SDSC Expanse'),
      canonical.replace('<dd>validated</dd>', '<dd>stale</dd>'),
      canonical.replace('Adapt the partition.', 'Use a local account.'),
      canonical.replaceAll('data-source-id="m1"', 'data-source-id="renamed"'),
    ];
    for (const changed of drift) {
      for (const block of blocks) expect(validateProjectionSourceAgreement('/consumer/', block, '/applicability/m1/', changed).join('\n')).toMatch(/SOURCE-AGREEMENT/);
    }
    for (const canonicalOnly of [canonical.replace('25.11', '26.1'), canonical.replace('1.4', '2.0'), canonical.replace('2026-07-25', '2026-08-01')]) {
      for (const block of blocks) expect(validateProjectionSourceAgreement('/consumer/', block, '/applicability/m1/', canonicalOnly)).toEqual([]);
      expect(blocks.join('')).not.toMatch(/25\.11|1\.4|2026-07-25/);
    }
    expect(validateProjectionSourceAgreement('/consumer/', projection.replace('/applicability/m1/', '/applicability/stale/'), '/applicability/m1/', canonical).join('\n')).toMatch(/SOURCE-AGREEMENT/);
  });

  it('requires a diagnostic projection to expose one discriminator with matching IDs and link', () => {
    const diagnostic = '<body data-composition-profile="diagnostic"><header class="content-header"><h1>Runtime unavailable</h1><p class="lede">Recover.</p></header><article><h2>Signal</h2></article><aside class="diagnostic-applicability" data-projection-id="diagnostic:BSSW-X:m1" data-source-id="m1"><p><strong>Relevant discriminator:</strong> runtime: Apptainer. <a href="/applicability/m1/">Review the complete applicability record</a>.</p></aside></body>';
    expect(validatePageComposition('/diagnostics/x/', diagnostic)).toEqual([]);
    expect(validatePageComposition('/diagnostics/x/', diagnostic.replace('runtime: Apptainer', 'runtime: Apptainer; scheduler: Slurm')).join('\n')).toMatch(/DIAGNOSTIC-CONTEXT/);
    expect(validatePageComposition('/about/project/', diagnostic.replace('diagnostic"', 'about"')).join('\n')).toMatch(/DIAGNOSTIC-CONTEXT/);
  });

  it('blocks new integration dependencies, remote fonts, client frameworks, and decorative motion', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const config = readFileSync(join(root, 'site/astro.config.mjs'), 'utf8');
    const css = readFileSync(join(root, 'site/src/styles/global.css'), 'utf8');
    expect(validateFrontendPolicy(manifest, config, [{ path: 'global.css', text: css }])).toEqual([]);
    expect(validateFrontendPolicy({ ...manifest, dependencies: { ...manifest.dependencies, react: '19.0.0' } }, config).join('\n')).toMatch(/DEPENDENCY-EXCLUSION/);
    expect(validateFrontendPolicy(manifest, config.replace('canonicalPolicy()', 'canonicalPolicy(), react()')).join('\n')).toMatch(/INTEGRATION-EXCLUSION/);
    expect(validateFrontendPolicy(manifest, config, [{ path: 'bad.css', text: '@font-face{} .x { animation: pulse 1s; }' }]).join('\n')).toMatch(/REMOTE-FONT|TECHNOLOGY-EXCLUSION/);
    expect(validateFrontendPolicy(manifest, config, [{ path: 'bad.astro', text: "import React from 'react'; <Widget client:load />" }]).join('\n')).toMatch(/TECHNOLOGY-EXCLUSION/);
  });
});