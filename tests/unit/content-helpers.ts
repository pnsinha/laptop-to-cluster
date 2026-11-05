import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export const root = fileURLToPath(new URL('../..', import.meta.url));

/** Read a repository file by path relative to Modules/. */
export const read = (relativePath: string): string => readFileSync(resolve(root, relativePath), 'utf8');

/** Split a content item into parsed frontmatter and Markdown body. */
export function readItem(fileName: string): { data: Record<string, any>; body: string } {
  const text = read(`site/src/content/content-items/${fileName}`);
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`${fileName}: missing frontmatter`);
  return { data: parse(match[1]) as Record<string, any>, body: match[2] };
}

/** Level-2 heading texts of a Markdown body, in order. Accepts `## Text` and raw `<h2 id="x">Text</h2>`. */
export const h2s = (body: string): string[] =>
  [...body.matchAll(/^(?:## (.+)|<h2[^>]*>(.+)<\/h2>)$/gm)].map((m) => (m[1] ?? m[2]).trim());
