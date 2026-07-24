import { readFileSync, readdirSync, statSync } from 'node:fs';
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
};
export type Provenance = { schemaVersion: number; artifacts: ThirdPartyArtifact[] };
export type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const ignoredPrefixes = ['.git/', '.kiro/', 'node_modules/', 'site/dist/', 'site/.astro/', 'coverage/'];

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
    if (records.has(artifact.name)) errors.push(`THIRD_PARTY.yml: duplicate artifact ${artifact.name}`);
    records.set(artifact.name, artifact);
  }
  for (const [name, version] of Object.entries(dependencies)) {
    if (/^[~^*><=]|\s\|\||\bx\b/i.test(version)) errors.push(`package.json: ${name} must use an exact version`);
    const record = records.get(name);
    if (!record) errors.push(`THIRD_PARTY.yml: missing direct dependency ${name}`);
    else if (record.version !== version) errors.push(`THIRD_PARTY.yml: ${name} version ${record.version} does not match ${version}`);
  }
  for (const name of records.keys()) {
    if (!(name in dependencies)) errors.push(`THIRD_PARTY.yml: undeclared third-party package ${name}`);
  }
  return errors;
}

function walk(root: string, directory = root): string[] {
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

export function validateRepositoryDeclarations(root: string): string[] {
  let data: ReturnType<typeof loadPolicyData>;
  try {
    data = loadPolicyData(root);
  } catch (error) {
    return [`policy declarations could not be loaded: ${(error as Error).message}`];
  }
  const errors = validatePolicyData(data.inventory, data.provenance, data.manifest);
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

  const categoryMatchers = (data.inventory.categories ?? []).map((category) => ({
    category,
    matches: picomatch(category.paths, { dot: true }),
  }));
  const exclusions = (data.inventory.excluded ?? []).map((entry) => ({
    entry,
    matches: picomatch(entry.paths, { dot: true }),
  }));
  for (const exclusion of data.inventory.excluded ?? []) {
    if (!exclusion.reason?.trim() || !exclusion.paths?.length) {
      errors.push('artifact-inventory.yml: every exclusion requires paths and a reason');
    }
  }
  for (const file of walk(root)) {
    const matchingCategories = categoryMatchers.filter(({ matches }) => matches(file));
    const matchingExclusions = exclusions.filter(({ matches }) => matches(file));
    if (matchingCategories.length + matchingExclusions.length === 0) {
      errors.push(`artifact-inventory.yml: ${file} has no artifact category or justified exclusion`);
    } else if (matchingCategories.length + matchingExclusions.length > 1) {
      errors.push(`artifact-inventory.yml: ${file} has ambiguous category/exclusion coverage`);
    }
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
