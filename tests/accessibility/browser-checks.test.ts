import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { checkComponentGeometry, checkCrosswalkLayout, checkGuideCards, checkFontBlocking, checkForcedColors, checkJsOff, checkMotion, checkPrimaryAction, checkPrint, checkPrintOverflow, checkThemePrecedence, inspectThemeScript } from './browser-checks';
import { serveFixtures } from './fixture-server';

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); }, 60_000);
afterAll(async () => { await browser?.close(); });

const THEMES = { light: { canvas: '#fbf9f4' }, dark: { canvas: '#131a29' } };
const HEAD_SCRIPT = "try{var v=localStorage.getItem('l2c-theme'),c={dark:'#131a29',light:'#fbf9f4'};if(c[v]){document.documentElement.dataset.theme=v;var m=document.createElement('meta');m.name='theme-color';m.content=c[v];document.head.append(m)}}catch(e){}";
const ICONS = '<svg class="theme-control__icon theme-control__icon--moon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg><svg class="theme-control__icon theme-control__icon--sun" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const toggleButton = (extra = '', name = 'Dark theme') => `<button type="button" class="theme-control__toggle" data-theme-toggle aria-pressed="false"${extra}>${ICONS}<span class="vh">${name}</span></button>`;
/* The fixture enhancer reads the page state from data-theme (like a real toggle that trusts the head script), so a page that ignores the stored choice is still reported. */
const enhancer = (broken: string[] = []) => `(function(){var k='l2c-theme',r=document.documentElement,w=document.querySelector('[data-theme-control]'),t=w.querySelector('[data-theme-toggle]'),q=matchMedia('(prefers-color-scheme: dark)');function os(){return q.matches?'dark':'light'}function cur(){return r.dataset.theme||null}function m(){var e=document.querySelector('meta[name=theme-color]:not([media])');if(!e){e=document.createElement('meta');e.name='theme-color';document.head.append(e)}e.content=getComputedStyle(r).getPropertyValue('--canvas').trim()}function p(){t.setAttribute('aria-pressed',String((cur()||os())==='dark'))}t.addEventListener('click',function(){var n=(cur()||os())==='dark'?'light':'dark';${broken.includes('no-clear') ? "r.dataset.theme=n;localStorage.setItem(k,n);" : "if(n===os()){delete r.dataset.theme;localStorage.removeItem(k)}else{r.dataset.theme=n;localStorage.setItem(k,n)}"}p();m()});${broken.includes('no-os-sync') ? '' : broken.includes('os-clears-stored') ? "q.addEventListener('change',function(){delete r.dataset.theme;localStorage.removeItem(k);p()});" : "q.addEventListener('change',function(){if(!localStorage.getItem(k))p()});"}w.hidden=false;p()})();`;
const ENHANCER = enhancer();
const CONTROL = `<div class="theme-control" data-theme-control hidden>${toggleButton()}</div>`;
const CSS = ':root{color-scheme:light dark;--canvas:#fbf9f4}:root[data-theme=light]{color-scheme:light}@media screen and (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--canvas:#131a29}}:root[data-theme=dark]{color-scheme:dark;--canvas:#131a29}body{background:var(--canvas)}'
  + '.vh{position:absolute;inline-size:1px;block-size:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.theme-control[hidden]{display:none}'
  + '.theme-control__toggle{display:inline-flex;align-items:center;justify-content:center;inline-size:2rem;block-size:2rem;padding:0;color:inherit;background:transparent;border:1px solid #999;border-radius:999px}.theme-control__icon{inline-size:1.25rem;block-size:1.25rem}'
  + '.theme-control__toggle[aria-pressed=true] .theme-control__icon--moon,.theme-control__toggle[aria-pressed=false] .theme-control__icon--sun{display:none}.theme-control__toggle:focus-visible{outline:2px solid #1a4fd6;outline-offset:2px}';
