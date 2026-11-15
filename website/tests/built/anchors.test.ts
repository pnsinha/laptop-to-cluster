import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pages } from './dist';

/* Check 3, links: every anchor the live v0.2.0 site published inside <main> still exists on the
   same page, so links into the guide keep landing. anchors.json is that list (the main element's
   own id and the hero title's id are left out); extend it, never shrink it. */
const published = JSON.parse(readFileSync(new URL('./anchors.json', import.meta.url), 'utf8')) as Record<string, string[]>;

describe('published anchors', () => {
  for (const [path, wanted] of Object.entries(published)) {
    it(`survive on ${path}`, () => {
      const html = pages.find((page) => page.path === path)?.html ?? '';
      const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
      expect(wanted.filter((id) => !ids.has(id))).toEqual([]);
    });
  }
});
