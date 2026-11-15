import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/* The built site, read by the checks in this folder. Run `npm run build` first. */
export const dist = fileURLToPath(new URL('../../dist', import.meta.url));
if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/index.html is missing: run npm run build first');

const filesUnder = (directory: string): string[] => readdirSync(directory).flatMap((name) => {
  const path = join(directory, name);
  return statSync(path).isDirectory() ? filesUnder(path) : [path];
});

/** Every built HTML page: its public path (/about/project/, /404.html) and its markup. */
export const pages = filesUnder(dist).filter((file) => file.endsWith('.html')).sort().map((file) => {
  const path = relative(dist, file).replaceAll('\\', '/');
  return { path: `/${path.replace(/index\.html$/, '')}`, html: readFileSync(file, 'utf8') };
});

export const read = (name: string): string => readFileSync(join(dist, name), 'utf8');

/** Text with tags stripped and the entities the build emits decoded. */
export const text = (html: string): string => html.replace(/<[^>]+>/g, ' ')
  .replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&#x27;', "'")
  .replace(/\s+/g, ' ').trim();
