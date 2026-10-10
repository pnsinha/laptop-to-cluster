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

describe('scanner wiring: gates, routes, requests', () => {
  it('runs every automatable release gate through the shared browser checks', () => {
    expect(scanner).toContain("from '../tests/accessibility/browser-checks'");
    for (const call of [
      'checkThemePrecedence(', 'inspectThemeScript(', 'checkForcedColors(', 'checkPrint(', 'checkJsOff(',
      'checkPrimaryAction(', 'checkFontBlocking(', 'checkCrosswalkLayout(', 'checkComponentGeometry(', 'checkMotion(',
    ]) expect(scanner, call).toContain(call);
  });

  it('drops the v0.1.0 workflow figure, Module 0 slug, and old primary action', () => {
    for (const stale of ['workflow-figure', 'how-to-use-this-guide', 'Start with Module 0', 'One allocation, five ordered responsibilities', "!== '/start/'"]) {
      expect(scanner, stale).not.toContain(stale);
    }
    expect(scanner).toContain('NAV_ITEMS[0].href');
    expect(scanner).toContain("'Start with the big idea', 'big-idea'");
  });

  it('checks at 320px that each timeline step label sits above its caption, on every module page with a timeline', () => {
    expect(scanner).toContain("'.timeline li.timeline__step'");
    expect(scanner).toContain("'.timeline__caption'");
    expect(scanner).toContain('label.getBoundingClientRect().top <= caption.getBoundingClientRect().top');
    expect(scanner).toContain("'A11Y-READING-ORDER', 'each timeline step label must sit above its caption at 320px'");
    expect(scanner).toContain("kind === 'conceptual module' || kind === 'runnable module'");
    expect(scanner).toContain('path === MODULE_2_PATH');
  });

  it('checks 768 and 1280 pixel widths, and only /fonts/*.woff2 as a same-origin font', () => {
    expect(scanner).toContain('for (const width of [768, 1280])');
    expect(scanner).toContain('A11Y-FONT-MIME');
    expect(scanner).toContain('same-origin fonts must be /fonts/*.woff2 files');
  });
});
