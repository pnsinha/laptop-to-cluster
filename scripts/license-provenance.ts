import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { join, relative } from 'node:path';
import picomatch from 'picomatch';
import { parse } from 'yaml';

export type LicenseDeclaration = { id: string; kind: 'executable' | 'content'; file: string };
export type ArtifactCategory = { id: string; description: string; license: string; paths: string[] };
export type Inventory = {
  schemaVersion: number;
  licenseDeclarations: LicenseDeclaration[];
  categories: ArtifactCategory[];
  excluded: Array<{ paths: string[]; reason: string }>;
};
export type ThirdPartyArtifact = {
  name: string;
  version: string;
  source: string;
  copyrightHolder: string;
  license: string;
  modificationStatus: 'unmodified' | 'modified' | 'adapted';
  modificationDescription?: string;
  /** 'npm' (the default) must match a direct dependency. 'vendored-font' ships files under site/public/fonts/. */
  kind?: 'npm' | 'vendored-font';
  /** vendored-font only: repository-relative paths of the shipped font binaries. */
  files?: string[];
  /** vendored-font only: repository-relative path of the licence text shipped next to the files. */
  licenseFile?: string;
  /** vendored-font only: sha256 (hex) of every file, keyed by repository-relative path. */
  sha256?: Record<string, string>;
};
export type Provenance = { schemaVersion: number; artifacts: ThirdPartyArtifact[] };
export type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const ignoredPrefixes = ['.git/', '.kiro/', 'node_modules/', 'site/dist/', 'site/.astro/', 'coverage/', 'publication/'];
const FONT_PATH = /^site\/public\/fonts\/[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9._-]+$/;

export function loadPolicyData(root: string): {
  inventory: Inventory;
  provenance: Provenance;
  manifest: PackageManifest;
} {
  return {
    inventory: parse(readFileSync(join(root, 'artifact-inventory.yml'), 'utf8')) as Inventory,
    provenance: parse(readFileSync(join(root, 'THIRD_PARTY.yml'), 'utf8')) as Provenance,
    manifest: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as PackageManifest,
  };
}