const MEDIA_METAS = '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#fbf9f4"><meta name="theme-color" media="(prefers-color-scheme: dark)" content="#131a29">';
const MEDIA_SCRIPT_ATTR = "try{var v=localStorage.getItem('l2c-theme');if(v=='dark'||v=='light')document.documentElement.dataset.theme=v}catch(e){}";
const MEDIA_SCRIPT_FULL = "try{var v=localStorage.getItem('l2c-theme');if(v=='dark'||v=='light'){document.documentElement.dataset.theme=v;document.querySelectorAll('meta[name=theme-color]').forEach(function(m){m.content=v=='dark'?'#131a29':'#fbf9f4'})}}catch(e){}";
type ToggleBreak = 'name' | 'small' | 'no-clear' | 'no-os-sync' | 'os-clears-stored' | 'visible-text' | 'unfocusable' | 'no-ring' | 'icons-stay' | 'always-visible';
const themePage = (variant: 'good' | 'late-script' | 'ignores-stored' | 'media-metas' | 'media-metas-untouched', broken: ToggleBreak[] = []) => {
  const css = CSS
    + (broken.includes('small') ? '.theme-control__toggle{inline-size:20px;block-size:20px}' : '')
    + (broken.includes('no-ring') ? '.theme-control__toggle:focus-visible{outline:none}' : '')
    + (broken.includes('icons-stay') ? '.theme-control__toggle .theme-control__icon--moon,.theme-control__toggle .theme-control__icon--sun{display:inline !important}' : '')
    + (broken.includes('always-visible') ? '.theme-control[hidden]{display:inline-flex}' : '');
  const button = toggleButton(broken.includes('unfocusable') ? ' tabindex="-1"' : '', broken.includes('name') ? 'Theme' : 'Dark theme');
  const control = `<div class="theme-control" data-theme-control hidden>${broken.includes('visible-text') ? '<span>System</span>' : ''}${button}</div>`;
  const header = `<header><nav aria-label="Primary"><a href="/a">Get started</a></nav>${control}</header>`;
  const script = enhancer(broken);
  if (variant === 'media-metas' || variant === 'media-metas-untouched') {
    const head = variant === 'media-metas' ? MEDIA_SCRIPT_FULL : MEDIA_SCRIPT_ATTR;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title>${MEDIA_METAS}<script>${head}</script><style>${css}</style></head><body>${header}<main><p>Body</p></main><script>${script}</script></body></html>`;
  }
  const headScript = variant === 'good' ? `<script>${HEAD_SCRIPT}</script>` : '';
  const late = variant === 'late-script' ? `<script>${HEAD_SCRIPT}</script>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title>${headScript}<style>${css}</style></head><body>${header}<main><p>Body</p></main>${late}<script>${script}</script></body></html>`;
};

describe('theme precedence check', () => {
  it('passes a page whose head script applies the stored choice before the body is parsed', async () => {
    const server = await serveFixtures({ '/good/': { body: themePage('good') } });
    try {
      expect(await checkThemePrecedence(browser, server.origin, '/good/', THEMES)).toEqual([]);
    } finally { await server.close(); }
  }, 90_000);

  it('reports a wrong-theme flash when the script runs after the body has started', async () => {
    const server = await serveFixtures({ '/late/': { body: themePage('late-script') } });
    try {
      const issues = await checkThemePrecedence(browser, server.origin, '/late/', THEMES);
      expect(issues.some((entry) => entry.code === 'A11Y-THEME-FLASH')).toBe(true);
      expect(issues.some((entry) => entry.code === 'A11Y-THEME-PRECEDENCE')).toBe(false);
    } finally { await server.close(); }
  }, 90_000);

  it('reports a stored choice that never reaches the page', async () => {
    const server = await serveFixtures({ '/ignored/': { body: themePage('ignores-stored') } });
    try {
      const codes = (await checkThemePrecedence(browser, server.origin, '/ignored/', THEMES)).map((entry) => entry.code);
      expect(codes).toContain('A11Y-THEME-PRECEDENCE');
      expect(codes).toContain('A11Y-THEME-COLOR');
    } finally { await server.close(); }
  }, 90_000);
});

describe('theme toggle check', () => {
  const run = async (broken: ToggleBreak[]) => {
    const server = await serveFixtures({ '/t/': { body: themePage('good', broken) } });
    try { return await checkThemePrecedence(browser, server.origin, '/t/', THEMES); } finally { await server.close(); }
  };
  const messages = (issues: Awaited<ReturnType<typeof run>>) => issues.filter((entry) => entry.code === 'A11Y-THEME-CONTROL').map((entry) => entry.message).join('\n');

  it('passes the one-button toggle on both OS schemes: pressed from the effective theme, icon swap, two clicks back to the OS, keyboard, name, size, no text, no JavaScript', async () => {
    expect(await run([])).toEqual([]);
  }, 120_000);

  it('reports an accessible name other than "Dark theme"', async () => {
    expect(messages(await run(['name']))).toMatch(/accessible name/);
  }, 120_000);

  it('reports a toggle smaller than 24 by 24 CSS pixels', async () => {
    expect(messages(await run(['small']))).toMatch(/24/);
  }, 120_000);

  it('reports a second click that stores the OS value instead of clearing the choice', async () => {
    expect(messages(await run(['no-clear']))).toMatch(/following the OS|clear/);
  }, 120_000);

  it('reports a toggle that ignores a live OS change while nothing is stored, and one that wipes a stored choice on an OS change', async () => {
    expect(messages(await run(['no-os-sync']))).toMatch(/follow a live OS change/);
    expect(messages(await run(['os-clears-stored']))).toMatch(/leave a stored choice alone/);
  }, 120_000);

  it('reports visible System, Light or Dark text in the header', async () => {
    expect(messages(await run(['visible-text']))).toMatch(/visible text/);
  }, 120_000);

  it('reports a toggle that Tab does not reach, and one with no visible focus ring', async () => {
    expect(messages(await run(['unfocusable']))).toMatch(/Tab/);
    expect(messages(await run(['no-ring']))).toMatch(/focus/);
  }, 120_000);

  it('reports both icons showing at once, and a control that shows without JavaScript', async () => {
    expect(messages(await run(['icons-stay']))).toMatch(/icon/);
    const noScript = (await run(['always-visible'])).filter((entry) => entry.code === 'A11Y-THEME-NOJS');
    expect(noScript).toHaveLength(1);
  }, 120_000);
});

describe('theme-color with media-scoped metas', () => {
  it('passes when the head script rewrites every theme-color meta to the stored canvas', async () => {
    const server = await serveFixtures({ '/media/': { body: themePage('media-metas') } });
    try {
      const codes = (await checkThemePrecedence(browser, server.origin, '/media/', THEMES)).map((entry) => entry.code);
      expect(codes).not.toContain('A11Y-THEME-COLOR');
    } finally { await server.close(); }
  }, 90_000);

  it('reports a head script that sets data-theme but leaves theme-color alone', async () => {
    const server = await serveFixtures({ '/media-untouched/': { body: themePage('media-metas-untouched') } });
    try {
      const codes = (await checkThemePrecedence(browser, server.origin, '/media-untouched/', THEMES)).map((entry) => entry.code);
      expect(codes).toContain('A11Y-THEME-COLOR');
    } finally { await server.close(); }
  }, 90_000);
});

describe('theme script inspection', () => {
  it('accepts one small blocking inline script in the head', () => {
    expect(inspectThemeScript(themePage('good'), '/')).toEqual([]);
  });

  it('rejects a deferred, module, oversized, missing or body-level script', () => {
    const good = themePage('good');
    expect(inspectThemeScript(good.replace('<script>', '<script defer>'), '/')[0].message).toMatch(/blocking/);
    expect(inspectThemeScript(good.replace('<script>', '<script type="module">'), '/')[0].message).toMatch(/blocking/);
    expect(inspectThemeScript(good.replace('try{', `var pad="${'x'.repeat(300)}";try{`), '/')[0].message).toMatch(/limit is 300/);
    expect(inspectThemeScript(themePage('ignores-stored'), '/')[0].message).toMatch(/found 0/);
    expect(inspectThemeScript(themePage('late-script'), '/')[0].message).toMatch(/found 0/);
  });
});

const LABELS = ['Get an allocation', 'Start coordinator', 'Readiness gate', 'Run workers', 'Verify results', 'Clean up'];
const EXPECT = {
  ordered: [{ selector: '.timeline__step strong', texts: LABELS }, { selector: '.door__title', texts: ['Understand the model', 'Translate it'] }],
  present: ['.evidence-badge', 'h1'],
};
const GOOD_CSS = `
.notice{border:3px double CanvasText;padding:4px}.door{border:1px solid CanvasText;padding:4px}.evidence-badge{border:1px solid CanvasText;display:inline-block}
[role=group] button[aria-pressed=true]{outline:2px solid CanvasText;font-weight:700}.theme-control__toggle{border:1px solid CanvasText}.theme-control__icon{inline-size:20px;block-size:20px}.theme-control__toggle[aria-pressed=false] .theme-control__icon--sun{display:none}
a:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid CanvasText;outline-offset:2px}
.evidence-panel::details-content{content-visibility:visible;display:block}`;
const printScript = (restore: boolean) => `var o=[];addEventListener('beforeprint',function(){o=[].filter.call(document.querySelectorAll('details.evidence-panel:not([open])'),function(d){return 1});o.forEach(function(d){d.open=true})});addEventListener('afterprint',function(){${restore ? 'o.forEach(function(d){d.open=false})' : ''}})`;
function mediumPage(options: { css?: string; print?: string; script?: string; extraCss?: string } = {}) {
  const steps = LABELS.map((label, index) => `<li class="timeline__step" data-step="${index + 1}"><strong>${label}</strong> <span class="timeline__caption">c</span></li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title><style>${options.css ?? GOOD_CSS}${options.extraCss ?? ''}@media print{${options.print ?? ''}}</style></head><body><main>
<h1>Title</h1><p class="notice" role="note"><strong>Warning:</strong> text</p><p class="evidence-badge">Tested</p>
<details class="evidence-panel"><summary>What this means for you</summary><dl class="evidence-rows"><div class="evidence-row"><dt>Tested</dt><dd><ul><li>a</li></ul></dd></div></dl></details>
<ul class="doors"><li class="door"><h3 class="door__title">Understand the model</h3><a class="door__link" href="/t">Take the tour</a></li><li class="door"><h3 class="door__title">Translate it</h3><a class="door__link" href="/c">Open the map</a></li></ul>
<div class="theme-control">${toggleButton()}</div>
<div role="group" aria-label="Sample options"><button type="button" aria-pressed="true">One</button><button type="button" aria-pressed="false">Two</button></div>
<ol class="timeline__steps">${steps}</ol></main><script>${options.script ?? printScript(true)}</script></body></html>`;
}

describe('forced colours check', () => {
  it('passes a page that keeps text, borders, a non-colour selected cue and focus outlines', async () => {
    const server = await serveFixtures({ '/good/': { body: mediumPage() } });
    try { expect(await checkForcedColors(browser, server.origin, '/good/', EXPECT)).toEqual([]); } finally { await server.close(); }
  }, 60_000);

  it('reports lost text, lost boundaries, a colour-only selected state, and a lost control', async () => {
    const lostText = mediumPage({ extraCss: '*{forced-color-adjust:none}body{background:#fff;color:#fff}.notice,.door,.evidence-badge{color:#fff}' });
    const lostBoundary = mediumPage({ extraCss: '.notice,.door,.evidence-badge{border:0}' });
    const colourOnly = mediumPage({ css: GOOD_CSS.replace('[role=group] button[aria-pressed=true]{outline:2px solid CanvasText;font-weight:700}', '[role=group] button[aria-pressed=true]{background:#123456}') });
    const lostControl = mediumPage({ extraCss: '@media (forced-colors:active){.door__link{display:none}}' });
    const server = await serveFixtures({
      '/text/': { body: lostText }, '/boundary/': { body: lostBoundary }, '/selected/': { body: colourOnly }, '/control/': { body: lostControl },
      '/nav/': { body: mediumPage({ extraCss: 'nav a[aria-current=page]{color:#123456}' }).replace('<main>', '<nav aria-label="s"><ul><li><a href="/a" aria-current="page">A</a></li><li><a href="/b">B</a></li></ul></nav><main>') },
      '/fc-order/': { body: mediumPage({ extraCss: '@media (forced-colors:active){.timeline__step strong{display:none}}' }) },
      '/toggle-boundary/': { body: mediumPage({ extraCss: '.theme-control__toggle{border:0}' }) },
    });
    try {
      expect((await checkForcedColors(browser, server.origin, '/toggle-boundary/', EXPECT)).map((entry) => entry.message).join('\n')).toMatch(/boundary lost.*theme-control__toggle/);
      expect((await checkForcedColors(browser, server.origin, '/text/', EXPECT)).map((entry) => entry.message).join('\n')).toMatch(/text is lost/);
      expect((await checkForcedColors(browser, server.origin, '/boundary/', EXPECT)).map((entry) => entry.message).join('\n')).toMatch(/boundary lost/);
      expect((await checkForcedColors(browser, server.origin, '/selected/', EXPECT)).map((entry) => entry.message).join('\n')).toMatch(/colour only/);
      expect((await checkForcedColors(browser, server.origin, '/control/', EXPECT)).map((entry) => entry.message).join('\n')).toMatch(/a control was lost/);
      expect((await checkForcedColors(browser, server.origin, '/fc-order/', EXPECT)).map((entry) => entry.message).join('\n')).toMatch(/must read/);
      expect((await checkForcedColors(browser, server.origin, '/nav/', EXPECT)).map((entry) => entry.message).join('\n')).toMatch(/colour only/);
    } finally { await server.close(); }
  }, 120_000);
});

describe('print check', () => {
  it('passes a light page whose evidence rows stay visible and whose panels open and restore', async () => {
    const server = await serveFixtures({ '/good/': { body: mediumPage() } });
    try { expect(await checkPrint(browser, server.origin, '/good/', EXPECT)).toEqual([]); } finally { await server.close(); }
  }, 60_000);

  it('reports hidden panel rows, a panel that is not restored, a dark print palette and a reordered timeline', async () => {
    const noDetailsContent = mediumPage({ css: GOOD_CSS.replace('.evidence-panel::details-content{content-visibility:visible;display:block}', '') });
    const noRestore = mediumPage({ script: printScript(false) });
    const dark = mediumPage({ print: 'body{background:#111;color:#eee}' });
    const reordered = mediumPage().replace('<strong>Verify results</strong>', '<strong>Clean up</strong>').replace(/<strong>Clean up<\/strong> <span class="timeline__caption">c<\/span><\/li><\/ol>/, '<strong>Verify results</strong> <span class="timeline__caption">c</span></li></ol>');
    const server = await serveFixtures({ '/hidden/': { body: noDetailsContent }, '/restore/': { body: noRestore }, '/dark/': { body: dark }, '/order/': { body: reordered },
      '/print-hidden/': { body: mediumPage({ print: '.timeline__steps{display:none}' }) },
      '/print-order/': { body: mediumPage({ print: '.timeline__steps{display:flex;flex-direction:column}.timeline__step[data-step="5"]{order:9}' }) },
    });
    try {
      expect((await checkPrint(browser, server.origin, '/hidden/', EXPECT)).map((entry) => entry.code)).toContain('A11Y-PRINT-PANEL');
      expect((await checkPrint(browser, server.origin, '/restore/', EXPECT)).map((entry) => entry.code)).toContain('A11Y-PRINT-RESTORE');
      expect((await checkPrint(browser, server.origin, '/dark/', EXPECT)).map((entry) => entry.code)).toContain('A11Y-PRINT-PALETTE');
      expect((await checkPrint(browser, server.origin, '/order/', EXPECT)).map((entry) => entry.code)).toContain('A11Y-PRINT');
      expect((await checkPrint(browser, server.origin, '/print-hidden/', EXPECT)).map((entry) => entry.code)).toContain('A11Y-PRINT');
      expect((await checkPrint(browser, server.origin, '/print-order/', EXPECT)).map((entry) => entry.code)).toContain('A11Y-PRINT');
    } finally { await server.close(); }
  }, 120_000);
});

describe('print overflow check', () => {
  const LONG = 'sbatch --export=ALL,INPUT_PATH="$W/inputs/tasks.json",EXPECTED_PATH="$W/expected/results.json",OUTPUT_PATH="$W/outputs/results.json",VERIFY_PATH="$W/verify" job.sbatch';
  const TALL = Array.from({ length: 30 }, (_value, index) => `line ${index}`).join('\n');
  const screenCss = 'pre{max-inline-size:100%;overflow:auto}.capped{max-block-size:6rem}';
  const page = (printCss: string, code = LONG, klass = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title><style>${screenCss}${printCss}</style></head><body><main><pre class="${klass}" tabindex="0" aria-label="Example"><code>${code}</code></pre></main></body></html>`;
  const fix = '@media print{pre,pre code{white-space:pre-wrap;overflow-wrap:anywhere}.capped{max-block-size:none;overflow:visible}}';

  it('passes code that wraps and a capped excerpt that prints in full, and reports a line or a height cap that hides text', async () => {
    const server = await serveFixtures({
      '/wrapped/': { body: page(fix) },
      '/tall-fixed/': { body: page(fix, TALL, 'capped') },
      '/wide/': { body: page('') },
      '/tall/': { body: page('', TALL, 'capped') },
    });
    try {
      expect(await checkPrintOverflow(browser, server.origin, '/wrapped/')).toEqual([]);
      expect(await checkPrintOverflow(browser, server.origin, '/tall-fixed/')).toEqual([]);
      expect((await checkPrintOverflow(browser, server.origin, '/wide/')).map((entry) => entry.code)).toContain('A11Y-PRINT-CLIPPED');
      expect((await checkPrintOverflow(browser, server.origin, '/tall/')).map((entry) => entry.code)).toContain('A11Y-PRINT-CLIPPED');
    } finally { await server.close(); }
  }, 120_000);
});

