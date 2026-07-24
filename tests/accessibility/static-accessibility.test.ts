import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const html = readFileSync(`${root}/site/dist/index.html`, 'utf8');

describe('foundation accessibility baseline', () => {
  it('provides language, skip navigation, landmarks, and one primary heading', () => {
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toContain('href="#main"');
    expect(html).toMatch(/<nav[^>]+aria-label="Primary"/);
    expect(html).toContain('<main id="main">');
    expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
  });

  it('does not publish images without text alternatives', () => {
    const images = html.match(/<img\b[^>]*>/g) ?? [];
    expect(images.every((image) => /\balt="[^"]*"/.test(image))).toBe(true);
  });
});
