import { getCollection } from 'astro:content';
import { CANONICAL_ORIGIN } from '../content/schema';

export const prerender = true;

/* Every public page with its durable id. Ids predate the current file layout, so a page that has
   one keeps it here; a page added later defaults to its last path segment. Test records use their
   own id. */
const DURABLE_IDS: Record<string, string> = {
  '/': 'home',
  '/about/accessibility/': 'accessibility-statement',
  '/about/attribution/': 'attribution-statement',
  '/about/project/': 'about-project',
  '/about/support/': 'support-and-recovery',
  '/events/iguide-forum-2026/': 'event-iguide-forum-2026',
  '/guide/baseline-single-node-pattern/': 'module-2-baseline',
  '/guide/compose-to-hpc-translation/': 'module-3-compose-to-hpc-translation',
  '/guide/scheduler-as-orchestrator/': 'module-1-scheduler-orchestrator',
  '/guide/tour/': 'module-0-orientation',
  '/milestones/1/': 'milestone-1',
  '/milestones/2/': 'milestone-2',
  '/start/': 'start-guide',
  '/adoption/evaluate/': 'adoption-evaluate',
};

const pagePath = (id: string): string => (id === 'index' ? '/' : `/${id}/`);

export async function GET() {
  const pages = (await getCollection('docs', ({ id }) => id !== '404')).map(({ id }) => {
    const path = pagePath(id);
    return { id: DURABLE_IDS[path] ?? path.split('/').filter(Boolean).at(-1)!, path };
  });
  const records = (await getCollection('applicability')).map(({ data }) => ({ id: data.id, path: `/applicability/${data.id}/` }));
  const all = [...pages, ...records].map(({ id, path }) => ({ id, path, url: `${CANONICAL_ORIGIN}${path}` })).sort((a, b) => a.url.localeCompare(b.url));
  return new Response(JSON.stringify({ canonical_origin: CANONICAL_ORIGIN, records: all }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