describe('print link destinations (G6)', () => {
  const external = (extra: string) => mediumPage({ extraCss: extra }).replace('<ul class="doors">', '<p><a class="ext" href="https://example.org/x">Example</a></p><ul class="doors">');
  it('passes when external link URLs print after the link and reports them when missing', async () => {
    const server = await serveFixtures({
      '/shown/': { body: external('@media print{a[href^="http"]::after{content:" (" attr(href) ")"}}') },
      '/bare/': { body: external('') },
    });
    try {
      expect(await checkPrint(browser, server.origin, '/shown/', EXPECT)).toEqual([]);
      expect((await checkPrint(browser, server.origin, '/bare/', EXPECT)).map((entry) => entry.code)).toContain('A11Y-PRINT-LINKS');
    } finally { await server.close(); }
  }, 60_000);
});

const CONCEPT_KEYS = ['step', 'gate', 'scratch', 'net'];
const WAS = ['a Compose service', 'healthcheck + depends_on', 'a named volume', 'a published ports entry'];
const DOOR_ROWS = [
  ['New to clusters? Start here', 'Understand the model', '/guide/tour/'],
  ['Already have a Compose file?', 'Translate it', '/guide/compose-to-hpc-translation/'],
  ['Research software engineers & center staff', 'Evaluate and adopt', '/adoption/evaluate/'],
];
function homeFixture(options: { badHref?: boolean; untaggedSbatch?: boolean; noRows?: boolean; stackOverlap?: boolean; foit?: boolean; localFallback?: boolean; hiddenNav?: boolean } = {}) {
  const steps = LABELS.map((label, index) => `<li class="timeline__step" data-step="${index + 1}"><strong>${label}</strong> <span class="timeline__caption">Caption ${index + 1}</span></li>`).join('');
  const doors = DOOR_ROWS.map(([who, title, href], index) => `<li class="door" id="door-${index}"><p class="door__who">${who}</p><h3 class="door__title">${title}</h3><p class="door__summary">s</p><p class="door__go"><a class="door__link" href="${options.badHref && index === 1 ? '/wrong/' : href}">Go ${index}</a></p></li>`).join('');
  const terms = CONCEPT_KEYS.map((key, index) => `<div class="crosswalk__term" data-concept="${key}"><dt><span class="crosswalk__mark" aria-hidden="true">m</span> ${key}</dt><dd>was ${WAS[index]}</dd></div>`).join('');
  const line = (concepts: string[]) => `<span class="crosswalk__line" data-concepts="${concepts.join(' ')}">line\n</span>`;
  const pane = (id: string, concepts: string[][]) => `<figure class="crosswalk__pane" data-pane="${id}"><figcaption>${id}</figcaption><pre><code>${concepts.map(line).join('')}</code></pre></figure>`;
  const all = CONCEPT_KEYS.map((key) => [key]);
  const panes = pane('compose', all) + pane('sbatch', options.untaggedSbatch ? all.slice(0, 3) : all) + pane('coordinator', [['gate']]);
  const rows = options.noRows ? '' : ['Tested', 'You need', 'Depends on your center'].map((label) => `<div class="evidence-row"><dt>${label}</dt><dd><ul><li>item</li></ul></dd></div>`).join('');
  const css = `body{margin:0;font-family:${options.foit ? 'Missing' : 'serif'}}.gap{height:1500px}
.crosswalk__panes{display:grid;gap:8px}.crosswalk__pane{margin:0}
@media (min-width:48rem){.crosswalk__panes{grid-template-columns:1fr 1fr}.crosswalk__pane[data-pane=compose]{grid-row:1/3}}
${options.stackOverlap ? '.crosswalk__pane{position:absolute;top:0;left:0;width:90%}' : ''}
${options.localFallback ? '@font-face{font-family:"Source Serif 4 Fallback";src:local("Arial"),local("Helvetica"),local("Liberation Sans");font-display:swap}.lede{font-family:"Source Serif 4 Fallback",serif}' : ''}
${options.hiddenNav ? '.dup-nav{display:none}' : ''}
${options.foit ? '@font-face{font-family:Missing;src:url(/fonts/missing.woff2) format("woff2");font-display:block}h1{visibility:hidden}' : '@font-face{font-family:Missing;src:url(/fonts/missing.woff2) format("woff2");font-display:swap}h1{font-family:Missing,serif}'}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title><style>${css}</style></head><body>
<header>${options.hiddenNav ? '<nav class="site-nav dup-nav"><a href="/dup">Hidden duplicate</a></nav>' : ''}<nav class="site-nav"><a href="/a">Get started</a></nav></header>${options.foit ? '<script>fetch("/fonts/probe.txt").then(()=>{document.querySelector("h1").style.visibility="visible"}).catch(()=>{})</script>' : ''}<main><h1>Title</h1><p class="lede">Lede text</p><p>Intro</p>
<a class="action action--primary" href="#big-idea">Start with the big idea</a><div class="gap"></div>
<section id="big-idea"><h2>Big idea</h2><figure class="timeline" aria-labelledby="tt"><figcaption id="tt">One allocation</figcaption><ol class="timeline__steps">${steps}</ol></figure><a href="/after">after</a></section>
<section><ul class="doors" id="doors">${doors}</ul></section>
<section class="crosswalk" id="crosswalk"><dl class="crosswalk__legend">${terms}</dl><div class="crosswalk__panes">${panes}</div></section>
<details class="evidence-panel"><summary>What this means for you</summary><dl class="evidence-rows">${rows}</dl></details>
<div data-theme-control hidden><button type="button" data-theme-toggle aria-pressed="false"><span class="vh">Dark theme</span></button></div></main></body></html>`;
}

