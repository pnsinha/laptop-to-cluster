import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateFrontendPolicy } from '../../scripts/publication.mjs';

/* The site's stylesheets on Starlight: the layer order that puts the theme above Starlight, the
   safeguards every stylesheet must keep (reduced motion, forced colours, focus), the policy on
   motion and remote fonts, and the one rule that keeps the design uniform: every class a template
   uses is defined in a stylesheet, and every class a stylesheet defines is used somewhere. */
const root = fileURLToPath(new URL('../..', import.meta.url));
const styles = `${root}/site/src/styles`;
const read = (name: string) => readFileSync(`${styles}/${name}`, 'utf8');
const SHEETS = ['layers.css', 'tokens.css', 'fonts.css', 'starlight-theme.css', 'components.css', 'enhancements.css'];
const site = SHEETS.map(read).join('\n');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

describe('cascade layers', () => {
  it('declares flat layer names with Starlight between the base and the theme', () => {
    expect(read('layers.css')).toMatch(/@layer l2c-base, starlight, l2c-theme, l2c-components, l2c-utilities;/);
    expect(site).not.toMatch(/@layer\s+l2c\./);
    expect(read('starlight-theme.css')).toMatch(/^@layer l2c-theme \{/m);
    expect(read('components.css')).toMatch(/^@layer l2c-components \{/m);
    expect(read('components.css')).toMatch(/^@layer l2c-utilities \{/m);
  });

  it('lists the layer file first in Starlight\'s customCss, then tokens and fonts', () => {
    const config = readFileSync(`${root}/site/astro.config.mjs`, 'utf8');
    const custom = config.match(/customCss:\s*\[([\s\S]*?)\]/)?.[1] ?? '';
    const files = [...custom.matchAll(/'\.\/src\/styles\/([a-z-]+\.css)'/g)].map((match) => match[1]);
    expect(files).toEqual(SHEETS);
  });
});

describe('safeguards', () => {
  it('neutralises scroll, transition and animation inside the reduced-motion block', () => {
    const block = read('components.css').match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
    for (const rule of ['scroll-behavior: auto !important', 'transition: none !important', 'animation: none !important']) expect(block).toContain(rule);
  });

  it('keeps a 2px Highlight focus ring under forced colours and never removes an outline', () => {
    const forced = read('components.css').match(/@media \(forced-colors: active\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
    expect(forced).toContain(':focus-visible { outline: 2px solid Highlight;');
    expect(site).not.toMatch(/outline:\s*(?:none|0)\b/);
  });

  it('draws no motion, gradients, glass or remote fonts of its own', () => {
    const manifest = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'));
    const config = readFileSync(`${root}/site/astro.config.mjs`, 'utf8');
    for (const name of SHEETS) expect(validateFrontendPolicy(manifest, config, [{ path: name, text: read(name) }]), name).toEqual([]);
    expect(site).not.toMatch(/linear-gradient|radial-gradient|backdrop-filter|box-shadow:\s*(?!none)/);
  });

  it('keeps the concept chip rule shared and wrapping', () => {
    const chip = read('components.css').match(/\n\s*\.c-step, \.c-gate, \.c-scratch, \.c-net \{([^}]*)\}/)?.[1] ?? '';
    expect(chip).toContain('overflow-wrap: anywhere');
    expect(chip).not.toContain('white-space: nowrap');
  });
});

describe('class uniformity', () => {
  /* Classes Starlight, Astro and Shiki provide or add at build time; the site styles some of them but defines none. */
  const PROVIDED = /^(?:sl-|astro-|starlight-|seti:)/;
  const PROVIDED_NAMES = new Set(['not-content', 'hero', 'hero-html', 'tagline', 'site-title', 'content-panel', 'pagination-links', 'header', 'sidebar', 'right-sidebar', 'astro-code', 'title', 'description', 'stack', 'icon', 'card', 'body', 'light', 'dark', 'print', 'md', 'cheat-sheet-print', 'primary', 'secondary', 'minimal', 'card-grid', 'caret', 'right-sidebar-container', 'main-pane']);
  /* Classes a template sets from a prop or a typed union, so no literal class attribute carries them. */
  const DYNAMIC = ['degraded', 'unavailable', 'c-step', 'c-gate', 'c-scratch', 'c-net', 'evidence-untested', 'table-overflow', 'table-overflow__instruction', 'layout-data'];
  const templates = [...walk(`${root}/site/src`), ...walk(`${root}/site/plugins`)].filter((path) => /\.(astro|ts|mjs)$/.test(path) && !path.includes('/content/content-items/'));
  const markdown = walk(`${root}/site/src/content/content-items`).filter((path) => path.endsWith('.md'));
  const isName = (name: string) => /^[a-z][a-z0-9_-]*$/.test(name) && !name.endsWith('-');
  const used = new Set<string>(DYNAMIC);
  for (const file of [...templates, ...markdown]) {
    const source = file.endsWith('.md') ? readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '') : readFileSync(file, 'utf8');
    for (const match of source.matchAll(/class(?:Name)?=(?:"|'|\{`)([^"'`{}]*)/g)) for (const name of match[1].split(/\s+/)) if (isName(name)) used.add(name);
    for (const match of source.matchAll(/class=([a-z][a-z0-9_-]*)/g)) used.add(match[1]);
    for (const match of source.matchAll(/class:list=\{\[([\s\S]*?)\]\}/g)) for (const name of match[1].match(/'([a-z][a-z0-9_-]*)'/g) ?? []) used.add(name.replaceAll("'", ''));
    if (file.endsWith('.ts')) for (const match of source.matchAll(/'([a-z][a-z0-9-]*__[a-z0-9-]+)'/g)) used.add(match[1]);
  }
  /* Starlight's responsive utilities (.lg\:sl-hidden) are provided, not defined here. */
  const css = site.replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\([^)]*\)/g, '').replace(/"[^"]*"|'[^']*'/g, '').replace(/\.(?:sm|md|lg)\\:sl-[a-z]+/g, '');
  const defined = new Set([...css.matchAll(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g)].map((match) => match[1]).filter((name) => !/^\d/.test(name)));

  it('defines every class the templates use', () => {
    const missing = [...used].filter((name) => !defined.has(name) && !PROVIDED.test(name) && !PROVIDED_NAMES.has(name)).sort();
    expect(missing).toEqual([]);
  });

  it('uses every class the stylesheets define', () => {
    const svgText = readFileSync(`${root}/site/src/components/Diagrams.astro`, 'utf8');
    const dead = [...defined].filter((name) => !used.has(name) && !PROVIDED.test(name) && !PROVIDED_NAMES.has(name) && !svgText.includes(`class="${name}`)).sort();
    expect(dead).toEqual([]);
  });
});
