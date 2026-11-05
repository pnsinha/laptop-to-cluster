import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { THEME_SCRIPT_LIMIT, checkComponentGeometry, checkCrosswalkLayout, checkGuideCards, checkFontBlocking, checkForcedColors, checkHeroAction, checkJsOff, checkMotion, checkPrint, checkPrintOverflow, checkThemePrecedence, inspectThemeScript } from './browser-checks';
import { serveFixtures } from './fixture-server';

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); }, 60_000);
afterAll(async () => { await browser?.close(); });

const THEMES = { light: { canvas: '#fbf9f4' }, dark: { canvas: '#131a29' } };
/* A page built the way Starlight builds one: the provider script in the head sets data-theme from the stored choice or the OS, the sync script keeps the theme-color meta in effect on the page canvas, the header holds one labelled select, and a module script wires it the way Starlight's ThemeSelect does. */
const PROVIDER = "window.StarlightThemeProvider=(()=>{const s=typeof localStorage!=='undefined'&&localStorage.getItem('starlight-theme');const t=s||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.dataset.theme=t==='light'?'light':'dark';return{updatePickers(t=s||'auto'){document.querySelectorAll('starlight-theme-select select').forEach((e)=>{e.value=t})}}})()";
const OS_ONLY_PROVIDER = "window.StarlightThemeProvider=(()=>{document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';return{updatePickers(){}}})()";
const SYNC = "(()=>{const r=document.documentElement;r.dataset.l2cJs='';const f=()=>{const t=r.dataset.theme;if(!t)return;document.querySelectorAll('meta[name=theme-color][media]').forEach((e)=>{e.dataset.media||(e.dataset.media=e.media);e.media=e.dataset.media.includes(t)?'all':'not all'})};f();new MutationObserver(f).observe(r,{attributes:true,attributeFilter:['data-theme']})})()";
const METAS = '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#fbf9f4"><meta name="theme-color" media="(prefers-color-scheme: dark)" content="#131a29">';
const SELECT_MARKUP = (options: { name?: string; extra?: string; noAuto?: boolean } = {}) => `<starlight-theme-select><label><span class="sr-only">${options.name ?? 'Select theme'}</span><select autocomplete="off"${options.extra ?? ''}><option value="dark">Dark</option><option value="light">Light</option>${options.noAuto ? '' : '<option value="auto" selected>Auto</option>'}</select></label></starlight-theme-select>`;
type SelectBreak = 'name' | 'small' | 'no-store' | 'no-os-sync' | 'unfocusable' | 'no-ring' | 'always-visible' | 'no-auto' | 'os-only';
const selectScript = (broken: SelectBreak[] = []) => `const k='starlight-theme';const p=(t)=>t==='auto'||t==='dark'||t==='light'?t:'auto';const load=()=>${broken.includes('os-only') ? "'auto'" : "p(typeof localStorage!=='undefined'&&localStorage.getItem(k))"};`
  + `const store=(t)=>{${broken.includes('no-store') ? '' : "localStorage.setItem(k,t==='light'||t==='dark'?t:'')"}};const os=()=>matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';`
  + `const on=(t)=>{StarlightThemeProvider.updatePickers(t);document.documentElement.dataset.theme=t==='auto'?os():t;store(t)};`
  + `${broken.includes('no-os-sync') ? '' : "matchMedia('(prefers-color-scheme: light)').addEventListener('change',()=>{if(load()==='auto')on('auto')});"}`
  + `class S extends HTMLElement{constructor(){super();on(load());this.querySelector('select')?.addEventListener('change',(e)=>on(p(e.currentTarget.value)))}}customElements.define('starlight-theme-select',S)`;
const THEME_CSS = ':root{color-scheme:light dark;--canvas:#fbf9f4}@media (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--canvas:#131a29}}:root[data-theme=dark]{color-scheme:dark;--canvas:#131a29}:root[data-theme=light]{color-scheme:light;--canvas:#fbf9f4}body{background:var(--canvas)}'
  + '.sr-only{position:absolute;inline-size:1px;block-size:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}select{min-inline-size:6rem;min-block-size:2rem}select:focus-visible{outline:2px solid #1a4fd6;outline-offset:2px}';
