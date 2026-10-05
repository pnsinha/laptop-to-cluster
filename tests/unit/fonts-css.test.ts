import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const css = readFileSync(`${root}/site/src/styles/fonts.css`, 'utf8');
const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) =>
  Object.fromEntries([...body.matchAll(/([a-z-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()])));
const family = (face: Record<string, string>) => face['font-family'].replaceAll('"', '');

describe('fonts.css', () => {
  it('declares the four web families and the two fallback families, and nothing else', () => {
    expect([...new Set(faces.map(family))].sort()).toEqual([
      'IBM Plex Mono', 'IBM Plex Sans', 'IBM Plex Sans Fallback', 'L2C Marks', 'Source Serif 4', 'Source Serif 4 Fallback',
    ]);
  });

  it('uses font-display: swap on every face', () => {
    for (const face of faces) expect(face['font-display'], face['font-family']).toBe('swap');
  });

  it('serves WOFF2 from /fonts/ only, and every referenced file exists', () => {
    const urls = [...css.matchAll(/url\("([^"]+)"\)\s*format\("([^"]+)"\)/g)];
    expect(urls).toHaveLength(6);
    for (const [, path, format] of urls) {
      expect(format).toBe('woff2');
      expect(path.startsWith('/fonts/')).toBe(true);
      expect(existsSync(`${root}/site/public${path}`), path).toBe(true);
    }
    expect(css).not.toMatch(/https?:|@import\s+url|\.ttf|\.otf|\.woff["')]/);
  });

  it('declares the right weights: variable serif 200 900, italic 400, Plex 400 and 600, mono 400', () => {
    const find = (name: string, style = 'normal', weight?: string) => faces.find((face) => family(face) === name && (face['font-style'] ?? 'normal') === style && (weight === undefined || face['font-weight'] === weight));
    expect(find('Source Serif 4', 'normal')?.['font-weight']).toBe('200 900');
    expect(find('Source Serif 4', 'italic')?.['font-weight']).toBe('400');
    expect(find('IBM Plex Sans', 'normal', '400')).toBeDefined();
    expect(find('IBM Plex Sans', 'normal', '600')).toBeDefined();
    expect(find('IBM Plex Mono', 'normal', '400')).toBeDefined();
  });

  it('never re-subsets Plex: each Plex face points at IBM\'s own Latin1 file with IBM\'s own unicode-range', () => {
    for (const face of faces.filter((item) => family(item).startsWith('IBM Plex') && !family(item).endsWith('Fallback'))) {
      expect(face.src).toMatch(/\/fonts\/ibm-plex-(?:sans-1\.1\.0|mono-2\.5\.0)\/IBMPlex(?:Sans|Mono)-(?:Regular|SemiBold)-Latin1\.woff2/);
      expect(face['unicode-range']).toContain('U+0020-007E, U+00A0-00A3, U+00A4-00FF');
    }
  });

  it('limits L2C Marks to the four shape code points', () => {
    const marks = faces.find((face) => family(face) === 'L2C Marks')!;
    expect(marks['unicode-range']).toBe('U+25A0, U+25B2, U+25C6, U+25CF');
  });

  it('writes the metric-matched fallbacks with the quoted local() form and the spec size-adjust values', () => {
    const serif = faces.filter((face) => family(face) === 'Source Serif 4 Fallback');
    const sans = faces.filter((face) => family(face) === 'IBM Plex Sans Fallback');
    expect(serif.length).toBeGreaterThanOrEqual(1);
    expect(sans.length).toBeGreaterThanOrEqual(1);
    for (const face of serif) {
      expect(face.src).toMatch(/^local\("Georgia[^"]*"\)$/);
      expect(face['size-adjust']).toBe('108.6%');
    }
    for (const face of sans) {
      expect(face.src).toMatch(/^local\("Arial[^"]*"\)$/);
      expect(face['size-adjust']).toBe('101.6%');
    }
    expect(css).toContain('local("Georgia")');
    expect(css).toContain('local("Arial")');
  });
});
