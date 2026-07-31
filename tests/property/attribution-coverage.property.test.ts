import fc from 'fast-check';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import BaseLayout from '../../site/src/layouts/BaseLayout.astro';
import { attributionSchema } from '../../site/src/content/schema.js';
import { COMPOSITION_PROFILES } from '../../site/src/content/projections.js';

let container: AstroContainer;
beforeAll(async () => { container = await AstroContainer.create(); });

const word = fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), {
  minLength: 1, maxLength: 16,
}).map((characters) => characters.join(''));
const phrase = fc.array(word, { minLength: 1, maxLength: 4 }).map((words) => words.join(' '));
const publicPage = fc.record({
  title: phrase,
  description: phrase,
  canonicalPath: word.map((slug) => `/guide/${slug}/`),
  profile: fc.constantFrom(...COMPOSITION_PROFILES),
});
const contributorRecord = fc.record({
  name: phrase,
  role: phrase,
  kind: fc.constantFrom('contributor' as const, 'funder' as const),
  scope: phrase,
});
const artifactAttribution = fc.uniqueArray(contributorRecord, {
  minLength: 1, maxLength: 12, selector: ({ name }) => name,
}).map((records) => records.map(({ name, role, kind, scope }) => ({
  name,
  role: kind === 'funder' ? `Funder: ${role}` : role,
  ...(kind === 'funder' ? { funding_scope: scope } : {}),
})));

const globalAttribution = {
  id: 'project-attribution',
  author: 'Parmanand Sinha',
  fellowship_role: '2026 BSSw Fellow in an individual capacity',
  professional_affiliation: 'University of Chicago professional affiliation',
  funds_administrator: 'ParaTools administers fellowship funds',
  sponsors: ['U.S. Department of Energy', 'National Science Foundation'],
  non_endorsement: 'Acknowledgment does not imply endorsement by any contributor, funder, or institution.',
  licenses: [{ scope: 'artifact', license: 'CC-BY-4.0' }],
};

describe('Property 12: Attribution coverage preserves role and funding scope', () => {
  it('links every public page to global attribution and preserves artifact acknowledgments', async () => {
    // Feature: bssw-fellowship-resource-site, Property 12: Attribution coverage preserves role and funding scope
    // **Validates: Requirements 8.1, 8.7**
    await fc.assert(fc.asyncProperty(publicPage, artifactAttribution, async (page, contributors) => {
      const html = await container.renderToString(BaseLayout, { props: page });
      const projection = attributionSchema.parse({ ...globalAttribution, contributors });

      expect(html).toContain('href="/about/project/"');
      expect(projection.contributors).toEqual(contributors);
      for (const contributor of contributors) {
        expect(projection.contributors).toContainEqual(contributor);
        expect(contributor.role).not.toHaveLength(0);
        if (contributor.role.startsWith('Funder:')) expect(contributor.funding_scope).not.toHaveLength(0);
      }
      expect(projection.non_endorsement).toBe(globalAttribution.non_endorsement);
      expect(projection.non_endorsement).toMatch(/does not imply endorsement/i);
    }), { numRuns: 100 });
  });
});