const themePage = (variant: 'good' | 'late-script' | 'ignores-stored' | 'no-sync', broken: SelectBreak[] = []) => {
  const css = THEME_CSS
    + (broken.includes('always-visible') ? '' : 'starlight-theme-select:not(:defined){display:none}')
    + (broken.includes('small') ? 'select{min-inline-size:16px;min-block-size:16px;inline-size:16px;block-size:16px;font-size:8px;padding:0}' : '')
    + (broken.includes('no-ring') ? 'select:focus-visible{outline:none}' : '');
  const provider = variant === 'ignores-stored' ? OS_ONLY_PROVIDER : PROVIDER;
  const head = `<meta charset="utf-8"><title>t</title>${METAS}${variant === 'late-script' ? '' : `<script>${provider}</script>`}${variant === 'no-sync' ? '' : `<script>${SYNC}</script>`}<style>${css}</style>`;
  const select = SELECT_MARKUP({ name: broken.includes('name') ? 'Theme' : undefined, extra: broken.includes('unfocusable') ? ' tabindex="-1"' : '', noAuto: broken.includes('no-auto') });
  const header = `<header><nav aria-label="Main"><a href="/a">Guide</a></nav>${select}</header>`;
  const late = variant === 'late-script' ? `<script>${provider}</script>` : '';
  const wiring = variant === 'ignores-stored' ? [...broken, 'os-only' as const] : broken;
  return `<!doctype html><html lang="en"><head>${head}</head><body>${header}<main><h1 id="_top">Title</h1><p>Body</p></main>${late}<script type="module">${selectScript(wiring)}</script></body></html>`;
};

