import type { Browser, Page } from 'playwright';
import { CONCEPTS, DOORS, EVIDENCE_ROW_LABELS, THEME_STORAGE_KEY, TIMELINE_STEPS } from '../../site/src/content/contracts';
import type { TokenMap } from './token-pairs';

export interface Issue { scope: string; code: string; message: string }
export type ThemeTokens = { light: TokenMap; dark: TokenMap };
export const issue = (scope: string, code: string, message: string): Issue => ({ scope, code, message });

/** Static look at the raw HTML: one blocking inline script in <head>, at most 300 bytes, that reads the stored choice. */
export function inspectThemeScript(html: string, scope: string): Issue[] {
  const head = html.match(/<head[\s\S]*?<\/head>/i)?.[0] ?? '';
  const scripts = [...head.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/\bsrc=/i.test(match[1]) && match[2].includes(THEME_STORAGE_KEY));
  if (scripts.length !== 1) return [issue(scope, 'A11Y-THEME-SCRIPT', `expected exactly one inline <head> script that reads ${THEME_STORAGE_KEY}, found ${scripts.length}`)];
  const [, attributes, code] = scripts[0];
  const issues: Issue[] = [];
  if (/\btype\s*=\s*["']?module|\bdefer\b|\basync\b/i.test(attributes)) issues.push(issue(scope, 'A11Y-THEME-SCRIPT', 'the theme script must be a classic blocking script, or the first paint can show the wrong theme'));
  const bytes = Buffer.byteLength(code.trim());
  if (bytes > 300) issues.push(issue(scope, 'A11Y-THEME-SCRIPT', `the theme script is ${bytes} bytes; the limit is 300`));
  return issues;
}

const THEME_CASES = [
  { id: 'stored dark, OS light', stored: 'dark', os: 'light', attr: 'dark', canvas: 'dark', scheme: 'dark' },
  { id: 'stored light, OS dark', stored: 'light', os: 'dark', attr: 'light', canvas: 'light', scheme: 'light' },
  { id: 'nothing stored, OS dark', stored: null, os: 'dark', attr: null, canvas: 'dark', scheme: 'dark' },
  { id: 'nothing stored, OS light', stored: null, os: 'light', attr: null, canvas: 'light', scheme: 'light dark' },
  { id: 'unrecognised value, OS dark', stored: 'purple', os: 'dark', attr: null, canvas: 'dark', scheme: 'dark' },
] as const;

const readTheme = (page: Page) => page.evaluate((key) => {
  const root = document.documentElement;
  const meta = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].find((element) => !element.media);
  return {
    attr: root.getAttribute('data-theme'),
    stored: (() => { try { return localStorage.getItem(key); } catch { return null; } })(),
    canvas: getComputedStyle(root).getPropertyValue('--canvas').trim().toLowerCase(),
    scheme: getComputedStyle(root).colorScheme,
    themeColor: meta?.content ?? null,
    pressed: [...document.querySelectorAll<HTMLElement>('[data-theme-choice][aria-pressed="true"]')].map((element) => element.dataset.themeChoice),
    controlShown: (() => { const control = document.querySelector<HTMLElement>('[data-theme-control]'); return Boolean(control && !control.hidden && control.getClientRects().length); })(),
    log: (window as unknown as { __themeLog?: { attr: number; body: number } }).__themeLog ?? null,
  };
}, THEME_STORAGE_KEY);

/** §10 Theme: manual choice beats the OS, System follows the OS, no wrong-theme flash, no-JS follows the OS. */
export async function checkThemePrecedence(browser: Browser, origin: string, path: string, themes: ThemeTokens): Promise<Issue[]> {
  const issues: Issue[] = [];
  const url = new URL(path, origin).href;
  const themeColors: Record<string, string | null> = {};
  for (const testCase of THEME_CASES) {
    const scope = `${path}:theme:${testCase.id}`;
    const context = await browser.newContext({ colorScheme: testCase.os });
    const page = await context.newPage();
    await page.addInitScript(({ key, stored }) => {
      if (stored !== null) { try { localStorage.setItem(key, stored); } catch { /* storage unavailable */ } }
      const log = { seq: 0, attr: -1, body: -1 };
      (window as unknown as { __themeLog: typeof log }).__themeLog = log;
      new MutationObserver((records) => {
        for (const record of records) {
          log.seq += 1;
          if (record.type === 'attributes' && record.attributeName === 'data-theme' && log.attr < 0) log.attr = log.seq;
          if (record.type === 'childList' && [...record.addedNodes].some((node) => node.nodeName === 'BODY') && log.body < 0) log.body = log.seq;
        }
      }).observe(document, { attributes: true, childList: true, subtree: true });
    }, { key: THEME_STORAGE_KEY, stored: testCase.stored });
    await page.goto(url, { waitUntil: 'load' });
    const state = await readTheme(page);
    if (state.attr !== testCase.attr) issues.push(issue(scope, 'A11Y-THEME-PRECEDENCE', `data-theme is ${JSON.stringify(state.attr)}, expected ${JSON.stringify(testCase.attr)}`));
    const expectedCanvas = themes[testCase.canvas].canvas.toLowerCase();
    if (state.canvas !== expectedCanvas) issues.push(issue(scope, 'A11Y-THEME-PRECEDENCE', `--canvas resolves to ${state.canvas}, expected the ${testCase.canvas} value ${expectedCanvas}`));
    if (state.scheme !== testCase.scheme) issues.push(issue(scope, 'A11Y-COLOR-SCHEME', `color-scheme resolves to "${state.scheme}", expected "${testCase.scheme}"`));
    if (testCase.attr !== null && !(state.log && state.log.attr > 0 && state.log.attr < state.log.body)) {
      issues.push(issue(scope, 'A11Y-THEME-FLASH', 'data-theme must be set before the <body> element is parsed, or the first paint can show the wrong theme'));
    }
    if (testCase.stored === 'dark' || testCase.stored === 'light') themeColors[testCase.stored] = state.themeColor;
    await context.close();
  }
  if (!themeColors.dark || !themeColors.light || themeColors.dark === themeColors.light) {
    issues.push(issue(`${path}:theme`, 'A11Y-THEME-COLOR', 'the head script must write a theme-color meta (no media attribute) whose value differs between a stored light and a stored dark choice'));
  }

  const context = await browser.newContext({ colorScheme: 'light' });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  const scope = `${path}:theme-control`;
  let state = await readTheme(page);
  if (!state.controlShown || state.pressed.join() !== 'system') issues.push(issue(scope, 'A11Y-THEME-CONTROL', 'the control must be shown by script with System pressed when nothing is stored'));
  await page.click('[data-theme-choice="dark"]');
  state = await readTheme(page);
  if (state.attr !== 'dark' || state.stored !== 'dark' || state.canvas !== themes.dark.canvas.toLowerCase() || state.pressed.join() !== 'dark') {
    issues.push(issue(scope, 'A11Y-THEME-CONTROL', 'choosing Dark must set data-theme, store the choice, switch the tokens and press only Dark'));
  }
  await page.reload({ waitUntil: 'load' });
  state = await readTheme(page);
  if (state.attr !== 'dark' || state.pressed.join() !== 'dark') issues.push(issue(scope, 'A11Y-THEME-CONTROL', 'a stored choice must survive a reload, with its button pressed'));
  await page.click('[data-theme-choice="system"]');
  state = await readTheme(page);
  if (state.attr !== null || (state.stored !== null && state.stored !== 'system') || state.canvas !== themes.light.canvas.toLowerCase() || state.pressed.join() !== 'system') {
    issues.push(issue(scope, 'A11Y-THEME-CONTROL', 'choosing System must clear data-theme and the stored choice and follow the OS'));
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  state = await readTheme(page);
  if (state.attr !== null || state.canvas !== themes.dark.canvas.toLowerCase()) issues.push(issue(scope, 'A11Y-THEME-CONTROL', 'System must follow a live change of the OS scheme'));
  await page.click('[data-theme-choice="light"]');
  state = await readTheme(page);
  if (state.attr !== 'light' || state.canvas !== themes.light.canvas.toLowerCase()) issues.push(issue(scope, 'A11Y-THEME-PRECEDENCE', 'a manual Light choice must beat an OS dark preference'));
  await context.close();

  const noScript = await browser.newContext({ colorScheme: 'dark', javaScriptEnabled: false });
  const plain = await noScript.newPage();
  await plain.goto(url, { waitUntil: 'load' });
  const plainState = await readTheme(plain);
  if (plainState.attr !== null || plainState.canvas !== themes.dark.canvas.toLowerCase() || plainState.controlShown) {
    issues.push(issue(`${path}:theme-no-script`, 'A11Y-THEME-NOJS', 'without JavaScript the page must follow the OS scheme and keep the theme control hidden'));
  }
  await noScript.close();
  return issues;
}
