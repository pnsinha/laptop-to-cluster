import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dist = resolve(fileURLToPath(new URL('../..', import.meta.url)), 'site/dist');
const htmlFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? htmlFiles(resolve(directory, entry.name)) : entry.name.endsWith('.html') ? [resolve(directory, entry.name)] : []));
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'use', 'stop']);

/** Every <section> that is a direct child of <main>, with the class attribute it was rendered with (null when it has none). */
const mainSections = (html: string): Array<string | null> => {
  const found: Array<string | null> = [];
  const stack: string[] = [];
  const tokens = /<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  for (const match of html.matchAll(tokens)) {
    const [, , closing, name, attributes = ''] = match;
    if (!name) continue;
    const tag = name.toLowerCase();
    if (closing) {
      const index = stack.lastIndexOf(tag);
      if (index >= 0) stack.length = index;
      continue;
    }
    if (tag === 'section' && stack[stack.length - 1] === 'main') found.push(/\sclass\s*=\s*"([^"]*)"/.exec(attributes)?.[1] ?? null);
    if (!VOID.has(tag) && !/\/\s*$/.test(attributes)) stack.push(tag);
  }
  return found;
};

describe('reading sections in the built pages', () => {
  const pages = htmlFiles(dist).map((file) => ({ route: `/${relative(dist, file).replace(/index\.html$/, '')}`, sections: mainSections(readFileSync(file, 'utf8')) }));

  it('finds the built pages, with sections directly in <main>', () => {
    expect(pages.length).toBeGreaterThan(20);
    expect(pages.reduce((count, page) => count + page.sections.length, 0)).toBeGreaterThan(40);
  });

  it('gives every <section> directly in <main> a class, so the reading rules never depend on a missing one', () => {
    const classless = pages.filter((page) => page.sections.includes(null)).map((page) => page.route);
    expect(classless).toEqual([]);
  });

  it('marks the completion, related and repository sections of the module pages and the start page as reading sections', () => {
    for (const route of ['/guide/baseline-single-node-pattern/', '/guide/compose-to-hpc-translation/', '/guide/scheduler-as-orchestrator/', '/guide/tour/', '/start/']) {
      const page = pages.find((entry) => entry.route === route);
      expect(page, route).toBeDefined();
      expect(page?.sections.filter((value) => value === 'reading-section').length, route).toBeGreaterThan(0);
    }
  });
});