export function validatePolicyData(
  inventory: Inventory,
  provenance: Provenance,
  manifest: PackageManifest,
): string[] {
  const errors: string[] = [];
  if (inventory.schemaVersion !== 1) errors.push('artifact-inventory.yml: schemaVersion must be 1');
  if (provenance.schemaVersion !== 1) errors.push('THIRD_PARTY.yml: schemaVersion must be 1');

  const declarations = inventory.licenseDeclarations ?? [];
  const licenseIds = new Set<string>();
  for (const declaration of declarations) {
    if (!declaration.id || !declaration.kind || !declaration.file) {
      errors.push('artifact-inventory.yml: every license declaration requires id, kind, and file');
    }
    if (licenseIds.has(declaration.id)) errors.push(`artifact-inventory.yml: duplicate license ${declaration.id}`);
    licenseIds.add(declaration.id);
  }
  if (!declarations.some(({ kind }) => kind === 'executable')) {
    errors.push('artifact-inventory.yml: an executable license declaration is required');
  }
  if (!declarations.some(({ kind }) => kind === 'content')) {
    errors.push('artifact-inventory.yml: a content license declaration is required');
  }

  const categoryIds = new Set<string>();
  const pathOwners = new Map<string, string>();
  for (const category of inventory.categories ?? []) {
    if (!category.id || !category.description) errors.push('artifact-inventory.yml: every category requires id and description');
    if (categoryIds.has(category.id)) errors.push(`artifact-inventory.yml: duplicate category ${category.id}`);
    categoryIds.add(category.id);
    if (!category.license || !licenseIds.has(category.license)) {
      errors.push(`artifact-inventory.yml: category ${category.id} has one unknown or missing license`);
    }
    if (!Array.isArray(category.paths) || category.paths.length === 0) {
      errors.push(`artifact-inventory.yml: category ${category.id} requires at least one path`);
    }
    for (const pattern of category.paths ?? []) {
      const owner = pathOwners.get(pattern);
      if (owner) errors.push(`artifact-inventory.yml: ambiguous path pattern ${pattern} in ${owner} and ${category.id}`);
      pathOwners.set(pattern, category.id);
    }
  }
  if ((inventory.categories ?? []).length === 0) errors.push('artifact-inventory.yml: at least one category is required');

  const dependencies = { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };
  const records = new Map<string, ThirdPartyArtifact>();
  const npmRecords = new Map<string, ThirdPartyArtifact>();
  for (const artifact of provenance.artifacts ?? []) {
    const fields = [artifact.name, artifact.version, artifact.source, artifact.copyrightHolder, artifact.license, artifact.modificationStatus];
    if (fields.some((field) => typeof field !== 'string' || field.trim() === '')) {
      errors.push(`THIRD_PARTY.yml: ${artifact.name || '<unnamed>'} has incomplete provenance`);
      continue;
    }
    if (!artifact.source.startsWith('https://')) errors.push(`THIRD_PARTY.yml: ${artifact.name} source must use HTTPS`);
    if (!['unmodified', 'modified', 'adapted'].includes(artifact.modificationStatus)) {
      errors.push(`THIRD_PARTY.yml: ${artifact.name} has invalid modificationStatus`);
    }
    if (artifact.modificationStatus !== 'unmodified' && !artifact.modificationDescription?.trim()) {
      errors.push(`THIRD_PARTY.yml: ${artifact.name} requires a modificationDescription`);
    }
    const kind = artifact.kind ?? 'npm';
    if (kind !== 'npm' && kind !== 'vendored-font') errors.push(`THIRD_PARTY.yml: ${artifact.name} has invalid kind`);
    if (kind === 'vendored-font') {
      if (!Array.isArray(artifact.files) || artifact.files.length === 0) errors.push(`THIRD_PARTY.yml: ${artifact.name} requires files`);
      for (const file of artifact.files ?? []) {
        if (!FONT_PATH.test(file)) errors.push(`THIRD_PARTY.yml: ${artifact.name} file ${file} must be under site/public/fonts/<family-version>/`);
        if (!/^[0-9a-f]{64}$/.test(artifact.sha256?.[file] ?? '')) errors.push(`THIRD_PARTY.yml: ${artifact.name} requires a sha256 for ${file}`);
      }
      if (!artifact.licenseFile || !FONT_PATH.test(artifact.licenseFile)) {
        errors.push(`THIRD_PARTY.yml: ${artifact.name} requires a licenseFile under site/public/fonts/`);
      }
    }
    if (records.has(artifact.name)) errors.push(`THIRD_PARTY.yml: duplicate artifact ${artifact.name}`);
    records.set(artifact.name, artifact);
    if (kind === 'npm') npmRecords.set(artifact.name, artifact);
  }
  for (const [name, version] of Object.entries(dependencies)) {
    if (/^[~^*><=]|\s\|\||\bx\b/i.test(version)) errors.push(`package.json: ${name} must use an exact version`);
    const record = npmRecords.get(name);
    if (!record) errors.push(`THIRD_PARTY.yml: missing direct dependency ${name}`);
    else if (record.version !== version) errors.push(`THIRD_PARTY.yml: ${name} version ${record.version} does not match ${version}`);
  }
  for (const name of npmRecords.keys()) {
    if (!(name in dependencies)) errors.push(`THIRD_PARTY.yml: undeclared third-party package ${name}`);
  }
  return errors;
}

function walk(root: string, directory = root): string[] {
  // Use git ls-files so only tracked files are validated (not untracked WIP).
  try {
    const tracked = execSync('git ls-files', { cwd: root, encoding: 'utf8' })
      .trim().split('\n').filter(Boolean);
    return tracked.filter((path) =>
      path !== '.DS_Store'
      && !path.includes('/node_modules/')
      && !path.includes('/.astro/')
      && !ignoredPrefixes.some((prefix) => `${path}/`.startsWith(prefix))
    ).sort();
  } catch {
    // Fallback to filesystem walk if git is unavailable
    const files: string[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const path = relative(root, absolute).replaceAll('\\', '/');
      if (path === '.DS_Store' || path.includes('/node_modules/') || path.includes('/.astro/') || ignoredPrefixes.some((prefix) => `${path}/`.startsWith(prefix))) continue;
      if (entry.isDirectory()) files.push(...walk(root, absolute));
      else if (entry.isFile() || entry.isSymbolicLink()) files.push(path);
    }
    return files.sort();
  }
}

