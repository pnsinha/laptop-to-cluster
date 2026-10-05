import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONCEPTS } from '../../site/src/content/contracts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = resolve(root, 'site/dist');
/* Gate G2. The page total is the spec budget (client JS <= 2 KB per page, theme and print scripts included).
   The highlight script's own cap is R13's 840 B lean variant (boot <= 300 B, print <= 200 B,
   ThemeControl <= 700 B, highlight <= 840 B; total 2,040 <= 2,048). Raise neither number; drop W9 instead (Task 5). */
const PAGE_JS_BUDGET = 2048;
const HIGHLIGHT_JS_CAP = 840;

const htmlPages = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? htmlPages(join(dir, entry.name)) : entry.name.endsWith('.html') ? [join(dir, entry.name)] : []);
const scriptsOf = (html: string) => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map(([, attrs, inline]) => {
  const src = attrs.match(/\ssrc="([^"?]+)/)?.[1];
  const text = src ? readFileSync(join(dist, src), 'utf8') : inline;
  return { source: src ?? 'inline', text, bytes: Buffer.byteLength(text) };
});
const ISMINE = (script: { text: string }) => script.text.includes('crosswalk__status');
const home = readFileSync(join(dist, 'index.html'), 'utf8');
const section = home.match(/<section class="crosswalk"[\s\S]*?<\/section>/)?.[0] ?? '';

describe('crosswalk highlight: static output', () => {
  it('ships the script on the home page and on no other page', () => {
    const carriers = htmlPages(dist).filter((file) => scriptsOf(readFileSync(file, 'utf8')).some(ISMINE));
    expect(carriers.map((file) => file.slice(dist.length))).toEqual(['/index.html']);
  });

  it('loads it once, as a module, with no inline handler', () => {
    const mine = scriptsOf(home).filter(ISMINE);
    expect(mine).toHaveLength(1);
    expect(mine[0].text).toContain('addEventListener');
    expect(home).toMatch(/<script type="module"/);
    expect(home).not.toMatch(/\son(?:click|keydown|keyup|load|change)=/i);
  });

  it('keeps the home page inside the client JS budget', () => {
    const scripts = scriptsOf(home);
    const total = scripts.reduce((sum, { bytes }) => sum + bytes, 0);
    const detail = scripts.map(({ source, bytes }) => `${source}=${bytes}B`).join(', ');
    expect(total, `home scripts: ${detail}`).toBeLessThanOrEqual(PAGE_JS_BUDGET);
    expect(scripts.find(ISMINE)!.bytes, `home scripts: ${detail}`).toBeLessThanOrEqual(HIGHLIGHT_JS_CAP);
  });

  it('keeps the static crosswalk complete: legend, tagged lines in both panes, no control', () => {
    expect(section).not.toBe('');
    const keys = [...section.matchAll(/class="crosswalk__term" data-concept="(\w+)"/g)].map(([, key]) => key);
    expect(keys).toEqual(CONCEPTS.map(({ key }) => key));
    const panes = new Map([...section.matchAll(/<figure class="crosswalk__pane" data-pane="(\w+)">([\s\S]*?)<\/figure>/g)].map(([, id, body]) => [id, body]));
    for (const { key } of CONCEPTS) {
      for (const pane of ['compose', 'sbatch']) {
        expect(panes.get(pane), `${pane} pane`).toMatch(new RegExp(`class="crosswalk__line" data-concepts="[^"]*\\b${key}\\b`));
      }
    }
    expect(section).not.toMatch(/<button|role="status"|data-selected|crosswalk__line--selected|Select a term/);
  });

  it('keeps the sources free of handlers and styles', () => {
    const script = readFileSync(resolve(root, 'site/src/scripts/crosswalk-highlight.ts'), 'utf8');
    const component = readFileSync(resolve(root, 'site/src/components/CrosswalkEnhancement.astro'), 'utf8');
    expect(script).toContain('addEventListener');
    expect(script).not.toMatch(/\.onclick|\.onkey|setTimeout|setInterval|requestAnimationFrame|transition/);
    expect(component).not.toMatch(/<style\b|<div\b|<p\b|<section\b/);
    expect(readFileSync(resolve(root, 'site/src/pages/index.astro'), 'utf8')).not.toMatch(/<script\b/);
  });
});
