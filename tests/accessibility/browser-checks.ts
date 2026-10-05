import type { Browser, Page } from 'playwright';
import { CONCEPTS, DOORS, EVIDENCE_ROW_LABELS, THEME_STORAGE_KEY, TIMELINE_STEPS } from '../../site/src/content/contracts';
import type { TokenMap } from './token-pairs';

export interface Issue { scope: string; code: string; message: string }
export type ThemeTokens = { light: TokenMap; dark: TokenMap };
export const issue = (scope: string, code: string, message: string): Issue => ({ scope, code, message });

/* tsx compiles this file with esbuild keepNames, so named inner functions inside
   evaluate callbacks are emitted wrapped in __name(fn, "name"). The page defines no
   __name, so install an identity shim before any callback that declares one.
   (Task 7 pitfall note; the wrapping only happens under tsx, not under vitest.) */
const shim = (page: Page) => page.evaluate(() => {
  const globals = window as typeof window & { __name?: <T>(fn: T) => T };
  globals.__name ??= (fn) => fn;
});

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
  const meta = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].find((element) => !element.media || window.matchMedia(element.media).matches);
  return {
    attr: root.getAttribute('data-theme'),
    stored: (() => { try { return localStorage.getItem(key); } catch { return null; } })(),
    canvas: getComputedStyle(root).getPropertyValue('--canvas').trim().toLowerCase(),
    scheme: getComputedStyle(root).colorScheme,
    themeColor: meta?.content.trim().toLowerCase() ?? null,
    canvasValue: getComputedStyle(root).getPropertyValue('--canvas').trim().toLowerCase(),
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
    if (testCase.stored === 'dark' || testCase.stored === 'light') {
      themeColors[testCase.stored] = state.themeColor;
      if (state.themeColor !== state.canvasValue) {
        issues.push(issue(scope, 'A11Y-THEME-COLOR', `the theme-color in effect (${JSON.stringify(state.themeColor)}) must equal the page canvas (${JSON.stringify(state.canvasValue)}) for the stored ${testCase.stored} choice`));
      }
    }
    await context.close();
  }
  if (!themeColors.dark || !themeColors.light || themeColors.dark === themeColors.light) {
    issues.push(issue(`${path}:theme`, 'A11Y-THEME-COLOR', 'the head script must update theme-color so the theme-color meta in effect (first with no media or a matching media) matches the stored light or dark canvas and differs between them'));
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

/* ---------------------------------------------------------------------------------------------
   Part 2: forced colours and print (spec §10, §4.1, D15)
--------------------------------------------------------------------------------------------- */

/** What a route must still show under an emulated medium. Selectors come from the C2 markup contracts. */
export interface PageExpectation {
  ordered?: ReadonlyArray<{ selector: string; texts: readonly string[] }>;
  present?: readonly string[];
}

export const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

export const countTabStops = (page: Page) => page.evaluate((selector) => [...document.querySelectorAll<HTMLElement>(selector)].filter((element) => {
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || !element.getClientRects().length) return false;
  if ((element as HTMLButtonElement).disabled) return false;
  const closed = element.closest('details:not([open])');
  return !closed || element === closed.querySelector(':scope > summary');
}).length, FOCUSABLE);

