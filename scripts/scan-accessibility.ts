import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium, type Page } from 'playwright';
import { accessibilityPages } from '../tests/accessibility/browser-fixtures';

const root = resolve(process.argv[2] ?? '.');
const dist = join(root, 'site/dist');
const representative = accessibilityPages.map(({ path }) => path);
const changed = (process.env.CHANGED_PUBLIC_PATHS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
const paths = [...new Set([...representative, ...changed])];
const mime = new Map([['.html', 'text/html'], ['.css', 'text/css'], ['.js', 'text/javascript'], ['.json', 'application/json'], ['.xml', 'application/xml']]);
const failures: string[] = [];
const fail = (scope: string, code: string, message: string) => failures.push(`${scope} [${code}] ${message}`);

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const safe = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^\//, '');
  let file = pathname === '/404' ? join(dist, '404.html') : join(dist, safe);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file) || !file.startsWith(dist)) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.setHeader('Content-Type', mime.get(extname(file)) ?? 'application/octet-stream');
  createReadStream(file).pipe(response);
});
await new Promise<void>((resolveReady) => server.listen(0, '127.0.0.1', resolveReady));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Accessibility server did not start');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

const open = async (page: Page, path: string) => {
  const response = await page.goto(new URL(path, origin).href, { waitUntil: 'networkidle' });
  if (!response?.ok()) {
    fail(`${path}:page`, 'A11Y-PAGE', `expected HTTP 200, received ${response?.status()}`);
    return false;
  }
  return true;
};

const hasPageOverflow = (page: Page) => page.evaluate(() => {
  const root = document.documentElement;
  const body = document.body;
  return Math.max(root.scrollWidth, body.scrollWidth) > root.clientWidth + 1;
});

const hasVisibleFocus = (page: Page) => page.locator(':focus').evaluate((element) => {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.outlineStyle !== 'none'
    && Number.parseFloat(style.outlineWidth) >= 2
    && rect.bottom > 0 && rect.right > 0
    && rect.top < innerHeight && rect.left < innerWidth;
});

const focusableSelector = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';
const tabStopCount = (page: Page) => page.evaluate((selector) => [...document.querySelectorAll<HTMLElement>(selector)].filter((element) => {
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || !element.getClientRects().length) return false;
  if ((element as HTMLButtonElement).disabled) return false;
  const closed = element.closest('details:not([open])');
  return !closed || element === closed.querySelector(':scope > summary');
}).length, focusableSelector);

const assertDocumentFocusOrder = async (page: Page, path: string) => {
  const count = await tabStopCount(page);
  for (let expected = 0; expected < count; expected += 1) {
    await page.keyboard.press('Tab');
    const currentCount = await tabStopCount(page);
    const activeIndex = await page.evaluate((selector) => {
      const elements = [...document.querySelectorAll<HTMLElement>(selector)].filter((element) => {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || !element.getClientRects().length) return false;
        if ((element as HTMLButtonElement).disabled) return false;
        const closed = element.closest('details:not([open])');
        return !closed || element === closed.querySelector(':scope > summary');
      });
      return elements.indexOf(document.activeElement as HTMLElement);
    }, focusableSelector);
    if (currentCount !== count || activeIndex !== expected) {
      fail(`${path}:keyboard`, 'A11Y-FOCUS-ORDER', `tab ${expected + 1} did not follow document order`);
      break;
    }
    if (!(await hasVisibleFocus(page))) {
      fail(`${path}:focus`, 'A11Y-FOCUS', `tab stop ${expected + 1} lacks a visible, unobscured focus indicator`);
      break;
    }
  }
};

const assertLandmarkFocusOrder = async (page: Page, path: string) => {
  const fixture = accessibilityPages.find((candidate) => candidate.path === path);
  if (!fixture?.focusLandmarks) return;
  const positions = await page.evaluate((selectors) => {
    const elements = [...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
      .filter((element) => {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || !element.getClientRects().length) return false;
        const closed = element.closest('details:not([open])');
        return !closed || element === closed.querySelector(':scope > summary');
      });
    return selectors.map((selector) => elements.indexOf(document.querySelector<HTMLElement>(selector)!));
  }, [...fixture.focusLandmarks]);
  for (let index = 0; index < positions.length; index += 1) {
    if (positions[index] < 0) fail(`${path}:${fixture.focusLandmarks[index]}`, 'A11Y-FOCUS-COVERAGE', 'expected keyboard target is absent or not focusable');
    if (index > 0 && positions[index] <= positions[index - 1]) fail(`${path}:keyboard`, 'A11Y-FOCUS-ORDER', `${fixture.focusLandmarks[index]} is out of expected focus order`);
  }
};

