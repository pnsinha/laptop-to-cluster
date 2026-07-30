import { getCollection } from 'astro:content';
import { CANONICAL_ORIGIN } from '../content/schema';
import { projectDiscovery } from '../content/projections';
export const prerender = true;
export async function GET() {
  const content = (await getCollection('contentItems')).map(({ data }) => data);
  const applicability = (await getCollection('applicability')).map(({ data }) => data);
  const projected = projectDiscovery(content);
  const fixed = ['/', '/resources/', '/diagnostics/'].map((path) => ({ id: path === '/' ? 'home' : path.split('/')[1], path, url: `${CANONICAL_ORIGIN}${path}` }));
  const applicabilityRecords = applicability.map(({ id }) => {
    const path = `/applicability/${id}/`;
    return { id, path, url: `${CANONICAL_ORIGIN}${path}` };
  });
  const records = [...fixed, ...applicabilityRecords, ...projected.url_manifest].sort((a,b) => a.url.localeCompare(b.url));
  return new Response(JSON.stringify({ canonical_origin: CANONICAL_ORIGIN, records }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