async function checkExpectation(page: Page, scope: string, code: string, expectation: PageExpectation): Promise<Issue[]> {
  const issues: Issue[] = [];
  for (const { selector, texts } of expectation.ordered ?? []) {
    const found = await page.$$eval(selector, (elements) => elements
      .filter((element) => element.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
      .map((element) => ({ rect: element.getBoundingClientRect(), text: (element.textContent ?? '').replace(/\s+/g, ' ').trim() }))
      .sort((a, b) => (Math.abs(a.rect.top - b.rect.top) > Math.min(a.rect.height, b.rect.height) / 2 ? a.rect.top - b.rect.top : a.rect.left - b.rect.left))
      .map((entry) => entry.text));
    if (found.join('|') !== texts.join('|')) issues.push(issue(scope, code, `${selector} must read "${texts.join('|')}" in this order, found "${found.join('|')}"`));
  }
  for (const selector of expectation.present ?? []) {
    const state = await page.$$eval(selector, (elements) => elements.slice(0, 1).map((element) => ({
      text: (element.textContent ?? '').trim().length > 0,
      shown: element.checkVisibility({ visibilityProperty: true, opacityProperty: true }),
    })));
    if (!state.length || !state[0].text || !state[0].shown) issues.push(issue(scope, code, `${selector} must stay present, visible and non-empty`));
  }
  return issues;
}

const BOUNDARY_SELECTORS = '.notice, .door, .evidence-badge, .crosswalk__pane pre';

/** §10 Forced colours: no lost text, controls, warning boundaries or selected state; keyboard focus stays visible. */
export async function checkForcedColors(browser: Browser, origin: string, path: string, expectation: PageExpectation = {}): Promise<Issue[]> {
  const scope = `${path}:forced-colors`;
  const url = new URL(path, origin).href;
  const issues: Issue[] = [];
  const baseline = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const baselinePage = await baseline.newPage();
  await baselinePage.goto(url, { waitUntil: 'load' });
  const baselineStops = await countTabStops(baselinePage);
  await baseline.close();

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, forcedColors: 'active', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await shim(page);
  const audit = await page.evaluate((boundarySelector) => {
    const label = (element: Element) => `${element.tagName.toLowerCase()}${typeof element.className === 'string' && element.className.trim() ? `.${element.className.trim().split(/\s+/).join('.')}` : ''}`;
    const shown = (element: Element) => {
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && element.getClientRects().length > 0;
    };
    const probe = document.createElement('i');
    probe.style.backgroundColor = 'Canvas';
    document.body.append(probe);
    const canvas = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const lostText: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>('body *')) {
      if (!shown(element) || ![...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) continue;
      let background = canvas;
      for (let node: Element | null = element; node; node = node.parentElement) {
        const value = getComputedStyle(node).backgroundColor;
        if (value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') { background = value; break; }
      }
      if (getComputedStyle(element).color === background || Number.parseFloat(getComputedStyle(element).fontSize) === 0) lostText.push(label(element));
    }
    const lostBoundaries = [...document.querySelectorAll(boundarySelector)].filter(shown).filter((element) => {
      const style = getComputedStyle(element);
      const border = ['Top', 'Right', 'Bottom', 'Left'].some((side) => (style as unknown as Record<string, string>)[`border${side}Style`] !== 'none' && Number.parseFloat((style as unknown as Record<string, string>)[`border${side}Width`]) >= 1);
      return !border && style.outlineStyle === 'none';
    }).map(label);
    const signature = (element: Element) => {
      const read = (target: Element) => {
        const style = getComputedStyle(target);
        return [style.outlineStyle, style.outlineWidth, style.borderTopStyle, style.borderTopWidth, style.borderBottomWidth, style.textDecorationLine, style.fontWeight, getComputedStyle(target, '::before').content].join('|');
      };
      const strong = element.querySelector('strong');
      return read(element) + (strong ? `/${read(strong)}` : '');
    };
    const colourOnlySelected: string[] = [];
    for (const element of document.querySelectorAll('[aria-pressed="true"], a[aria-current="page"], [aria-current="step"]')) {
      const pressed = element.hasAttribute('aria-pressed');
      const group = element.closest('ul, ol, [role="group"], .theme-control') ?? element.parentElement;
      const other = [...(group?.querySelectorAll(element.tagName) ?? [])].find((peer) => peer !== element
        && (pressed ? peer.getAttribute('aria-pressed') === 'false' : !peer.hasAttribute('aria-current')));
      if (other && signature(other) === signature(element)) colourOnlySelected.push(label(element));
    }
    return { forced: matchMedia('(forced-colors: active)').matches, lostText, lostBoundaries, colourOnlySelected };
  }, BOUNDARY_SELECTORS);
  if (!audit.forced) issues.push(issue(scope, 'A11Y-FORCED-COLORS', 'forced-colors emulation did not activate'));
  if (audit.lostText.length) issues.push(issue(scope, 'A11Y-FORCED-COLORS', `text is lost against its background: ${audit.lostText.slice(0, 5).join(', ')}`));
  if (audit.lostBoundaries.length) issues.push(issue(scope, 'A11Y-FORCED-COLORS', `boundary lost (no border or outline): ${audit.lostBoundaries.slice(0, 5).join(', ')}`));
  if (audit.colourOnlySelected.length) issues.push(issue(scope, 'A11Y-FORCED-COLORS', `selected state differs from its siblings by colour only: ${audit.colourOnlySelected.slice(0, 5).join(', ')}`));
  const stops = await countTabStops(page);
  if (stops !== baselineStops) issues.push(issue(scope, 'A11Y-FORCED-COLORS', `${baselineStops} tab stops in normal mode but ${stops} under forced colours: a control was lost`));
  for (let index = 0; index < Math.min(stops, 15); index += 1) {
    await page.keyboard.press('Tab');
    const ring = await page.locator(':focus').evaluate((element) => {
      const style = getComputedStyle(element);
      return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2;
    });
    if (!ring) { issues.push(issue(scope, 'A11Y-FORCED-COLORS', `tab stop ${index + 1} has no focus outline of at least 2px`)); break; }
  }
  issues.push(...await checkExpectation(page, scope, 'A11Y-FORCED-COLORS', expectation));
  await context.close();
  return issues;
}

/** §10 Print and D15: light palette, evidence panel content visible without JS, opened and restored by beforeprint/afterprint, step order kept. */
export async function checkPrint(browser: Browser, origin: string, path: string, expectation: PageExpectation = {}): Promise<Issue[]> {
  const scope = `${path}:print`;
  const issues: Issue[] = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.emulateMedia({ media: 'print' });
  await page.goto(new URL(path, origin).href, { waitUntil: 'load' });
  await shim(page);
  const state = await page.evaluate(() => {
    const luminance = (colour: string) => {
      const channels = colour.match(/[\d.]+/g)?.map(Number) ?? [255, 255, 255];
      if (colour.startsWith('rgba') && channels[3] === 0) return 1;
      return channels.slice(0, 3).map((channel) => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; })
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    };
    const panels = [...document.querySelectorAll<HTMLDetailsElement>('details.evidence-panel')];
    const closedAtPrint = panels.filter((panel) => !panel.open);
    const hiddenRows = closedAtPrint.filter((panel) => { const rows = panel.querySelector('.evidence-rows'); return !rows || !rows.checkVisibility(); }).length;
    const before = panels.map((panel) => panel.open);
    window.dispatchEvent(new Event('beforeprint'));
    const during = panels.map((panel) => panel.open);
    window.dispatchEvent(new Event('afterprint'));
    const after = panels.map((panel) => panel.open);
    return {
      panels: panels.length, hiddenRows, before, during, after,
      pageLuminance: luminance(getComputedStyle(document.body).backgroundColor),
      textLuminance: luminance(getComputedStyle(document.querySelector('main') ?? document.body).color),
      print: matchMedia('print').matches,
      bareLinks: [...document.querySelectorAll<HTMLAnchorElement>('a[href^="http"]')]
        .filter((link) => !link.closest('nav') && link.getClientRects().length > 0 && !getComputedStyle(link, '::after').content.includes(link.getAttribute('href') ?? '\0'))
        .map((link) => link.getAttribute('href') ?? ''),
    };
  });
  if (!state.print) issues.push(issue(scope, 'A11Y-PRINT', 'print media emulation did not activate'));
  if (state.pageLuminance < 0.9 || state.textLuminance > 0.1) issues.push(issue(scope, 'A11Y-PRINT-PALETTE', 'print must be dark text on a light page'));
  if (state.hiddenRows > 0) issues.push(issue(scope, 'A11Y-PRINT-PANEL', `${state.hiddenRows} evidence panel(s) hide their rows in print; style ::details-content to stay visible`));
  if (state.panels > 0 && !state.during.every(Boolean)) issues.push(issue(scope, 'A11Y-PRINT-PANEL', 'beforeprint must open every evidence panel'));
  if (state.panels > 0 && state.after.join() !== state.before.join()) issues.push(issue(scope, 'A11Y-PRINT-RESTORE', 'afterprint must restore each panel to its previous state'));
  if (state.bareLinks.length) issues.push(issue(scope, 'A11Y-PRINT-LINKS', `external link destinations are not printed after the link text: ${state.bareLinks.slice(0, 5).join(', ')}`));
  issues.push(...await checkExpectation(page, scope, 'A11Y-PRINT', expectation));
  await context.close();
  return issues;
}

/* ---------------------------------------------------------------------------------------------
   Part 3: JS off, primary action, font failure, crosswalk layout, motion (spec §10, §8.3, D13-D15)
--------------------------------------------------------------------------------------------- */

/** JS off: the home doors, timeline, crosswalk legend and panes, and the evidence panel rows are all in the HTML, in contract order. */
export async function checkJsOff(browser: Browser, origin: string, path: string, kind: 'home' | 'module', options: { panel: boolean }): Promise<Issue[]> {
  const scope = `${path}:no-script`;
  const issues: Issue[] = [];
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(new URL(path, origin).href, { waitUntil: 'load' });
  await shim(page);
  const read = await page.evaluate(() => {
    const texts = (selector: string) => [...document.querySelectorAll(selector)].map((element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim());
    const panes = [...document.querySelectorAll<HTMLElement>('.crosswalk__pane')];
    return {
      doors: { hrefs: [...document.querySelectorAll('#doors .door__link')].map((link) => link.getAttribute('href')), titles: texts('#doors .door__title'), who: texts('#doors .door__who') },
      timeline: { figures: document.querySelectorAll('figure.timeline').length, labels: texts('.timeline__step strong'), captions: texts('.timeline__caption') },
      crosswalk: {
        terms: [...document.querySelectorAll<HTMLElement>('.crosswalk__term')].map((term) => term.dataset.concept),
        was: texts('.crosswalk__term dd'),
        panes: panes.map((pane) => pane.dataset.pane),
        tagged: Object.fromEntries(panes.map((pane) => [pane.dataset.pane, [...new Set([...pane.querySelectorAll<HTMLElement>('[data-concepts]')].flatMap((line) => (line.dataset.concepts ?? '').split(/\s+/)))]])),
      },
      themeControlHidden: document.querySelector('[data-theme-control]')?.hasAttribute('hidden') ?? true,
      panelCount: document.querySelectorAll('details.evidence-panel').length,
    };
  });
  const same = (a: readonly unknown[], b: readonly unknown[]) => JSON.stringify(a) === JSON.stringify(b);
  if (read.timeline.figures > 1) issues.push(issue(scope, 'A11Y-NOJS', 'at most one timeline figure per page'));
  if (!same(read.timeline.labels, TIMELINE_STEPS.map(({ label }) => label)) || read.timeline.captions.length !== 6 || read.timeline.captions.some((caption) => !caption)) {
    issues.push(issue(scope, 'A11Y-NOJS', 'the timeline must carry the six step labels in order, each with a caption, without JavaScript'));
  }
  if (!read.themeControlHidden) issues.push(issue(scope, 'A11Y-NOJS', 'the theme control must stay hidden without JavaScript'));
  if (kind === 'home') {
    if (!same(read.doors.hrefs, DOORS.map(({ href }) => href)) || !same(read.doors.titles, DOORS.map(({ title }) => title)) || !same(read.doors.who, DOORS.map(({ eyebrow }) => eyebrow))) {
      issues.push(issue(scope, 'A11Y-NOJS', 'the three doors must appear with their frozen eyebrow, title and destination'));
    }
    if (!same(read.crosswalk.terms, CONCEPTS.map(({ key }) => key)) || !same(read.crosswalk.was, CONCEPTS.map(({ was }) => `was ${was}`))) {
      issues.push(issue(scope, 'A11Y-NOJS', 'the crosswalk legend must list the four concepts with their Compose names'));
    }
    if (!same(read.crosswalk.panes, ['compose', 'sbatch', 'coordinator'])) issues.push(issue(scope, 'A11Y-NOJS', 'the crosswalk must carry the compose, sbatch and coordinator panes'));
    for (const pane of ['compose', 'sbatch']) {
      const missing = CONCEPTS.map(({ key }) => key).filter((key) => !(read.crosswalk.tagged[pane] ?? []).includes(key));
      if (missing.length) issues.push(issue(scope, 'A11Y-CROSSWALK', `the ${pane} pane does not tag: ${missing.join(', ')}`));
    }
  }
  if (options.panel) {
    if (read.panelCount !== 1) issues.push(issue(scope, 'A11Y-NOJS', `expected one evidence panel, found ${read.panelCount}`));
    else {
      await page.locator('details.evidence-panel > summary').click();
      const rows = await page.evaluate(() => ({
        open: (document.querySelector('details.evidence-panel') as HTMLDetailsElement).open,
        labels: [...document.querySelectorAll('.evidence-row dt')].map((element) => (element.textContent ?? '').trim()),
        items: [...document.querySelectorAll('.evidence-row')].map((row) => row.querySelectorAll('li').length),
      }));
      if (!rows.open || !same(rows.labels, EVIDENCE_ROW_LABELS) || rows.items.length !== 3 || rows.items.some((count) => count < 1)) {
        issues.push(issue(scope, 'A11Y-NOJS', 'the native summary must open the Tested, You need and Depends on your center rows, each with at least one item'));
      }
    }
  }
  await context.close();
  return issues;
}

/** The primary action is an in-page link: it must work without JS, land on the target, and move the keyboard position there. */
export async function checkPrimaryAction(browser: Browser, origin: string, path: string, linkName: string, fragment: string): Promise<Issue[]> {
  const scope = `${path}:primary-action`;
  const issues: Issue[] = [];
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 800 } });
  const page = await context.newPage();
  await page.goto(new URL(path, origin).href, { waitUntil: 'load' });
  const link = page.getByRole('link', { name: linkName, exact: true });
  if (await link.getAttribute('href') !== `#${fragment}`) { issues.push(issue(scope, 'A11Y-NOJS', `"${linkName}" must be a normal in-page link to #${fragment}`)); await context.close(); return issues; }
  await link.click();
  const after = await page.evaluate((id) => {
    const target = document.getElementById(id);
    const rect = target?.getBoundingClientRect();
    return { exists: Boolean(target), hash: location.hash, matches: document.querySelector(':target')?.id === id, inView: Boolean(rect && rect.top >= -1 && rect.top < innerHeight) };
  }, fragment);
  if (!after.exists || after.hash !== `#${fragment}` || !after.matches || !after.inView) issues.push(issue(scope, 'A11Y-NOJS', `following "${linkName}" must scroll #${fragment} into view and make it :target`));
  await page.keyboard.press('Tab');
  const next = await page.evaluate((id) => {
    const target = document.getElementById(id)!;
    const active = document.activeElement;
    return Boolean(active && active !== document.body && (target.contains(active) || (target.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING)));
  }, fragment);
  if (!next) issues.push(issue(scope, 'A11Y-NOJS', `after following "${linkName}", the next Tab stop must be at or after #${fragment}`));
  await context.close();
  return issues;
}