describe('theme precedence check', () => {
  it('passes a page whose head script applies the stored choice before the body is parsed, with the theme-color following', async () => {
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

  it('reports a stored choice that never reaches the page, and a theme-color that stays on the OS value', async () => {
    const server = await serveFixtures({ '/ignored/': { body: themePage('ignores-stored') }, '/no-sync/': { body: themePage('no-sync') } });
    try {
      expect((await checkThemePrecedence(browser, server.origin, '/ignored/', THEMES)).map((entry) => entry.code)).toContain('A11Y-THEME-PRECEDENCE');
      const codes = (await checkThemePrecedence(browser, server.origin, '/no-sync/', THEMES)).map((entry) => entry.code);
      expect(codes).toContain('A11Y-THEME-COLOR');
      expect(codes).not.toContain('A11Y-THEME-PRECEDENCE');
    } finally { await server.close(); }
  }, 120_000);
});

describe('theme select check', () => {
  const run = async (broken: SelectBreak[]) => {
    const server = await serveFixtures({ '/t/': { body: themePage('good', broken) } });
    try { return await checkThemePrecedence(browser, server.origin, '/t/', THEMES); } finally { await server.close(); }
  };
  const messages = (issues: Awaited<ReturnType<typeof run>>) => issues.filter((entry) => entry.code === 'A11Y-THEME-CONTROL').map((entry) => entry.message).join('\n');

  it('reports an accessible name other than "Select theme", and a select without the auto option', async () => {
    expect(messages(await run(['name']))).toMatch(/named exactly/);
    expect(messages(await run(['no-auto']))).toMatch(/dark, light and auto/);
  }, 120_000);

  it('reports a select smaller than 24 by 24 CSS pixels', async () => {
    expect(messages(await run(['small']))).toMatch(/24/);
  }, 120_000);

  it('reports a choice that is not stored, and a select that ignores a live OS change on auto', async () => {
    expect(messages(await run(['no-store']))).toMatch(/survive a reload|store the choice/);
    expect(messages(await run(['no-os-sync']))).toMatch(/follow a live OS change/);
  }, 120_000);

  it('reports a select that Tab does not reach, and one with no visible focus ring', async () => {
    expect(messages(await run(['unfocusable']))).toMatch(/Tab/);
    expect(messages(await run(['no-ring']))).toMatch(/focus/);
  }, 120_000);

  it('reports a select that shows without JavaScript', async () => {
    const noScript = (await run(['always-visible'])).filter((entry) => entry.code === 'A11Y-THEME-NOJS');
    expect(noScript.length).toBeGreaterThanOrEqual(1);
    expect(noScript[0].message).toMatch(/select hidden/);
  }, 120_000);
});

describe('theme script inspection', () => {
  it('accepts one blocking inline script in the head within the limit', () => {
    expect(inspectThemeScript(themePage('good'), '/')).toEqual([]);
  });

  it('rejects a deferred, module, oversized, missing or body-level script', () => {
    const good = themePage('good');
    expect(inspectThemeScript(good.replace('<script>window', '<script defer>window'), '/')[0].message).toMatch(/blocking/);
    expect(inspectThemeScript(good.replace('<script>window', '<script type="module">window'), '/')[0].message).toMatch(/blocking/);
    expect(inspectThemeScript(good.replace('<script>window', `<script>var pad="${'x'.repeat(THEME_SCRIPT_LIMIT)}";window`), '/')[0].message).toMatch(new RegExp(`limit is ${THEME_SCRIPT_LIMIT}`));
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
.notice{border:3px double CanvasText;padding:4px}.card{border:1px solid CanvasText;padding:4px}.evidence-badge{border:1px solid CanvasText;display:inline-block}
[role=group] button[aria-pressed=true]{outline:2px solid CanvasText;font-weight:700}
a:focus-visible,button:focus-visible,summary:focus-visible,select:focus-visible{outline:2px solid CanvasText;outline-offset:2px}
.evidence-panel::details-content{content-visibility:visible;display:block}`;
const printScript = (restore: boolean) => `var o=[];addEventListener('beforeprint',function(){o=[].filter.call(document.querySelectorAll('details.evidence-panel:not([open])'),function(d){return 1});o.forEach(function(d){d.open=true})});addEventListener('afterprint',function(){${restore ? 'o.forEach(function(d){d.open=false})' : ''}})`;
function mediumPage(options: { css?: string; print?: string; script?: string; extraCss?: string } = {}) {
  const steps = LABELS.map((label, index) => `<li class="timeline__step" data-step="${index + 1}"><strong>${label}</strong> <span class="timeline__caption">c</span></li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title><style>${options.css ?? GOOD_CSS}${options.extraCss ?? ''}@media print{${options.print ?? ''}}</style></head><body><main>
<h1>Title</h1><p class="notice" role="note"><strong>Warning:</strong> text</p><p class="evidence-badge">Tested</p>
<details class="evidence-panel"><summary>What this means for you</summary><dl class="evidence-rows"><div class="evidence-row"><dt>Tested</dt><dd><ul><li>a</li></ul></dd></div></dl></details>
<div class="doors" id="doors"><article class="card"><p class="title"><span>New to clusters?</span></p><div class="door"><h3 class="door__title">Understand the model</h3><a class="door__link" href="/t">Take the tour</a></div></article><article class="card"><p class="title"><span>Have a Compose file?</span></p><div class="door"><h3 class="door__title">Translate it</h3><a class="door__link" href="/c">Open the map</a></div></article></div>
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
    const lostBoundary = mediumPage({ extraCss: '.notice,.card,.evidence-badge{border:0}' });
    const colourOnly = mediumPage({ css: GOOD_CSS.replace('[role=group] button[aria-pressed=true]{outline:2px solid CanvasText;font-weight:700}', '[role=group] button[aria-pressed=true]{background:#123456}') });
    const lostControl = mediumPage({ extraCss: '@media (forced-colors:active){.door__link{display:none}}' });
    const server = await serveFixtures({
      '/text/': { body: lostText }, '/boundary/': { body: lostBoundary }, '/selected/': { body: colourOnly }, '/control/': { body: lostControl },
      '/nav/': { body: mediumPage({ extraCss: 'nav a[aria-current=page]{color:#123456}' }).replace('<main>', '<nav aria-label="s"><ul><li><a href="/a" aria-current="page">A</a></li><li><a href="/b">B</a></li></ul></nav><main>') },
      '/fc-order/': { body: mediumPage({ extraCss: '@media (forced-colors:active){.timeline__step strong{display:none}}' }) },
    });
    try {
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

describe('print link destinations', () => {
  const external = (extra: string) => mediumPage({ extraCss: extra }).replace('<div class="doors" id="doors">', '<p><a class="ext" href="https://example.org/x">Example</a></p><div class="doors" id="doors">');
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
  const doors = DOOR_ROWS.map(([who, title, href], index) => `<article class="card"><p class="title"><span>${who}</span></p><div class="body"><div class="door" id="door-${index}"><h3 class="door__title">${title}</h3><p class="door__summary">s</p><p class="door__go"><a class="door__link" href="${options.badHref && index === 1 ? '/wrong/' : href}">Go ${index}</a></p></div></div></article>`).join('');
  const terms = CONCEPT_KEYS.map((key, index) => `<div class="crosswalk__term" data-concept="${key}"><dt><span class="crosswalk__mark" aria-hidden="true">m</span> ${key}</dt><dd>was ${WAS[index]}</dd></div>`).join('');
  const line = (concepts: string[]) => `<span class="crosswalk__line" data-concepts="${concepts.join(' ')}">line\n</span>`;
  const pane = (id: string, concepts: string[][]) => `<figure class="crosswalk__pane" data-pane="${id}"><figcaption>${id}</figcaption><pre><code>${concepts.map(line).join('')}</code></pre></figure>`;
  const all = CONCEPT_KEYS.map((key) => [key]);
  const panes = pane('compose', all) + pane('sbatch', options.untaggedSbatch ? all.slice(0, 3) : all) + pane('coordinator', [['gate']]);
  const rows = options.noRows ? '' : ['Tested', 'You need', 'Depends on your center'].map((label) => `<div class="evidence-row"><dt>${label}</dt><dd><ul><li>item</li></ul></dd></div>`).join('');
  const css = `body{margin:0;font-family:${options.foit ? 'Missing' : 'serif'}}.gap{height:1500px}starlight-theme-select:not(:defined){display:none}
.crosswalk__panes{display:grid;gap:8px}.crosswalk__pane{margin:0}
@media (min-width:48rem){.crosswalk__panes{grid-template-columns:1fr 1fr}.crosswalk__pane[data-pane=compose]{grid-row:1/3}}
${options.stackOverlap ? '.crosswalk__pane{position:absolute;top:0;left:0;width:90%}' : ''}
${options.localFallback ? '@font-face{font-family:"Source Serif 4 Fallback";src:local("Arial"),local("Helvetica"),local("Liberation Sans");font-display:swap}.lede{font-family:"Source Serif 4 Fallback",serif}' : ''}
${options.hiddenNav ? '.dup-nav{display:none}' : ''}
${options.foit ? '@font-face{font-family:Missing;src:url(/fonts/missing.woff2) format("woff2");font-display:block}h1{visibility:hidden}' : '@font-face{font-family:Missing;src:url(/fonts/missing.woff2) format("woff2");font-display:swap}h1{font-family:Missing,serif}'}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title><style>${css}</style></head><body>
<header>${options.hiddenNav ? '<nav class="sidebar dup-nav"><a href="/dup">Hidden duplicate</a></nav>' : ''}<nav class="sidebar"><a href="/a">Guide</a></nav>${SELECT_MARKUP()}</header>${options.foit ? '<script>fetch("/fonts/probe.txt").then(()=>{document.querySelector("h1").style.visibility="visible"}).catch(()=>{})</script>' : ''}<main><h1>Title</h1><p class="lede">Lede text</p><p>Intro</p>
<a class="sl-link-button primary" href="/guide/tour/">Take the five-minute tour</a><div class="gap"></div>
<section id="big-idea"><h2>Big idea</h2><figure class="timeline" aria-labelledby="tt"><figcaption id="tt">One allocation</figcaption><ol class="timeline__steps">${steps}</ol></figure><a href="/after">after</a></section>
<section><div class="doors" id="doors">${doors}</div></section>
<section class="crosswalk" id="crosswalk"><dl class="crosswalk__legend">${terms}</dl><div class="crosswalk__panes">${panes}</div></section>
<details class="evidence-panel"><summary>What this means for you</summary><dl class="evidence-rows">${rows}</dl></details></main></body></html>`;
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

describe('hero action check', () => {
  const tour = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body><main><h1>Tour</h1></main></body></html>';
  it('follows the hero link to its page without JavaScript and reports a wrong destination', async () => {
    const server = await serveFixtures({ '/': { body: homeFixture() }, '/guide/tour/': { body: tour } });
    try {
      expect(await checkHeroAction(browser, server.origin, '/', 'Take the five-minute tour', '/guide/tour/')).toEqual([]);
      expect((await checkHeroAction(browser, server.origin, '/', 'Take the five-minute tour', '/missing/'))[0].message).toMatch(/normal link to \/missing\//);
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
  const page = (extra: string) => `<!doctype html><html lang="en"><head><title>t</title><style>body{margin:0}.timeline{display:flex}.timeline__bars{inline-size:40px;block-size:40px}.doors{display:flex}.card{inline-size:100px;block-size:40px}${extra}</style></head><body><main><div class="timeline"><div class="timeline__bars"></div><div class="timeline__bars"></div></div><div class="doors" id="doors"><div class="card"></div><div class="card"></div></div></main></body></html>`;

  it('accepts aligned lanes and doors and flags a stray margin on later items', async () => {
    const server = await serveFixtures({ '/good/': { body: page('') }, '/shifted/': { body: page('.timeline__bars+.timeline__bars{margin-top:8px}.card+.card{margin-top:8px}') } });
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
  const tile = (title: string, summary: string) => `<div class="sl-link-card"><span class="stack"><a href="/x/"><span class="title">${title}</span></a><span class="description">${summary}</span></span></div>`;
  const LONG = 'A much longer summary that wraps over several lines inside a narrow tile so that this tile is taller than its neighbour. '.repeat(3);
  const tiles = [tile('One', LONG), tile('Two', 'Short.'), tile('Three', 'Short.'), tile('Four', LONG)].join('');
  const BASE = 'body{margin:0}.card-grid{display:grid;grid-template-columns:repeat(2,220px);gap:8px}.sl-link-card{display:grid;border:1px solid #999;padding:8px}.sl-link-card a{text-decoration:none}.sl-link-card .title{text-decoration-line:underline}.stack{display:flex;flex-direction:column}';
  const EQUAL = '.card-grid{align-items:stretch}';
  const page = (css: string, items = tiles) => `<!doctype html><html lang="en"><head><title>t</title><style>${BASE}${css}</style></head><body><main><div class="card-grid">${items}</div></main></body></html>`;
  const messages = async (origin: string, path: string) => (await checkGuideCards(browser, origin, path)).map((entry) => `${entry.code}: ${entry.message}`).join('\n');

  it('accepts equal-height cards with only the title underlined', async () => {
    const server = await serveFixtures({ '/good/': { body: page(EQUAL) } });
    try { expect(await checkGuideCards(browser, server.origin, '/good/')).toEqual([]); } finally { await server.close(); }
  }, 60_000);

  it('flags cards in one row that differ in height', async () => {
    const server = await serveFixtures({ '/uneven/': { body: page('.card-grid{align-items:start}') } });
    try {
      const found = await messages(server.origin, '/uneven/');
      expect(found).toMatch(/A11Y-COMPONENT-GEOMETRY: .*tiles that share a row must be equally tall/);
    } finally { await server.close(); }
  }, 60_000);

  it('flags a card title that is not underlined', async () => {
    const server = await serveFixtures({ '/plain-title/': { body: page(`${EQUAL}.sl-link-card .title{text-decoration-line:none}`) } });
    try { expect(await messages(server.origin, '/plain-title/')).toMatch(/A11Y-COMPONENT-GEOMETRY: .*title must be underlined/); } finally { await server.close(); }
  }, 60_000);

  it('flags a description that is underlined, whether by its own rule or by the whole card', async () => {
    const server = await serveFixtures({
      '/own/': { body: page(`${EQUAL}.sl-link-card .description{text-decoration-line:underline}`) },
      '/whole/': { body: page(`${EQUAL}.sl-link-card{text-decoration-line:underline}`) },
    });
    try {
      expect(await messages(server.origin, '/own/')).toMatch(/A11Y-COMPONENT-GEOMETRY: .*description must not be underlined/);
      expect(await messages(server.origin, '/whole/')).toMatch(/A11Y-COMPONENT-GEOMETRY: .*description must not be underlined/);
    } finally { await server.close(); }
  }, 60_000);

  it('flags a page with no cards, and a page where no two cards share a row, since neither can show equal heights', async () => {
    const server = await serveFixtures({ '/empty/': { body: page('', '') }, '/column/': { body: page(`${EQUAL}.card-grid{grid-template-columns:220px}`) } });
    try {
      expect(await messages(server.origin, '/empty/')).toMatch(/A11Y-COMPONENT-GEOMETRY: .*no \.sl-link-card/);
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
