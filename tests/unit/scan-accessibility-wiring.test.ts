import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scanner = readFileSync(fileURLToPath(new URL('../../scripts/scan-accessibility.ts', import.meta.url)), 'utf8');

describe('scanner wiring: tokens, sizes, fonts', () => {
  it('audits the shipped stylesheet and every computed theme combination with the shared token-pair module', () => {
    expect(scanner).toContain("from '../tests/accessibility/token-pairs'");
    for (const call of ['auditTokens(distCss)', 'declaredColorSchemes(distCss)', 'auditTokenMap(', 'pairTokenNames(', 'assertThemeMatrix(']) expect(scanner, call).toContain(call);
    expect(scanner).not.toContain("'shell', 'shell-text'");
    expect(scanner).not.toContain('sizing.colorScheme');
  });

  it('serves woff2 with its own MIME type', () => {
    expect(scanner).toContain("['.woff2', 'font/woff2']");
  });

  it('measures the new fine-print surfaces and the rendered size of diagram text', () => {
    for (const selector of ['.door__who', '.evidence-badge', '.timeline__caption', '.crosswalk__legend', '.crosswalk figcaption']) expect(scanner, selector).toContain(selector);
    expect(scanner).toContain("'svg text, svg tspan'");
    expect(scanner).toContain('getScreenCTM()');
  });
});
