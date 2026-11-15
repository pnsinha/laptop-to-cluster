import { describe, expect, it } from 'vitest';
import { ACKNOWLEDGMENT_DISCLAIMER, ACKNOWLEDGMENT_STATEMENT } from '../../src/content/acknowledgment';
import { pages, text } from './dist';

/* Check 4: the BSSw acknowledgment and the DOE/NSF disclaimer, character for character, on every page. */
describe('acknowledgment', () => {
  for (const { path, html } of pages) {
    it(`appears verbatim on ${path}`, () => {
      const footer = /<p class="acknowledgment">([\s\S]*?)<\/p>/.exec(html)?.[1];
      expect(footer, 'the footer acknowledgment paragraph').toBeDefined();
      expect(text(footer!)).toBe(`${ACKNOWLEDGMENT_STATEMENT} ${ACKNOWLEDGMENT_DISCLAIMER}`);
    });
  }
});