describe('JS-off completeness check', () => {
  it('passes a home page whose doors, timeline, crosswalk and evidence rows are all in the HTML', async () => {
    const server = await serveFixtures({ '/': { body: homeFixture() } });
    try { expect(await checkJsOff(browser, server.origin, '/', 'home', { panel: true })).toEqual([]); } finally { await server.close(); }
  }, 60_000);

  it('reports a wrong door destination, an untagged concept, and empty evidence rows', async () => {
    const server = await serveFixtures({
      '/door/': { body: homeFixture({ badHref: true }) }, '/tag/': { body: homeFixture({ untaggedSbatch: true }) }, '/rows/': { body: homeFixture({ noRows: true }) },
    });
    try {
      expect((await checkJsOff(browser, server.origin, '/door/', 'home', { panel: true })).map((entry) => entry.message).join('\n')).toMatch(/three doors/);
      expect((await checkJsOff(browser, server.origin, '/tag/', 'home', { panel: true })).map((entry) => entry.message).join('\n')).toMatch(/sbatch pane does not tag: net/);
      expect((await checkJsOff(browser, server.origin, '/rows/', 'home', { panel: true })).map((entry) => entry.message).join('\n')).toMatch(/Tested, You need and Depends on your center rows/);
    } finally { await server.close(); }
  }, 90_000);
});

