import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateFrontendPolicy } from '../../scripts/publication.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const config = readFileSync(join(root, 'site/astro.config.mjs'), 'utf8');
const check = (text: string) => validateFrontendPolicy(manifest, config, [{ path: 'x.css', text }]).join('\n');

describe('technology exclusion: motion that is switched off', () => {
  it('allows transition and animation set to none', () => {
    expect(check('*{transition: none !important;}')).toBe('');
    expect(check('*{animation: none;}')).toBe('');
    expect(check('*{transition:none}')).toBe('');
    expect(check('*{transition-property: none;animation-name: none;}')).toBe('');
  });
  it('still rejects real motion', () => {
    expect(check('a{transition: opacity 0.2s;}')).toMatch(/TECHNOLOGY-EXCLUSION/);
    expect(check('a{animation: spin 1s;}')).toMatch(/TECHNOLOGY-EXCLUSION/);
    expect(check('a{transition: none-ish 1s;}')).toMatch(/TECHNOLOGY-EXCLUSION/);
    expect(check('@keyframes spin {}')).toMatch(/TECHNOLOGY-EXCLUSION/);
    expect(check('a{animation-name: spin;}')).toMatch(/TECHNOLOGY-EXCLUSION/);
  });
  it('accepts the real global stylesheet', () => {
    expect(check(readFileSync(join(root, 'site/src/styles/global.css'), 'utf8'))).toBe('');
  });
});
