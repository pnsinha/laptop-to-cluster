import { describe, expect, it } from 'vitest';
import { ACKNOWLEDGMENT_DISCLAIMER, ACKNOWLEDGMENT_STATEMENT } from '../../src/content/acknowledgment';
import { pages, text } from './dist';

/* Check 4: the BSSw acknowledgment and the DOE/NSF disclaimer, character for character, on every page,
   and the attribution page's license and font credits. */
describe('acknowledgment', () => {
  for (const { path, html } of pages) {
    it(`appears verbatim on ${path}`, () => {
      const footer = /<p class="acknowledgment">([\s\S]*?)<\/p>/.exec(html)?.[1];
      expect(footer, 'the footer acknowledgment paragraph').toBeDefined();
      expect(text(footer!)).toBe(`${ACKNOWLEDGMENT_STATEMENT} ${ACKNOWLEDGMENT_DISCLAIMER}`);
    });
  }
});

/* The attribution page points at license files that exist now; files only v0.1.0 shipped are named as that release's. */
describe('attribution and licenses', () => {
  const html = pages.find(({ path }) => path === '/about/attribution/')!.html;
  it('links the current license files and calls no deleted file authoritative', () => {
    expect(html).toContain('href="https://github.com/pnsinha/laptop-to-cluster/blob/main/LICENSE"');
    expect(html).toContain('href="https://creativecommons.org/licenses/by/4.0/"');
    expect(html).toContain('href="https://github.com/pnsinha/laptop-to-cluster/blob/main/README.md#license"');
    expect(text(html)).not.toMatch(/authoritative/i);
    expect(html).not.toMatch(/blob\/v0\.1\.0\/licenses\//);
  });
  it('credits the self-hosted fonts', () => {
    expect(text(html)).toContain('The site’s fonts are self-hosted under the SIL Open Font License 1.1: Source Serif 4 (The Source Serif 4 Project Authors); IBM Plex Sans and IBM Plex Mono (IBM Corp.); and a subset of Noto Sans Symbols 2 for the diagram marks (The Noto Project Authors). Each font’s license file is published beside it.');
  });
});