type Rgb = [number, number, number];
const rgb = (value: string): Rgb => {
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as Rgb;
  }
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) throw new Error(`Unsupported color: ${value}`);
  return channels as Rgb;
};
const luminance = (color: Rgb) => color.map((channel) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (a: string, b: string) => {
  const values = [luminance(rgb(a)), luminance(rgb(b))].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

const assertSemanticContrast = async (page: Page, path: string, scheme: string) => {
  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(['canvas', 'surface', 'raised', 'text', 'muted', 'primary', 'on-primary', 'shell', 'shell-text', 'border', 'warning', 'warning-surface']
      .map((token) => [token, style.getPropertyValue(`--${token}`).trim()]));
  });
  const pairs: Array<[string, string, number, string]> = [
    ['text', 'canvas', 4.5, 'body text'], ['text', 'surface', 4.5, 'content text'],
    ['muted', 'surface', 4.5, 'supporting text'], ['primary', 'surface', 4.5, 'links'],
    ['primary', 'canvas', 3, 'focus indicators'], ['on-primary', 'primary', 4.5, 'primary actions'],
    ['shell-text', 'shell', 4.5, 'signature shell'], ['warning', 'warning-surface', 4.5, 'warnings/status'],
    ['border', 'shell', 3, 'workflow figure borders'], ['border', 'surface', 1.5, 'restrained borders'],
  ];
  for (const [foreground, background, minimum, label] of pairs) {
    const ratio = contrast(tokens[foreground], tokens[background]);
    if (ratio < minimum) fail(`${path}:${scheme}:${label}`, 'A11Y-CONTRAST', `${foreground}/${background} contrast ${ratio.toFixed(2)} is below ${minimum}:1`);
    if (label === 'restrained borders' && ratio >= 4.5) fail(`${path}:${scheme}:${label}`, 'A11Y-BORDER-RESTRAINT', 'decorative borders must remain subordinate to text and actions');
  }
};

