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
  validateHostnamePolicy,
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
