import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const filesUnder = (directory) => readdirSync(directory).flatMap((name) => {
  const path = `${directory}/${name}`;
  return statSync(path).isDirectory() ? filesUnder(path) : [path];
});
const plainText = (html) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const escapeAttribute = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

export default function accessibleTables() {
  return { name: 'accessible-table-regions', hooks: { 'astro:build:done': ({ dir }) => {
    for (const file of filesUnder(fileURLToPath(dir)).filter((path) => path.endsWith('.html'))) {
      const content = readFileSync(file, 'utf8');
      const transformed = content.replace(/<table>([\s\S]*?)<\/table>/g, (table, body) => {
        const headers = [...body.matchAll(/<th(?:\s[^>]*)?>([\s\S]*?)<\/th>/g)]
          .slice(0, 3)
          .map((match) => plainText(match[1]))
          .filter(Boolean);
        const label = escapeAttribute(`${headers.length ? headers.join(', ') : 'Data'} table`);
        return `<div class="table-overflow layout-data" role="region" aria-label="${label}" tabindex="0"><p class="table-overflow__instruction">Scroll horizontally to view all table columns.</p>${table}</div>`;
      });
      if (transformed !== content) writeFileSync(file, transformed);
    }
  } } };
}
