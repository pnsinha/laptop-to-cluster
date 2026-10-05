import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const fonts = join(root, 'site/public/fonts');
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

/* IBM and Fontsource files are pinned byte for byte: this is what proves the Plex
   files are IBM's own pre-split files and were never re-subset (Reserved Font Name "Plex").
   The L2C Marks pin holds for fontTools 4.63.0 + brotli 1.2.0 with the flags in SUBSET.txt. */
const WOFF2 = {
  'source-serif-4-5.3.0/source-serif-4-latin-wght-normal.woff2': { bytes: 50_824, sha: 'c1df4596be5029233ed2afbb8b2f6ea20784b3fb1aa5d6b5c6519ccd85eb3dfb' },
  'source-serif-4-5.3.0/source-serif-4-latin-400-italic.woff2': { bytes: 20_092, sha: '882b7c150c29f29d4f8daae6b8dcae8662aac7f28ca34b34615305154136ecfd' },
  'ibm-plex-sans-1.1.0/IBMPlexSans-Regular-Latin1.woff2': { bytes: 20_984, sha: 'b5ad7bd39f996144915f0ad9849a90183b27d8c28ad97ed98af5b1bebc51f6b1' },
  'ibm-plex-sans-1.1.0/IBMPlexSans-SemiBold-Latin1.woff2': { bytes: 22_260, sha: 'fff0ab3a88b0b4aa0b693e4f0201359a15183b08e3fa5696d1918d8f0ade8ad5' },
  'ibm-plex-mono-2.5.0/IBMPlexMono-Regular-Latin1.woff2': { bytes: 17_544, sha: 'e8993d946649b9d01abb1ed06d574b19d8ea3e66b5c3948602db335c44c18e56' },
  'l2c-marks-noto-sans-symbols-2-5.3.0/L2CMarks-Regular.woff2': { bytes: 740, sha: 'ec15d525f502ce1a5b2b11f774f50e6451481f9b854c777357df2ef9275212e5' },
} as const;
const LICENCES = {
  'source-serif-4-5.3.0/OFL.txt': 'Copyright 2014 The Source Serif 4 Project Authors',
  'ibm-plex-sans-1.1.0/LICENSE.txt': 'Reserved Font Name "Plex"',
  'ibm-plex-mono-2.5.0/LICENSE.txt': 'Reserved Font Name "Plex"',
  'l2c-marks-noto-sans-symbols-2-5.3.0/OFL.txt': 'Copyright 2022 The Noto Project Authors',
} as const;

const listFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? listFiles(join(directory, entry.name)).map((child) => `${entry.name}/${child}`) : [entry.name]));

describe('vendored font files', () => {
  it.each(Object.entries(WOFF2))('ships %s unchanged', (path, { bytes, sha }) => {
    const absolute = join(fonts, path);
    expect(existsSync(absolute), path).toBe(true);
    expect(readFileSync(absolute).subarray(0, 4).toString('latin1')).toBe('wOF2');
    expect(readFileSync(absolute).length).toBe(bytes);
    expect(sha256(absolute)).toBe(sha);
  });

  it('keeps the total under the 140 KB per-page font budget', () => {
    const total = Object.keys(WOFF2).reduce((sum, path) => sum + readFileSync(join(fonts, path)).length, 0);
    expect(total).toBeLessThanOrEqual(140_000);
  });

  it.each(Object.entries(LICENCES))('ships the licence %s with the OFL text and the copyright line', (path, line) => {
    const text = readFileSync(join(fonts, path), 'utf8');
    expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(text).toContain(line);
  });

  it('declares no Reserved Font Name for the Google Fonts builds (the copyright line is the first line)', () => {
    for (const path of ['source-serif-4-5.3.0/OFL.txt', 'l2c-marks-noto-sans-symbols-2-5.3.0/OFL.txt']) {
      expect(readFileSync(join(fonts, path), 'utf8').split('\n').find((line) => line.startsWith('Copyright'))).not.toMatch(/Reserved Font Name/);
    }
  });

  it('contains nothing else: no other font binaries, no TTF/OTF/WOFF, only woff2 and licence or provenance text', () => {
    const files = listFiles(fonts).sort();
    const allowed = new Set([...Object.keys(WOFF2), ...Object.keys(LICENCES), 'l2c-marks-noto-sans-symbols-2-5.3.0/SUBSET.txt']);
    expect(files.filter((file) => !allowed.has(file))).toEqual([]);
  });

  it('records how L2C Marks was derived, with the exact command and the four code points', () => {
    const text = readFileSync(join(fonts, 'l2c-marks-noto-sans-symbols-2-5.3.0/SUBSET.txt'), 'utf8');
    expect(text).toContain('U+25A0,U+25B2,U+25C6,U+25CF');
    expect(text).toContain('pyftsubset');
    expect(text).toContain('@fontsource/noto-sans-symbols-2@5.3.0');
  });
});