/** §10 Font failure: with /fonts/* blocked, text stays visible, nothing overflows, and the page height stays within 25% of the normal render. */
export async function checkFontBlocking(browser: Browser, origin: string, path: string): Promise<Issue[]> {
  const scope = `${path}:font-failure`;
  const issues: Issue[] = [];
  const url = new URL(path, origin).href;
  for (const width of [1280, 320]) {
    const normal = await browser.newContext({ viewport: { width, height: 900 } });
    const normalPage = await normal.newPage();
    await normalPage.goto(url, { waitUntil: 'networkidle' });
    const normalHeight = await normalPage.evaluate(() => document.documentElement.scrollHeight);
    await normal.close();

    const blocked = await browser.newContext({ viewport: { width, height: 900 } });
    let attempts = 0;
    await blocked.route('**/fonts/**', (route) => { attempts += 1; return route.abort(); });
    const page = await blocked.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    const state = await page.evaluate(() => {
      const root = document.documentElement;
      const hidden = ['h1', '.lede', '.site-nav a', 'main p', '.timeline__step strong', '.door__title'].filter((selector) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        const style = getComputedStyle(element);
        return !(element.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && (element.textContent ?? '').trim().length > 0 && style.color !== 'rgba(0, 0, 0, 0)');
      });
      return {
        height: root.scrollHeight,
        overflow: Math.max(root.scrollWidth, document.body.scrollWidth) > root.clientWidth + 1,
        hidden,
        loaded: [...document.fonts].filter((face) => face.status === 'loaded').length,
      };
    });
    if (width === 1280 && path === '/' && attempts === 0) issues.push(issue(scope, 'A11Y-FONT-FAILURE', 'the home page requested no /fonts/ file, so this check proved nothing'));
    if (state.loaded > 0) issues.push(issue(scope, 'A11Y-FONT-FAILURE', `${state.loaded} font face(s) loaded although /fonts/ was blocked`));
    if (state.hidden.length) issues.push(issue(`${scope}:${width}px`, 'A11Y-FONT-FAILURE', `text is hidden while fonts are unavailable: ${state.hidden.join(', ')}`));
    if (state.overflow) issues.push(issue(`${scope}:${width}px`, 'A11Y-FONT-FAILURE', 'the fallback fonts make the page overflow horizontally'));
    if (Math.abs(state.height - normalHeight) / normalHeight > 0.25) issues.push(issue(`${scope}:${width}px`, 'A11Y-FONT-FAILURE', `page height changes from ${normalHeight}px to ${state.height}px on the fallback fonts`));
    await blocked.close();
  }
  return issues;
}

