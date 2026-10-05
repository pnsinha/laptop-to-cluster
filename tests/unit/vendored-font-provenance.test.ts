import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  classifyArtifactPath, loadPolicyData, validatePolicyData, validateRepositoryDeclarations, validateVendoredFonts,
  type ThirdPartyArtifact,
} from '../../scripts/license-provenance.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const clone = <T>(value: T): T => structuredClone(value);
const SHA = 'a'.repeat(64);
const fontRecord = (overrides: Partial<ThirdPartyArtifact> = {}): ThirdPartyArtifact => ({
  name: 'Example Face', version: '1.0.0', source: 'https://example.org/face', copyrightHolder: 'Example Authors',
  license: 'OFL-1.1', modificationStatus: 'unmodified', kind: 'vendored-font',
  files: ['site/public/fonts/example-1.0.0/Example-Regular.woff2'],
  licenseFile: 'site/public/fonts/example-1.0.0/OFL.txt',
  sha256: { 'site/public/fonts/example-1.0.0/Example-Regular.woff2': SHA },
  ...overrides,
});
const withRecord = (record: ThirdPartyArtifact) => {
  const data = loadPolicyData(root);
  const provenance = clone(data.provenance);
  provenance.artifacts.push(record);
  return validatePolicyData(data.inventory, provenance, data.manifest);
};
const listFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? listFiles(join(directory, entry.name)).map((child) => `${entry.name}/${child}`) : [entry.name]));

describe('vendored-font provenance records', () => {
  it('accepts a complete record without a matching package.json dependency', () => {
    expect(withRecord(fontRecord())).toEqual([]);
  });

  it('still rejects an npm-style record that is not a direct dependency', () => {
    expect(withRecord(fontRecord({ kind: undefined })).join('\n')).toContain('undeclared third-party package Example Face');
  });

  it('requires files, a licence file and a sha256 for every file', () => {
    expect(withRecord(fontRecord({ files: [] })).join('\n')).toContain('Example Face requires files');
    expect(withRecord(fontRecord({ licenseFile: undefined })).join('\n')).toContain('Example Face requires a licenseFile under site/public/fonts/');
    expect(withRecord(fontRecord({ sha256: {} })).join('\n')).toContain('Example Face requires a sha256 for site/public/fonts/example-1.0.0/Example-Regular.woff2');
  });

  it('keeps vendored fonts under site/public/fonts/<family-version>/', () => {
    expect(withRecord(fontRecord({ files: ['site/public/other/Example.woff2'], sha256: { 'site/public/other/Example.woff2': SHA } })).join('\n'))
      .toContain('must be under site/public/fonts/<family-version>/');
  });

  it('rejects an unknown kind', () => {
    expect(withRecord(fontRecord({ kind: 'bundled' as never })).join('\n')).toContain('Example Face has invalid kind');
  });
});

describe('vendored font files on disk', () => {
  const { provenance } = loadPolicyData(root);
  const fonts = provenance.artifacts.filter((artifact) => artifact.kind === 'vendored-font');

  it('declares the five font records from the spec, including Noto Sans Symbols 2 for L2C Marks', () => {
    expect(fonts.map((font) => font.name)).toEqual([
      'Source Serif 4 (variable roman)', 'Source Serif 4 (italic)', 'IBM Plex Sans', 'IBM Plex Mono', 'L2C Marks (Noto Sans Symbols 2 subset)',
    ]);
    expect(fonts.find((font) => font.name.startsWith('L2C Marks'))?.modificationStatus).toBe('modified');
  });

  it('verifies every file, licence and sha256 on disk', () => {
    expect(validateVendoredFonts(root, provenance.artifacts)).toEqual([]);
  });

  it('reports a changed file as a sha256 mismatch', () => {
    const tampered = clone(provenance.artifacts);
    const target = tampered.find((artifact) => artifact.name === 'IBM Plex Mono')!;
    const file = target.files![0];
    target.sha256![file] = SHA;
    expect(validateVendoredFonts(root, tampered)).toEqual([`THIRD_PARTY.yml: IBM Plex Mono: file ${file} sha256 mismatch`]);
  });

  it('lists every shipped font binary and licence file (SUBSET.txt is provenance text, not a font)', () => {
    const declared = new Set(fonts.flatMap((font) => [...font.files!, font.licenseFile!]));
    const shipped = listFiles(join(root, 'site/public/fonts')).map((file) => `site/public/fonts/${file}`).filter((file) => !file.endsWith('/SUBSET.txt'));
    expect(shipped.filter((file) => !declared.has(file))).toEqual([]);
    expect([...declared].filter((file) => !shipped.includes(file))).toEqual([]);
  });
});

describe('artifact path classification', () => {
  const { inventory } = loadPolicyData(root);

  it('treats vendored fonts as excluded, licensed by their own files', () => {
    expect(classifyArtifactPath(inventory, 'site/public/fonts/ibm-plex-sans-1.1.0/IBMPlexSans-Regular-Latin1.woff2')).toBe('excluded');
    expect(classifyArtifactPath(inventory, 'site/public/fonts/source-serif-4-5.3.0/OFL.txt')).toBe('excluded');
  });

  it('keeps other public files under CC BY 4.0', () => {
    for (const file of ['site/public/robots.txt', 'site/public/_headers', 'site/public/iguide-forum-2026-poster.pdf', 'site/public/cheat-sheet/index.html']) {
      expect(classifyArtifactPath(inventory, file), file).toBe('category:documentation-training-evidence');
    }
  });

  it('keeps styles under the executable licence and flags unknown paths', () => {
    expect(classifyArtifactPath(inventory, 'site/src/styles/tokens.css')).toBe('category:executable-source');
    expect(classifyArtifactPath(inventory, 'unlisted/file.bin')).toBe('uncovered');
  });

  it('accepts the whole repository declaration set', () => {
    expect(validateRepositoryDeclarations(root)).toEqual([]);
  });
});
