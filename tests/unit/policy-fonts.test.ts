import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FONT_FAMILIES, fontFaceIssues, validateFrontendPolicy, validatePageComposition, validateStylesheets, validateTokenStylesheet } from '../../scripts/publication.mjs';

const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

const face = (family: string, src: string, extra = 'font-display:swap') => `@font-face{font-family:"${family}";src:${src};${extra}}`;
const woff = (path: string) => `url(/fonts/${path}) format("woff2")`;
const TOKENS = ':root{color-scheme:light dark;--canvas:#fff;--surface:#f6f6f6;--raised:#fff;--text:#111;--muted:#444;--primary:#0a4;--accent:#05a;--border:#bbb;--warning:#b60;--shell:#fff;--shell-text:#111;--text-base:1rem;--text-supporting:.875rem;--leading-base:1.45;'
  + '--font-display:"Source Serif 4","Source Serif 4 Fallback",ui-serif,Georgia,serif;--font-reading:"Source Serif 4","Source Serif 4 Fallback",ui-serif,Georgia,serif;--font-body:"IBM Plex Sans","IBM Plex Sans Fallback",system-ui,sans-serif;--font-technical:"IBM Plex Mono",ui-monospace,Menlo,monospace;--font-marks:"L2C Marks","Noto Sans Symbols 2",sans-serif}'
  + '@media (prefers-color-scheme:dark){:root{--canvas:#111;--shell:#111;--shell-text:#eee}}';
const FONTS = face('Source Serif 4', woff('source-serif-4-4.004/source-serif-4-latin-wght-normal.woff2'))
  + face('Source Serif 4 Fallback', 'local("Georgia")', 'size-adjust:108.6%')
  + face('IBM Plex Sans', woff('ibm-plex-sans-1.1.0/IBMPlexSans-Regular-Latin1.woff2'))
  + face('L2C Marks', woff('l2c-marks/L2CMarks-Regular.woff2'));

describe('fontFaceIssues (REMOTE-FONT)', () => {
  it('allows the self-hosted allowlist, with a Fallback suffix and local() quoted or bare', () => {
    expect(FONT_FAMILIES).toEqual(['Source Serif 4', 'IBM Plex Sans', 'IBM Plex Mono', 'L2C Marks']);
    expect(fontFaceIssues(FONTS)).toEqual([]);
    expect(fontFaceIssues(face('IBM Plex Sans Fallback', 'local(Arial)', 'size-adjust:101.6%'))).toEqual([]);
    expect(fontFaceIssues('@font-face{font-family:IBM Plex Mono;src:url("/fonts/ibm-plex-mono-2.5.0/IBMPlexMono-Regular-Latin1.woff2")format("woff2");font-display:swap;unicode-range:U+0000-00FF}')).toEqual([]);
  });

  it('rejects unknown families, remote or unscoped sources, other formats, missing src and missing swap', () => {
    const bad = [
      face('Comic Sans', woff('x/y.woff2')),
      face('IBM Plex Sans', 'url(https://fonts.example/a.woff2) format("woff2")'),
      face('IBM Plex Sans', 'url(/assets/a.woff2) format("woff2")'),
      face('IBM Plex Sans', 'url(/fonts/x/a.woff) format("woff")'),
      face('IBM Plex Sans', woff('x/a.woff2') + ', url(https://cdn.example/a.woff2) format("woff2")'),
      '@font-face{font-family:"IBM Plex Sans"}',
      face('IBM Plex Sans', woff('x/a.woff2'), 'font-display:block'),
      '@font-face{}',
    ];
    for (const css of bad) expect(fontFaceIssues(css), css).not.toEqual([]);
    expect(fontFaceIssues('@import url("https://fonts.googleapis.com/css2?family=Inter");')[0]).toMatch(/third-party/);
    expect(fontFaceIssues('a{background:url(https://fonts.bunny.net/x)}')[0]).toMatch(/third-party/);
  });
});

describe('validateFrontendPolicy font and motion scan', () => {
  const manifest = { dependencies: { '@astrojs/sitemap': '3.7.3', astro: '7.1.3' } };
  const config = "export default { site: 'https://laptop-to-cluster.org', output: 'static', integrations: [sitemap(), canonicalPolicy()] };";
  it('accepts fonts.css, reduced-motion resets, and rejects remote faces and real motion', () => {
    expect(validateFrontendPolicy(manifest, config, [{ path: 'site/src/styles/fonts.css', text: FONTS }])).toEqual([]);
    expect(validateFrontendPolicy(manifest, config, [{ path: 'a.css', text: '@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}' }])).toEqual([]);
    expect(validateFrontendPolicy(manifest, config, [{ path: 'a.css', text: face('Inter', woff('x/a.woff2')) }]).join('\n')).toMatch(/REMOTE-FONT/);
    expect(validateFrontendPolicy(manifest, config, [{ path: 'a.css', text: 'a{transition:color .2s}' }]).join('\n')).toMatch(/TECHNOLOGY-EXCLUSION/);
    expect(validateFrontendPolicy(manifest, config, [{ path: 'a.css', text: 'a{animation:spin 1s}' }]).join('\n')).toMatch(/TECHNOLOGY-EXCLUSION/);
  });
});

