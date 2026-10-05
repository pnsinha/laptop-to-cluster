import { createHash } from 'node:crypto';
import { brotliDecompressSync } from 'node:zlib';
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
  'l2c-marks-noto-sans-symbols-2-5.3.0/L2CMarks-Regular.woff2': { bytes: 744, sha: 'dce8ff5a07e38b39082fb1eaba1d87e50188e01de727cfe386176b0074dde608' },
} as const;
const LICENCES = {
  'source-serif-4-5.3.0/OFL.txt': 'Copyright 2014 The Source Serif 4 Project Authors',
  'ibm-plex-sans-1.1.0/LICENSE.txt': 'Reserved Font Name "Plex"',
  'ibm-plex-mono-2.5.0/LICENSE.txt': 'Reserved Font Name "Plex"',
  'l2c-marks-noto-sans-symbols-2-5.3.0/OFL.txt': 'Copyright 2022 The Noto Project Authors',
} as const;

const listFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? listFiles(join(directory, entry.name)).map((child) => `${entry.name}/${child}`) : [entry.name]));

/* Minimal WOFF2 reader: returns the code points that the cmap maps to a non-zero glyph id. */
const KNOWN_TAGS: Record<number, string> = { 0: 'cmap', 10: 'glyf', 11: 'loca' };
function mappedCodePoints(file: Buffer): number[] {
  const numTables = file.readUInt16BE(12);
  const compressedSize = file.readUInt32BE(20);
  let pos = 48;
  const base128 = () => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = file[pos++];
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) break;
    }
    return value;
  };
  const entries: { tag: string; length: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = file[pos++];
    const index = flags & 63;
    let tag = KNOWN_TAGS[index] ?? `#${index}`;
    if (index === 63) {
      tag = file.subarray(pos, pos + 4).toString('latin1');
      pos += 4;
    }
    const version = (flags >> 6) & 3;
    const origLength = base128();
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    entries.push({ tag, length: transformed ? base128() : origLength });
  }
  const data = brotliDecompressSync(file.subarray(pos, pos + compressedSize));
  let offset = 0;
  let cmap: Buffer | undefined;
  for (const entry of entries) {
    if (entry.tag === 'cmap') cmap = data.subarray(offset, offset + entry.length);
    offset += entry.length;
  }
  if (!cmap) throw new Error('no cmap table');
  const subtables = Array.from({ length: cmap.readUInt16BE(2) }, (_, i) => ({
    platform: cmap.readUInt16BE(4 + i * 8),
    encoding: cmap.readUInt16BE(6 + i * 8),
    offset: cmap.readUInt32BE(8 + i * 8),
  }));
  const pick = subtables.find((t) => t.platform === 3 && t.encoding === 10) ?? subtables.find((t) => t.platform === 3 && t.encoding === 1);
  if (!pick) throw new Error('no usable cmap subtable');
  const t = cmap.subarray(pick.offset);
  const result: number[] = [];
  const format = t.readUInt16BE(0);
  if (format === 12) {
    for (let g = 0, n = t.readUInt32BE(12); g < n; g++) {
      const start = t.readUInt32BE(16 + g * 12);
      const end = t.readUInt32BE(20 + g * 12);
      const gid0 = t.readUInt32BE(24 + g * 12);
      for (let c = start; c <= end; c++) if (gid0 + (c - start) !== 0) result.push(c);
    }
  } else if (format === 4) {
    const segs = t.readUInt16BE(6) / 2;
    const endsAt = 14;
    const startsAt = endsAt + segs * 2 + 2;
    const deltasAt = startsAt + segs * 2;
    const rangesAt = deltasAt + segs * 2;
    for (let s = 0; s < segs; s++) {
      const end = t.readUInt16BE(endsAt + s * 2);
      const start = t.readUInt16BE(startsAt + s * 2);
      const delta = t.readUInt16BE(deltasAt + s * 2);
      const range = t.readUInt16BE(rangesAt + s * 2);
      for (let c = start; c <= end; c++) {
        if (c === 0xffff) continue;
        let gid: number;
        if (range === 0) gid = (c + delta) & 0xffff;
        else {
          const at = rangesAt + s * 2 + range + (c - start) * 2;
          gid = t.readUInt16BE(at);
          if (gid !== 0) gid = (gid + delta) & 0xffff;
        }
        if (gid !== 0) result.push(c);
      }
    }
  } else throw new Error(`unsupported cmap format ${format}`);
  return result.sort((a, b) => a - b);
}

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

  it('L2C Marks maps exactly the four mark code points', () => {
    const file = readFileSync(join(fonts, 'l2c-marks-noto-sans-symbols-2-5.3.0/L2CMarks-Regular.woff2'));
    expect(mappedCodePoints(file)).toEqual([0x25a0, 0x25b2, 0x25c6, 0x25cf]);
  });

  it('records how L2C Marks was derived, with the exact command and the four code points', () => {
    const text = readFileSync(join(fonts, 'l2c-marks-noto-sans-symbols-2-5.3.0/SUBSET.txt'), 'utf8');
    expect(text).toContain('U+25A0,U+25B2,U+25C6,U+25CF');
    expect(text).toContain('pyftsubset');
    expect(text).toContain('@fontsource/noto-sans-symbols-2@5.3.0');
  });
});
