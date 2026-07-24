import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadPolicyData, validatePolicyData, validateRepositoryDeclarations } from '../../scripts/license-provenance.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const clone = <T>(value: T): T => structuredClone(value);

describe('license and provenance declarations', () => {
  it('accepts complete repository declarations and path coverage', () => {
    expect(validateRepositoryDeclarations(root)).toEqual([]);
  });

  it('rejects a category with a missing license', () => {
    const data = loadPolicyData(root);
    const inventory = clone(data.inventory);
    inventory.categories[0].license = '';
    expect(validatePolicyData(inventory, data.provenance, data.manifest))
      .toContain('artifact-inventory.yml: category executable-source has one unknown or missing license');
  });

  it('rejects an ambiguous category path declaration', () => {
    const data = loadPolicyData(root);
    const inventory = clone(data.inventory);
    inventory.categories[1].paths.push('site/src/**/*.ts');
    expect(validatePolicyData(inventory, data.provenance, data.manifest).join('\n'))
      .toContain('ambiguous path pattern site/src/**/*.ts');
  });

  it('rejects incomplete third-party provenance', () => {
    const data = loadPolicyData(root);
    const provenance = clone(data.provenance);
    provenance.artifacts[0].source = '';
    expect(validatePolicyData(data.inventory, provenance, data.manifest).join('\n'))
      .toContain('astro has incomplete provenance');
  });
});