describe('primary action check', () => {
  it('follows an in-page link to its target and moves the keyboard position there', async () => {
    const server = await serveFixtures({ '/': { body: homeFixture() } });
    try {
      expect(await checkPrimaryAction(browser, server.origin, '/', 'Start with the big idea', 'big-idea')).toEqual([]);
      expect((await checkPrimaryAction(browser, server.origin, '/', 'Start with the big idea', 'missing'))[0].message).toMatch(/normal in-page link to #missing/);
    } finally { await server.close(); }
  }, 60_000);
});

describe('font failure check', () => {
  it('passes a page that stays readable on its fallback fonts', async () => {
    const server = await serveFixtures({ '/': { body: homeFixture() } });
    try { expect(await checkFontBlocking(browser, server.origin, '/')).toEqual([]); } finally { await server.close(); }
  }, 90_000);

  it('reports text that stays hidden until the web font arrives', async () => {
    const server = await serveFixtures({ '/': { body: homeFixture({ foit: true }) }, '/fonts/probe.txt': { body: 'ok' } });
    try { expect((await checkFontBlocking(browser, server.origin, '/')).map((entry) => entry.message).join('\n')).toMatch(/text is hidden while fonts are unavailable: h1/); } finally { await server.close(); }
  }, 90_000);
});

describe('font failure check false positives', () => {
  it('does not count a local() fallback face as a loaded web font', async () => {
    const server = await serveFixtures({ '/': { body: homeFixture({ localFallback: true }) } });
    try { expect(await checkFontBlocking(browser, server.origin, '/')).toEqual([]); } finally { await server.close(); }
  }, 90_000);

  it('does not trip on a hidden duplicate nav that is hidden in the normal render too', async () => {
    const server = await serveFixtures({ '/': { body: homeFixture({ hiddenNav: true }) } });
    try { expect(await checkFontBlocking(browser, server.origin, '/')).toEqual([]); } finally { await server.close(); }
  }, 90_000);
});

describe('crosswalk layout and motion checks', () => {
  it('accepts stacked panes at 320 px and a two-column layout at 1280 px, and flags overlap', async () => {
    const server = await serveFixtures({ '/good/': { body: homeFixture() }, '/overlap/': { body: homeFixture({ stackOverlap: true }) } });
    try {
      expect(await checkCrosswalkLayout(browser, server.origin, '/good/')).toEqual([]);
      expect((await checkCrosswalkLayout(browser, server.origin, '/overlap/')).length).toBeGreaterThan(0);
    } finally { await server.close(); }
  }, 60_000);

  it('accepts a static page and flags an animated one and smooth scrolling under reduced motion', async () => {
    const animated = homeFixture().replace('</style>', '@keyframes s{to{opacity:1}}h1{animation:s 1s infinite}html{scroll-behavior:smooth}</style>');
    const server = await serveFixtures({ '/good/': { body: homeFixture() }, '/animated/': { body: animated } });
    try {
      expect(await checkMotion(browser, server.origin, '/good/')).toEqual([]);
      const codes = (await checkMotion(browser, server.origin, '/animated/')).map((entry) => `${entry.scope}:${entry.code}`);
      expect(codes).toContain('/animated/:motion:no-preference:A11Y-MOTION');
      expect(codes).toContain('/animated/:motion:reduce:A11Y-MOTION');
    } finally { await server.close(); }
  }, 60_000);
});

describe('component geometry check', () => {
  const page = (extra: string) => `<!doctype html><html lang="en"><head><title>t</title><style>body{margin:0}.timeline{display:flex}.timeline__bars{inline-size:40px;block-size:40px}.doors{display:flex}.door{inline-size:100px;block-size:40px}${extra}</style></head><body><main><div class="timeline"><div class="timeline__bars"></div><div class="timeline__bars"></div></div><div class="doors"><div class="door"></div><div class="door"></div></div></main></body></html>`;

  it('accepts aligned lanes and doors and flags a stray margin on later items', async () => {
    const server = await serveFixtures({ '/good/': { body: page('') }, '/shifted/': { body: page('.timeline__bars+.timeline__bars{margin-top:8px}.door+.door{margin-top:8px}') } });
    try {
      expect(await checkComponentGeometry(browser, server.origin, '/good/')).toEqual([]);
      const messages = (await checkComponentGeometry(browser, server.origin, '/shifted/')).map((entry) => entry.message).join('\n');
      expect(messages).toMatch(/timeline lanes must start at one height/);
      expect(messages).toMatch(/doors must start at one height/);
    } finally { await server.close(); }
  }, 60_000);

  it('flags a concept shape glyph that reaches the accessible name', async () => {
    const glyph = '<!doctype html><html lang="en"><head><title>t</title></head><body><main><p>Use a <span>\u25B2 scratch</span> area.</p></main></body></html>';
    const server = await serveFixtures({ '/glyph/': { body: glyph } });
    try { expect((await checkComponentGeometry(browser, server.origin, '/glyph/')).map((entry) => entry.message).join('\n')).toMatch(/concept shape glyph/); } finally { await server.close(); }
  }, 60_000);
});

describe('guide cards check', () => {
  const tile = (title: string, summary: string) => `<li><a class="resource-tile" href="/x/"><h3>${title}</h3><p>${summary}</p><span class="resource-tile__tag">Tag</span></a></li>`;
  const LONG = 'A much longer summary that wraps over several lines inside a narrow tile so that this tile is taller than its neighbour. '.repeat(3);
  const tiles = [tile('One', LONG), tile('Two', 'Short.'), tile('Three', 'Short.'), tile('Four', LONG)].join('');
  const BASE = 'body{margin:0}.resource-grid{display:grid;grid-template-columns:repeat(2,220px);gap:8px;margin:0;padding:0;list-style:none}.resource-tile{display:flex;flex-direction:column;color:inherit;text-decoration:none}.resource-tile h3{margin:0;text-decoration-line:underline}';
  const EQUAL = '.resource-grid{align-items:stretch}.resource-grid>li{display:flex}.resource-tile{flex:1}';
  const page = (css: string, items = tiles) => `<!doctype html><html lang="en"><head><title>t</title><style>${BASE}${css}</style></head><body><main><ul class="resource-grid">${items}</ul></main></body></html>`;
  const messages = async (origin: string, path: string) => (await checkGuideCards(browser, origin, path)).map((entry) => `${entry.code}: ${entry.message}`).join('\n');

  it('accepts equal-height tiles with only the title underlined', async () => {
    const server = await serveFixtures({ '/good/': { body: page(EQUAL) } });
    try { expect(await checkGuideCards(browser, server.origin, '/good/')).toEqual([]); } finally { await server.close(); }
  }, 60_000);

  it('flags tiles in one row that differ in height', async () => {
    const server = await serveFixtures({ '/uneven/': { body: page('.resource-grid{align-items:start}') } });
    try {
      const found = await messages(server.origin, '/uneven/');
      expect(found).toMatch(/A11Y-COMPONENT-GEOMETRY: .*tiles that share a row must be equally tall/);
    } finally { await server.close(); }
  }, 60_000);

  it('flags a tile title that is not underlined', async () => {
    const server = await serveFixtures({ '/plain-title/': { body: page(`${EQUAL}.resource-tile h3{text-decoration-line:none}`) } });
    try { expect(await messages(server.origin, '/plain-title/')).toMatch(/A11Y-COMPONENT-GEOMETRY: .*title must be underlined/); } finally { await server.close(); }
  }, 60_000);

  it('flags a summary or tag that is underlined, whether by its own rule or by the whole tile', async () => {
    const server = await serveFixtures({
      '/own/': { body: page(`${EQUAL}.resource-tile p{text-decoration-line:underline}`) },
      '/whole/': { body: page(`${EQUAL}.resource-tile{text-decoration-line:underline}`) },
    });
    try {
      expect(await messages(server.origin, '/own/')).toMatch(/A11Y-COMPONENT-GEOMETRY: .*summary and tag must not be underlined/);
      expect(await messages(server.origin, '/whole/')).toMatch(/A11Y-COMPONENT-GEOMETRY: .*summary and tag must not be underlined/);
    } finally { await server.close(); }
  }, 60_000);

  it('flags a page with no tiles, and a page where no two tiles share a row, since neither can show equal heights', async () => {
    const server = await serveFixtures({ '/empty/': { body: page('', '') }, '/column/': { body: page(`${EQUAL}.resource-grid{grid-template-columns:220px}`) } });
    try {
      expect(await messages(server.origin, '/empty/')).toMatch(/A11Y-COMPONENT-GEOMETRY: .*no \.resource-tile/);
      expect(await messages(server.origin, '/column/')).toMatch(/A11Y-COMPONENT-GEOMETRY: .*no two tiles share a row/);
    } finally { await server.close(); }
  }, 60_000);
});

describe('concept chip check', () => {
  const page = (css: string) => `<!doctype html><html lang="en"><head><title>t</title><style>body{margin:0}.c-step,.c-gate,.c-scratch,.c-net{--c-bg:#e3f0fc;background:var(--c-bg);padding:0 .3em .05em}@media (prefers-color-scheme:dark){.c-step,.c-gate,.c-scratch,.c-net{--c-bg:#0f2a44}}${css}</style></head><body><main><section id="big-idea"><ol><li class="concept"><span class="concept__term c-step">Step</span></li><li class="concept"><span class="concept__term c-gate">Gate</span></li></ol></section></main></body></html>`;
  const messages = async (origin: string, path: string) => (await checkComponentGeometry(browser, origin, path)).map((entry) => `${entry.scope} ${entry.code} ${entry.message}`).join('\n');

  it('accepts big-idea terms that keep a tinted chip in light and dark', async () => {
    const server = await serveFixtures({ '/good/': { body: page('') } });
    try { expect(await checkComponentGeometry(browser, server.origin, '/good/')).toEqual([]); } finally { await server.close(); }
  }, 60_000);

  it('flags a term that a reset rule has stripped of its chip, naming the scheme', async () => {
    const server = await serveFixtures({
      '/both/': { body: page(':is(p,li) :is(.c-step,.c-gate){background:none;padding:0}') },
      '/dark/': { body: page('@media (prefers-color-scheme:dark){.c-gate{background:none}}') },
    });
    try {
      const both = await messages(server.origin, '/both/');
      expect(both).toMatch(/component-geometry:light A11Y-GEOMETRY .*concept terms in the big idea must keep their tinted chip.*Step, Gate/);
      expect(both).toMatch(/component-geometry:dark A11Y-GEOMETRY /);
      const dark = await messages(server.origin, '/dark/');
      expect(dark).toMatch(/component-geometry:dark A11Y-GEOMETRY .*Gate/);
      expect(dark).not.toMatch(/component-geometry:light/);
    } finally { await server.close(); }
  }, 60_000);
});