/** Crosswalk panes stack without overlap at 320 px; at 1280 px the compose pane sits left of the stacked sbatch and coordinator panes. */
export async function checkCrosswalkLayout(browser: Browser, origin: string, path: string): Promise<Issue[]> {
  const scope = `${path}:crosswalk-layout`;
  const issues: Issue[] = [];
  for (const width of [320, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(new URL(path, origin).href, { waitUntil: 'load' });
    const boxes = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll<HTMLElement>('.crosswalk__pane')].map((pane) => {
      const rect = pane.getBoundingClientRect();
      return [pane.dataset.pane, { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }];
    })));
    const { compose, sbatch, coordinator } = boxes as Record<string, { left: number; top: number; right: number; bottom: number } | undefined>;
    if (!compose || !sbatch || !coordinator) issues.push(issue(`${scope}:${width}px`, 'A11Y-CROSSWALK', 'the compose, sbatch and coordinator panes must all be present'));
    else if (width === 320) {
      if (!(compose.bottom <= sbatch.top + 1 && sbatch.bottom <= coordinator.top + 1)) issues.push(issue(`${scope}:320px`, 'A11Y-CROSSWALK', 'the panes must stack one above the other without overlapping at 320 px'));
    } else if (!(compose.right <= sbatch.left + 1 && Math.abs(sbatch.left - coordinator.left) < 2 && sbatch.bottom <= coordinator.top + 1)) {
      issues.push(issue(`${scope}:1280px`, 'A11Y-CROSSWALK', 'the compose pane must sit left of the stacked sbatch and coordinator panes at 1280 px'));
    }
    await context.close();
  }
  return issues;
}

/** No required motion: nothing animates or transitions, and scrolling is not smoothed under reduced motion. */
export async function checkMotion(browser: Browser, origin: string, path: string): Promise<Issue[]> {
  const scope = `${path}:motion`;
  const issues: Issue[] = [];
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    const context = await browser.newContext({ reducedMotion });
    const page = await context.newPage();
    await page.goto(new URL(path, origin).href, { waitUntil: 'load' });
    const state = await page.evaluate(() => ({
      moving: [...document.querySelectorAll<HTMLElement>('body *')].some((element) => {
        const style = getComputedStyle(element);
        return style.animationName !== 'none' || style.transitionDuration.split(',').some((duration) => Number.parseFloat(duration) > 0);
      }),
      scroll: getComputedStyle(document.documentElement).scrollBehavior,
    }));
    if (state.moving) issues.push(issue(`${scope}:${reducedMotion}`, 'A11Y-MOTION', 'no element may animate or transition'));
    if (reducedMotion === 'reduce' && state.scroll !== 'auto') issues.push(issue(`${scope}:reduce`, 'A11Y-MOTION', `scroll-behavior is ${state.scroll}; it must be auto under reduced motion`));
    await context.close();
  }
  return issues;
}
