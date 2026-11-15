import { getCollection } from 'astro:content';
import { projectDiscovery } from '../content/projections';
export const prerender = true;
const xml = (value: string) => value.replace(/[<>&'"]/g, (c) => ({ '<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;' })[c]!);
export async function GET() {
  const content = (await getCollection('contentItems')).map(({ data }) => data);
  const items = projectDiscovery(content).feed.map((item) => `<item><guid>${xml(item.url)}</guid><link>${xml(item.url)}</link><title>${xml(item.title)}</title><pubDate>${new Date(`${item.date}T00:00:00Z`).toUTCString()}</pubDate></item>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Laptop-to-Cluster updates</title><link>https://laptop-to-cluster.org/</link><description>Published resource updates</description>${items}</channel></rss>`, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
