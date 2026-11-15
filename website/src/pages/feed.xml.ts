import { readFileSync } from 'node:fs';
import { getCollection } from 'astro:content';
import { parse } from 'yaml';
import { CANONICAL_ORIGIN, feedEntrySchema } from '../content/schema';

export const prerender = true;

const pagePath = (id: string): string => (id === 'index' ? '/' : `/${id}/`);
const xml = (value: string) => value.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

/* Items come from src/content/feed.yml, in its order. An item without a title takes the title of the
   page it links to, so a page title is written once, in the page. */
export async function GET() {
  const titles = new Map((await getCollection('docs')).map(({ id, data }) => [pagePath(id), data.title]));
  const entries = feedEntrySchema.array().parse(parse(readFileSync('src/content/feed.yml', 'utf8')));
  const items = entries.map(({ link, date, title }) => {
    const page = link.split('#')[0];
    const name = title ?? titles.get(page);
    if (!name) throw new Error(`feed.yml: ${link} is not a page`);
    const url = `${CANONICAL_ORIGIN}${link}`;
    return `<item><guid>${xml(url)}</guid><link>${xml(url)}</link><title>${xml(name)}</title><pubDate>${new Date(`${date}T00:00:00Z`).toUTCString()}</pubDate></item>`;
  }).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Laptop-to-Cluster updates</title><link>${CANONICAL_ORIGIN}/</link><description>Published resource updates</description>${items}</channel></rss>`, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