describe('FONT-PRELOAD', () => {
  const page = (link: string) => `<head>${link}</head><body data-composition-profile="about"><header class="content-header"><h1>A</h1><p class="lede">B.</p></header></body>`;
  it('requires same-origin font/woff2 preloads with crossorigin', () => {
    const good = '<link rel="preload" href="/fonts/a/b.woff2" as="font" type="font/woff2" crossorigin>';
    expect(validatePageComposition('/about/', page(good))).toEqual([]);
    expect(validatePageComposition('/about/', page(good.replace(' crossorigin', ''))).join('\n')).toMatch(/FONT-PRELOAD/);
    expect(validatePageComposition('/about/', page(good.replace('type="font/woff2"', ''))).join('\n')).toMatch(/FONT-PRELOAD/);
    expect(validatePageComposition('/about/', page(good.replace('/fonts/a/b.woff2', 'https://fonts.gstatic.com/b.woff2'))).join('\n')).toMatch(/FONT-PRELOAD|REMOTE-FONT/);
    expect(validatePageComposition('/about/', page('<link rel="preload" href="/_astro/a.css" as="style">'))).toEqual([]);
  });
});

describe('token stylesheet (SEMANTIC-TOKENS, size tokens, stacks)', () => {
  it('accepts the self-hosted stacks with the literal compatibility aliases', () => {
    expect(validateTokenStylesheet('a.css', TOKENS)).toEqual([]);
  });

  it('names the missing alias, size token, marks stack or colour scheme', () => {
    expect(validateTokenStylesheet('a.css', TOKENS.replaceAll('--shell-text:', '--x:')).join('\n')).toMatch(/--shell-text.*SEMANTIC-TOKENS|SEMANTIC-TOKENS.*semantic role/);
    expect(validateTokenStylesheet('a.css', TOKENS.replace('--text-base:1rem', '--text-base:var(--text-ui)')).join('\n')).toMatch(/SYSTEM-TYPOGRAPHY/);
    expect(validateTokenStylesheet('a.css', TOKENS.replace('--text-supporting:.875rem', '--text-supporting:.8rem')).join('\n')).toMatch(/SYSTEM-TYPOGRAPHY/);
    expect(validateTokenStylesheet('a.css', TOKENS.replace('"L2C Marks",', '')).join('\n')).toMatch(/SYSTEM-TYPOGRAPHY/);
    expect(validateTokenStylesheet('a.css', TOKENS.replace('"Source Serif 4","Source Serif 4 Fallback",ui-serif', '"Lora",ui-serif')).join('\n')).toMatch(/SYSTEM-TYPOGRAPHY/);
    expect(validateTokenStylesheet('a.css', TOKENS.replace('color-scheme:light dark', 'color-scheme:light')).join('\n')).toMatch(/COLOR-SCHEME/);
  });

  it('still accepts the phase-1 system-only stacks', () => {
    const system = TOKENS.replace('"Source Serif 4","Source Serif 4 Fallback",', '').replace('"IBM Plex Sans","IBM Plex Sans Fallback",', '').replace('"IBM Plex Mono",', '');
    expect(validateTokenStylesheet('a.css', system)).toEqual([]);
  });
});

describe('validateStylesheets on a built tree', () => {
  function dist(files: Record<string, string>) {
    const directory = mkdtempSync(join(tmpdir(), 'bssw-css-'));
    temporary.push(directory);
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(directory, path, '..'), { recursive: true });
      writeFileSync(join(directory, path), content);
    }
    return directory;
  }
  const fontFiles = { 'fonts/source-serif-4-4.004/source-serif-4-latin-wght-normal.woff2': 'w', 'fonts/ibm-plex-sans-1.1.0/IBMPlexSans-Regular-Latin1.woff2': 'w', 'fonts/l2c-marks/L2CMarks-Regular.woff2': 'w' };

  it('passes one token stylesheet whose font files all exist', () => {
    expect(validateStylesheets(dist({ '_astro/site.css': FONTS + TOKENS, ...fontFiles }))).toEqual([]);
  });

  it('reports a missing font file, a second token-less stylesheet, gradients and motion', () => {
    const { 'fonts/l2c-marks/L2CMarks-Regular.woff2': _removed, ...missing } = fontFiles;
    expect(validateStylesheets(dist({ '_astro/site.css': FONTS + TOKENS, ...missing })).join('\n')).toMatch(/INTERNAL-LINK.*L2CMarks-Regular\.woff2/);
    expect(validateStylesheets(dist({ '_astro/site.css': FONTS + TOKENS, '_astro/page.css': '.x{color:red}', ...fontFiles })).join('\n')).toMatch(/STYLESHEET-SPLIT/);
    expect(validateStylesheets(dist({ '_astro/site.css': FONTS + TOKENS + 'a{background:linear-gradient(red,blue)}', ...fontFiles })).join('\n')).toMatch(/VISUAL-DEPENDENCY/);
    expect(validateStylesheets(dist({ '_astro/site.css': FONTS + TOKENS + 'a{transition:color .1s}', ...fontFiles })).join('\n')).toMatch(/MOTION-EXCLUSION/);
    expect(validateStylesheets(dist({ '_astro/site.css': TOKENS + '@font-face{font-family:Inter;src:url(/x.woff2)}' })).join('\n')).toMatch(/VISUAL-DEPENDENCY/);
  });
});
