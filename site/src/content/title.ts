/* A hyphenated word in a page title (Laptop-to-Cluster, Single-Node) is wrapped in a span so
   that it stays on one line from 30rem up. Letters, marks and digits in any script count; the
   rest of the title is left as it was. The page template escapes every part. */
export interface TitlePart { text: string; compound: boolean }

const COMPOUND = /[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)+/gu;

export function titleParts(title: string): TitlePart[] {
  const parts: TitlePart[] = [];
  let cursor = 0;
  for (const match of title.matchAll(COMPOUND)) {
    if (match.index > cursor) parts.push({ text: title.slice(cursor, match.index), compound: false });
    parts.push({ text: match[0], compound: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < title.length) parts.push({ text: title.slice(cursor), compound: false });
  return parts;
}
