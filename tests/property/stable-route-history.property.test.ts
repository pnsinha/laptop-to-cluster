import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  canonicalPath,
  generateCanonicalRoutes,
  validateRedirects,
  validateRegistry,
} from '../../site/src/content/registry.js';

const slugPart = fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'), {
  minLength: 1,
  maxLength: 8,
}).map((characters) => characters.join(''));
const stableSlug = fc.array(slugPart, { minLength: 1, maxLength: 3 })
  .map((parts) => parts.join('-'));
const historyEntry = fc.record({
  slug: stableSlug,
  status: fc.constantFrom('published' as const, 'superseded' as const, 'archived' as const),
  reason: fc.constantFrom('moved' as const, 'superseded' as const, 'archived' as const),
});
const routeHistory = fc.uniqueArray(historyEntry, {
  minLength: 2,
  maxLength: 10,
  selector: ({ slug }) => slug,
});
const redirectHostname = fc.constantFrom(
  'www.laptop-to-cluster.org',
  'laptoptocluster.org',
  'laptop-to-cluster.pnsinha.com',
);

const idFor = (index: number, slug: string) => `item-${index}-${slug}`;

function contentRecord(index: number, slug: string, status: 'published' | 'superseded' | 'archived', successorId: string) {
  return {
    id: idFor(index, slug), stable_slug: slug, title: `Guide ${index}`, summary: `Guide ${index} summary`,
    artifact_type: 'guidance-note', topics: ['routes'], keywords: ['stable-url'], audiences: ['readers'],
    milestone: 1, status, publication_date: '2026-07-01', supporting_artifacts: [],
    ...(status === 'superseded' ? { successor_id: successorId } : {}),
  };
}

describe('Property 11: Stable route history remains resolvable', () => {
  it('keeps every generated canonical and former route resolvable without loops', () => {
    // Feature: bssw-fellowship-resource-site, Property 11: Stable route history remains resolvable
    // **Validates: Requirements 7.1, 7.2, 7.3**
    fc.assert(fc.property(routeHistory, redirectHostname, (entries, hostname) => {
      const successorId = idFor(entries.length - 1, entries.at(-1)!.slug);
      const content = entries.map(({ slug, status }, index) =>
        contentRecord(index, slug, index === entries.length - 1 ? 'published' : status, successorId));
      const registry = validateRegistry({ content });
      const routes = generateCanonicalRoutes(registry.content);
      const reversedRoutes = generateCanonicalRoutes([...registry.content].reverse());
      const canonicalEntries = registry.content.map((item) => [item.id, canonicalPath(item)] as const);

      expect(new Set(canonicalEntries.map(([, path]) => path)).size).toBe(registry.content.length);
      for (const [id, path] of canonicalEntries) {
        expect(routes.get(path)?.id).toBe(id);
        expect(reversedRoutes.get(path)?.id).toBe(id);
      }

      const formerPaths = entries.map(({ slug }, index) => `/legacy/${index}-${slug}/`);
      const redirects = entries.map(({ reason }, index) => ({
        id: `redirect-${index}`, from: formerPaths[index], to: canonicalEntries[index][1],
        reason, active_from: '2026-07-02',
      }));
      const validated = validateRedirects({
        redirects,
        currentPaths: routes.keys(),
        previousPaths: [...routes.keys(), ...formerPaths],
        retiredPaths: formerPaths,
      });
      const bySource = new Map(validated.map((redirect) => [redirect.from, redirect]));

      for (const [index, formerPath] of formerPaths.entries()) {
        const redirect = bySource.get(formerPath)!;
        expect(redirect.to).toBe(canonicalEntries[index][1]);
        expect(redirect.to).not.toBe(formerPath);
        expect(bySource.has(redirect.to)).toBe(false);
        expect(routes.has(redirect.to)).toBe(true);
      }
      for (const item of registry.content.filter(({ status }) => status === 'superseded')) {
        expect(item.successor_id).toBe(successorId);
        expect(registry.content.find(({ id }) => id === item.successor_id)?.status).toBe('published');
        expect(routes.get(canonicalPath(item))?.id).toBe(item.id);
      }

      expect(() => validateRedirects({
        redirects: [{ ...redirects[0], from: `https://${hostname}${redirects[0].from}` }],
        currentPaths: routes.keys(),
      })).toThrow(/origin-relative/);
    }), { numRuns: 200 });
  });
});