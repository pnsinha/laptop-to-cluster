import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const origin = 'https://laptop-to-cluster.org';
const forbidden = /https:\/\/(?:www\.laptop-to-cluster\.org|laptoptocluster\.org|laptop-to-cluster\.pnsinha\.com|[^/\s"']+\.pages\.dev)/i;
const filesUnder = (directory) => readdirSync(directory).flatMap((name) => {
  const path = `${directory}/${name}`;
  return statSync(path).isDirectory() ? filesUnder(path) : [path];
});
export default function canonicalPolicy() {
  return { name: 'apex-only-discovery-policy', hooks: { 'astro:build:done': ({ dir }) => {
    const root = fileURLToPath(dir);
    for (const file of filesUnder(root)) {
      const content = readFileSync(file, 'utf8');
      if (/\.(?:xml|json)$/.test(file) && forbidden.test(content)) throw new Error(`${file}: noncanonical origin leaked into discovery output`);
      if (/\.html$/.test(file)) {
        const discovery = content.match(/<(?:link[^>]+rel="canonical"|meta[^>]+property="og:url")[^>]*>/g) ?? [];
        if (discovery.some((tag) => forbidden.test(tag) || !tag.includes(origin))) throw new Error(`${file}: canonical or Open Graph URL is not apex-only`);
      }
    }
  } } };
}