export function validateRepositoryDeclarations(root: string): string[] {
  let data: ReturnType<typeof loadPolicyData>;
  try {
    data = loadPolicyData(root);
  } catch (error) {
    return [`policy declarations could not be loaded: ${(error as Error).message}`];
  }
  const errors = validatePolicyData(data.inventory, data.provenance, data.manifest);
  errors.push(...validateVendoredFonts(root, data.provenance.artifacts ?? []));
  for (const declaration of data.inventory.licenseDeclarations ?? []) {
    try {
      const text = readFileSync(join(root, declaration.file), 'utf8');
      if (!text.includes(`SPDX-License-Identifier: ${declaration.id}`)) {
        errors.push(`${declaration.file}: missing SPDX identifier ${declaration.id}`);
      }
    } catch {
      errors.push(`${declaration.file}: declared license file is missing`);
    }
  }

  for (const exclusion of data.inventory.excluded ?? []) {
    if (!exclusion.reason?.trim() || !exclusion.paths?.length) {
      errors.push('artifact-inventory.yml: every exclusion requires paths and a reason');
    }
  }
  for (const file of walk(root)) {
    const where = classifyArtifactPath(data.inventory, file);
    if (where === 'uncovered') errors.push(`artifact-inventory.yml: ${file} has no artifact category or justified exclusion`);
    else if (where === 'ambiguous') errors.push(`artifact-inventory.yml: ${file} has ambiguous category/exclusion coverage`);
  }
  return errors;
}

export function assertRegularFile(root: string, path: string): string | undefined {
  try {
    return statSync(join(root, path)).isFile() ? undefined : `${path}: must be a file`;
  } catch {
    return `${path}: required file is missing`;
  }
}

type Matchers = {
  categories: Array<{ id: string; matches: (path: string) => boolean }>;
  exclusions: Array<(path: string) => boolean>;
};
const matcherCache = new WeakMap<Inventory, Matchers>();

function matchersFor(inventory: Inventory): Matchers {
  let cached = matcherCache.get(inventory);
  if (!cached) {
    cached = {
      categories: (inventory.categories ?? []).map((category) => ({ id: category.id, matches: picomatch(category.paths ?? [], { dot: true }) })),
      exclusions: (inventory.excluded ?? []).map((entry) => picomatch(entry.paths ?? [], { dot: true })),
    };
    matcherCache.set(inventory, cached);
  }
  return cached;
}

/** Exactly one category or one exclusion must cover each tracked file. */
export function classifyArtifactPath(inventory: Inventory, file: string): 'excluded' | 'uncovered' | 'ambiguous' | `category:${string}` {
  const { categories, exclusions } = matchersFor(inventory);
  const hits = categories.filter(({ matches }) => matches(file)).map(({ id }) => id);
  const excluded = exclusions.filter((matches) => matches(file)).length;
  if (hits.length + excluded === 0) return 'uncovered';
  if (hits.length + excluded > 1) return 'ambiguous';
  return excluded === 1 ? 'excluded' : `category:${hits[0]}`;
}

/** Checks that every vendored font file and its licence exist, that sha256 pins match, and that OFL records ship the OFL text. */
export function validateVendoredFonts(root: string, artifacts: ThirdPartyArtifact[]): string[] {
  const errors: string[] = [];
  for (const artifact of artifacts) {
    if (artifact.kind !== 'vendored-font') continue;
    const label = `THIRD_PARTY.yml: ${artifact.name}`;
    const files = artifact.files ?? [];
    for (const path of [...files, ...(artifact.licenseFile ? [artifact.licenseFile] : [])]) {
      const problem = assertRegularFile(root, path);
      if (problem) errors.push(`${label}: ${problem}`);
    }
    for (const [path, expected] of Object.entries(artifact.sha256 ?? {})) {
      if (!files.includes(path)) {
        errors.push(`${label}: sha256 given for ${path}, which is not listed in files`);
        continue;
      }
      try {
        const actual = createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
        if (actual !== expected) errors.push(`${label}: file ${path} sha256 mismatch`);
      } catch {
        /* a missing file is already reported above */
      }
    }
    if (artifact.license === 'OFL-1.1' && artifact.licenseFile) {
      try {
        if (!readFileSync(join(root, artifact.licenseFile), 'utf8').includes('SIL OPEN FONT LICENSE Version 1.1')) {
          errors.push(`${label}: ${artifact.licenseFile} does not contain the OFL 1.1 text`);
        }
      } catch {
        /* a missing licence is already reported above */
      }
    }
  }
  return errors;
}