const verifyNativeDisclosure = async (page: Page, detailsSelector: string, name: string, scope: string) => {
  const details = page.locator(detailsSelector);
  const summary = details.locator(':scope > summary');
  const native = await summary.evaluate((element) => ({ tag: element.tagName, name: element.textContent?.trim() }));
  if (native.tag !== 'SUMMARY' || native.name !== name) {
    fail(scope, 'A11Y-DISCLOSURE', 'disclosure must use a native summary with an accessible name');
    return;
  }
  if (await details.evaluate((element) => (element as HTMLDetailsElement).open)) fail(scope, 'A11Y-DISCLOSURE', 'disclosure must begin collapsed');
  const collapsed = await summary.ariaSnapshot();
  await summary.focus();
  await page.keyboard.press('Enter');
  const expanded = await details.evaluate((element) => ({
    openProperty: (element as HTMLDetailsElement).open,
    openAttribute: element.hasAttribute('open'),
    summaryFocused: element.querySelector(':scope > summary') === document.activeElement,
  }));
  const expandedSnapshot = await summary.ariaSnapshot();
  if (!collapsed.includes(name) || !expanded.openProperty || !expanded.openAttribute
    || !expanded.summaryFocused || !expandedSnapshot.includes(name)) {
    fail(scope, 'A11Y-DISCLOSURE', 'native disclosure name, control semantics, and expanded state must be programmatically exposed');
  }
};

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const requestedUrls: Array<{ url: string; type: string }> = [];
  context.on('request', (request) => requestedUrls.push({ url: request.url(), type: request.resourceType() }));

  for (const path of paths) {
    if (!(await open(page, path))) continue;
    await page.keyboard.press('Tab');
    if (await page.locator(':focus').getAttribute('href') !== '#main') {
      fail(`${path}:keyboard`, 'A11Y-KEYBOARD', 'first focus must be the skip link');
    } else if (!(await hasVisibleFocus(page))) {
      fail(`${path}:focus`, 'A11Y-FOCUS', 'skip-link focus indicator must be visible and unobscured');
    }
    await page.keyboard.press('Enter');
    if (await page.locator(':focus').getAttribute('id') !== 'main') {
      fail(`${path}:keyboard`, 'A11Y-KEYBOARD', 'skip link must focus the main landmark');
    }
    if (await hasPageOverflow(page)) fail(`${path}:layout`, 'A11Y-OVERFLOW', 'page has unintended horizontal overflow');
    if (await open(page, path)) {
      await assertLandmarkFocusOrder(page, path);
      await assertDocumentFocusOrder(page, path);
    }
  }

  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const path of paths) {
      if (!(await open(page, path))) continue;
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      for (const violation of results.violations) for (const node of violation.nodes) fail(`${path}:${colorScheme}:${node.target.join(' ')}`, `AXE-${violation.id}`, violation.help);
      await assertSemanticContrast(page, path, colorScheme);
      const sizing = await page.evaluate(() => {
        const visible = [...document.querySelectorAll<HTMLElement>('body *')].filter((element) => {
          const style = getComputedStyle(element);
          return style.display !== 'none' && style.visibility !== 'hidden' && Boolean(element.textContent?.trim());
        });
        const controls = visible.filter((element) => element.matches('a, button, summary, input, select, textarea'));
        const technical = visible.filter((element) => element.matches('code, small, .supporting, .technical-label, .resource-qualifier, .release, .breadcrumbs, .external-label, .module-pager__direction, .table-overflow__instruction, .diagnostic-stable-id, .source-excerpt__meta, .source-excerpt__source'));
        const mainLinks = visible.filter((element) => element.matches('main a'));
        return {
          body: Number.parseFloat(getComputedStyle(document.body).fontSize),
          controls: Math.min(...controls.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)), 16),
          technical: Math.min(...technical.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)), 14),
          colorScheme: getComputedStyle(document.documentElement).colorScheme,
          linksHaveNonColorCue: mainLinks.every((element) => {
            const style = getComputedStyle(element);
            return style.textDecorationLine.includes('underline')
              || Number.parseFloat(style.borderTopWidth) >= 1
              || Number.parseFloat(style.borderBottomWidth) >= 1;
          }),
          statusNamed: /Release status:/.test(document.querySelector('.release')?.textContent ?? ''),
        };
      });
      if (sizing.body < 16 || sizing.controls < 16) fail(`${path}:${colorScheme}`, 'A11Y-TEXT-SIZE', 'body and control text must remain at least 16 CSS pixels');
      if (sizing.technical < 14) fail(`${path}:${colorScheme}`, 'A11Y-TEXT-SIZE', 'supporting and technical text must remain at least 14 CSS pixels');
      if (!sizing.colorScheme.includes('light') || !sizing.colorScheme.includes('dark')) fail(`${path}:${colorScheme}`, 'A11Y-COLOR-SCHEME', 'native controls must advertise both supported schemes');
      if (!sizing.linksHaveNonColorCue || !sizing.statusNamed) fail(`${path}:${colorScheme}`, 'A11Y-COLOR-MEANING', 'links and status must include non-color cues');
    }
  }
  await page.emulateMedia({ colorScheme: 'light' });

  await page.setViewportSize({ width: 320, height: 800 });
  for (const path of paths) {
    if (!(await open(page, path))) continue;
    if (await hasPageOverflow(page)) fail(`${path}:320px`, 'A11Y-REFLOW', 'content does not reflow within a 320 CSS-pixel viewport');
    if (path === '/') {
      const hero = await page.evaluate(() => {
        const copy = document.querySelector<HTMLElement>('.hero__copy')!;
        const figure = document.querySelector<HTMLElement>('.workflow-figure')!;
        const items = [...figure.querySelectorAll('li')];
        return {
          sourceOrder: Boolean(copy.compareDocumentPosition(figure) & Node.DOCUMENT_POSITION_FOLLOWING),
          oneColumn: getComputedStyle(document.querySelector<HTMLElement>('.hero')!).gridTemplateColumns.split(' ').length === 1,
          verticallyCollapsed: figure.getBoundingClientRect().top >= copy.getBoundingClientRect().bottom,
          stepOrder: items.every((item) => item.querySelector('strong')!.getBoundingClientRect().top <= item.querySelector('span')!.getBoundingClientRect().top),
        };
      });
      if (!hero.sourceOrder || !hero.oneColumn || !hero.verticallyCollapsed || !hero.stepOrder) {
        fail('/:320px', 'A11Y-READING-ORDER', 'hero copy and workflow figure must preserve source order and collapse vertically');
      }
    }
  }

  await open(page, '/resources/');
  await verifyNativeDisclosure(page, '.site-nav--compact', 'Navigation', '/resources/:navigation');
  const summary = page.locator('.site-nav--compact > summary');
  if (!(await summary.evaluate((element) => element === document.activeElement)) || !(await hasVisibleFocus(page))) {
    fail('/resources/:navigation', 'A11Y-FOCUS', 'disclosure focus must remain visible after opening');
  }
  await page.keyboard.press('Tab');
  if (await page.locator(':focus').getAttribute('href') !== '/start/') {
    fail('/resources/:navigation', 'A11Y-KEYBOARD', 'first disclosed navigation link must follow the summary in keyboard order');
  }
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  if (await page.locator('.site-nav--compact').evaluate((element) => (element as HTMLDetailsElement).open)) {
    fail('/resources/:navigation', 'A11Y-KEYBOARD', 'Enter must close the native narrow navigation disclosure');
  }

  await page.setViewportSize({ width: 1024, height: 900 });
  await open(page, '/guide/scheduler-as-orchestrator/');
  await verifyNativeDisclosure(page, '.sources-scope details', 'Review source roles and citations', '/guide/scheduler-as-orchestrator/:sources');

  // A 640 CSS-pixel viewport at 200% browser zoom exposes a 320 CSS-pixel layout viewport.
  await page.setViewportSize({ width: 320, height: 450 });
  for (const path of paths) {
    if (!(await open(page, path))) continue;
    if (await hasPageOverflow(page)) fail(`${path}:200%-zoom`, 'A11Y-ZOOM', 'page overflows horizontally at the 200% zoom-equivalent layout viewport');
  }

  await page.setViewportSize({ width: 320, height: 900 });
  await open(page, '/guide/scheduler-as-orchestrator/');
  const stress = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const hash = document.createElement('p');
    hash.className = 'hash';
    hash.textContent = `sha256:${'abcdef0123456789'.repeat(24)}`;
    const token = document.createElement('p');
    token.className = 'technical-value';
    token.textContent = `token_${'A1b2C3d4'.repeat(48)}`;
    const repository = document.createElement('a');
    repository.href = `https://github.com/example/${'long-repository-segment-'.repeat(24)}/blob/v0.1.0/${'nested-path/'.repeat(24)}README.md`;
    repository.textContent = repository.href;
    const pre = document.createElement('pre');
    pre.innerHTML = `<code>${'long-command-segment/'.repeat(40)}</code>`;
    const region = document.createElement('div');
    region.className = 'table-overflow layout-data';
    region.tabIndex = 0;
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', 'Stress table');
    const cells = Array.from({ length: 12 }, (_, index) => `<th scope="col">Column ${index + 1}</th>`).join('');
    const values = Array.from({ length: 12 }, () => `<td>${'unbroken-value-'.repeat(8)}</td>`).join('');
    region.innerHTML = `<p class="table-overflow__instruction">Scroll horizontally to view all columns.</p><table><caption>Overflow stress data</caption><thead><tr>${cells}</tr></thead><tbody><tr>${values}</tr></tbody></table>`;
    main.append(hash, token, repository, pre, region);
    const table = region.querySelector('table')!;
    return {
      hashContained: hash.scrollWidth <= hash.clientWidth + 1,
      tokenContained: token.scrollWidth <= token.clientWidth + 1,
      repositoryContained: repository.scrollWidth <= repository.clientWidth + 1,
      codeLocallyScrollable: pre.scrollWidth > pre.clientWidth,
      tableLocallyScrollable: region.scrollWidth > region.clientWidth,
      tableDisplay: getComputedStyle(table).display,
      caption: table.querySelector('caption')?.textContent,
      scopedHeaders: table.querySelectorAll('th[scope="col"]').length,
    };
  });
  if (!stress.hashContained) fail('/guide/:hash-stress', 'A11Y-OVERFLOW', 'long hashes must wrap within their container');
  if (!stress.tokenContained) fail('/guide/:token-stress', 'A11Y-OVERFLOW', 'long tokens must wrap within their container');
  if (!stress.repositoryContained) fail('/guide/:repository-stress', 'A11Y-OVERFLOW', 'long repository references must wrap within their container');
  if (!stress.codeLocallyScrollable) fail('/guide/:code-stress', 'A11Y-OVERFLOW', 'long code must scroll within its own region');
  if (!stress.tableLocallyScrollable) fail('/guide/:table-stress', 'A11Y-OVERFLOW', 'wide tables must scroll within their labelled region');
  if (stress.tableDisplay !== 'table' || stress.caption !== 'Overflow stress data' || stress.scopedHeaders !== 12) {
    fail('/guide/:table-stress', 'A11Y-TABLE', 'overflow handling must preserve native table, caption, and scoped-header semantics');
  }
  const stressRegion = page.getByRole('region', { name: 'Stress table' });
  await stressRegion.focus();
  if (!(await hasVisibleFocus(page))) fail('/guide/:table-stress', 'A11Y-FOCUS', 'the bounded table region must expose visible keyboard focus');
  await page.keyboard.press('Tab');
  if (await stressRegion.evaluate((element) => element === document.activeElement)) {
    fail('/guide/:table-stress', 'A11Y-FOCUS-ORDER', 'the table region must not trap keyboard focus');
  }
  if (await hasPageOverflow(page)) fail('/guide/:stress', 'A11Y-OVERFLOW', 'technical stress content must not overflow the page viewport');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await open(page, '/');
  const decorativeMotion = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('body *')].some((element) => {
    const style = getComputedStyle(element);
    return style.animationName !== 'none' || style.transitionDuration.split(',').some((duration) => Number.parseFloat(duration) > 0);
  }));
  if (decorativeMotion) fail('/:motion', 'A11Y-MOTION', 'static pages must not add decorative animation or transitions');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, '/');
  const reducedMotion = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.transition = 'transform 10s';
    probe.style.animation = 'spin 10s infinite';
    document.body.append(probe);
    const style = getComputedStyle(probe);
    return {
      preference: matchMedia('(prefers-reduced-motion: reduce)').matches,
      transition: Number.parseFloat(style.transitionDuration),
      animation: Number.parseFloat(style.animationDuration),
      iterations: style.animationIterationCount,
    };
  });
  if (!reducedMotion.preference || reducedMotion.transition > 0.00001
    || reducedMotion.animation > 0.00001 || reducedMotion.iterations !== '1') {
    fail('/:reduced-motion', 'A11Y-MOTION', 'reduced-motion preference must minimize transitions and animations');
  }

  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await open(page, '/');
  await page.keyboard.press('Tab');
  const forcedColorFigure = await page.locator('.workflow-figure').evaluate((figure) => {
    const style = getComputedStyle(figure);
    return {
      preference: matchMedia('(forced-colors: active)').matches,
      caption: figure.querySelector('figcaption')?.textContent?.trim(),
      steps: [...figure.querySelectorAll('li strong')].map((element) => element.textContent?.trim()),
      visible: style.display !== 'none' && style.visibility !== 'hidden',
      borderVisible: style.borderStyle !== 'none' && Number.parseFloat(style.borderWidth) >= 1,
    };
  });
  if (!forcedColorFigure.preference || !forcedColorFigure.visible || !forcedColorFigure.borderVisible
    || forcedColorFigure.caption !== 'One allocation, five ordered responsibilities'
    || forcedColorFigure.steps.join('|') !== 'Allocation|Coordinator|Readiness gate|Workers|Verification') {
    fail('/:forced-colors', 'A11Y-FORCED-COLORS', 'shell, focus, workflow labels, borders, and order must remain legible in forced colors');
  }
  await page.emulateMedia({ media: 'print', forcedColors: 'none' });
  await open(page, '/');
  const printFigure = await page.locator('.workflow-figure').evaluate((figure) => ({
    caption: figure.querySelector('figcaption')?.textContent?.trim(),
    steps: [...figure.querySelectorAll('li strong')].map((element) => element.textContent?.trim()),
    visible: getComputedStyle(figure).display !== 'none' && getComputedStyle(figure).visibility !== 'hidden',
  }));
  if (!printFigure.visible || printFigure.caption !== 'One allocation, five ordered responsibilities'
    || printFigure.steps.join('|') !== 'Allocation|Coordinator|Readiness gate|Workers|Verification') {
    fail('/:print', 'A11Y-PRINT', 'printed workflow caption and labels must remain visible in source order');
  }
  await page.emulateMedia({ media: 'screen', reducedMotion: 'no-preference' });

  const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 800 } });
  const noScriptRequests: Array<{ url: string; type: string }> = [];
  noScript.on('request', (request) => noScriptRequests.push({ url: request.url(), type: request.resourceType() }));
  const noScriptPage = await noScript.newPage();
  if (await open(noScriptPage, '/')) {
    const primaryAction = noScriptPage.getByRole('link', { name: 'Get started', exact: true });
    if (await primaryAction.getAttribute('href') !== '/start/') fail('/:no-script', 'A11Y-NOJS', 'primary action must remain a normal link');
    await primaryAction.click();
    if (new URL(noScriptPage.url()).pathname !== '/start/') fail('/:no-script', 'A11Y-NOJS', 'primary action must navigate without JavaScript');
  }
  if (await open(noScriptPage, '/resources/')) {
    await verifyNativeDisclosure(noScriptPage, '.site-nav--compact', 'Navigation', '/resources/:no-script');
    const moduleLink = noScriptPage.getByRole('link', { name: 'Baseline Pattern: Single-Node Service + Workers' }).first();
    if (await moduleLink.getAttribute('href') !== '/guide/baseline-single-node-pattern/') {
      fail('/resources/:no-script', 'A11Y-NOJS', 'grouped resource entries must remain ordinary links');
    }
    await moduleLink.click();
    if (new URL(noScriptPage.url()).pathname !== '/guide/baseline-single-node-pattern/') {
      fail('/resources/:no-script', 'A11Y-NOJS', 'resource links must navigate without JavaScript');
    }
  }
  for (const path of paths) {
    if (!(await open(noScriptPage, path))) continue;
    if (await hasPageOverflow(noScriptPage)) fail(`${path}:no-script`, 'A11Y-NOJS', 'representative page must reflow without JavaScript');
    await assertDocumentFocusOrder(noScriptPage, `${path}:no-script`);
    const fixture = accessibilityPages.find((candidate) => candidate.path === path);
    for (const marker of fixture?.criticalOutsideDisclosure ?? []) {
      const outside = marker === 'Tested workflow scope'
        ? await noScriptPage.locator('.applicability-projection[aria-label="Tested workflow scope"]').evaluateAll((elements) => elements.some((element) => !element.closest('details')))
        : await noScriptPage.evaluate((text) => {
          const clone = document.body.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('details').forEach((details) => details.remove());
          return (clone.textContent ?? '').replace(/\s+/g, ' ').includes(text);
        }, marker);
      if (!outside) fail(`${path}:no-script:${marker}`, 'A11Y-DISCLOSURE', 'critical content must remain visible outside collapsed disclosures');
    }
    const criticalPlacement = await noScriptPage.evaluate(() => {
      const structural = [...document.querySelectorAll('.notice, .applicability-projection, .diagnostic-applicability, [role="note"]')];
      const warnings = [...document.querySelectorAll('strong')].filter((element) => /^Warning\b/.test(element.textContent?.trim() ?? ''));
      return [...structural, ...warnings].every((element) => !element.closest('details'));
    });
    if (!criticalPlacement) fail(`${path}:no-script`, 'A11Y-DISCLOSURE', 'warnings, unvalidated state, applicability scope, and actionable status must remain outside disclosures');
  }

  for (const request of [...requestedUrls, ...noScriptRequests]) {
    const remote = !request.url.startsWith(origin);
    if (request.type === 'font' || remote) fail(request.url, 'A11Y-REMOTE-FONT', 'pages must make no remote or font requests');
  }
  await noScript.close();
  await context.close();
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(failures.map((failure) => `ERROR: ${failure}`).join('\n'));
  process.exit(1);
}
console.log(`Frontend browser validation passed for ${paths.length} built pages: axe, no-JavaScript, keyboard/focus, 320px reflow, 200% zoom, overflow stress, tables, and reduced motion.`);
