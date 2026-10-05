import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { checkForcedColors, checkPrint, checkThemePrecedence, inspectThemeScript } from './browser-checks';
import { serveFixtures } from './fixture-server';

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); }, 60_000);
afterAll(async () => { await browser?.close(); });

const THEMES = { light: { canvas: '#fbf9f4' }, dark: { canvas: '#131a29' } };
const HEAD_SCRIPT = "try{var v=localStorage.getItem('l2c-theme'),c={dark:'#131a29',light:'#fbf9f4'};if(c[v]){document.documentElement.dataset.theme=v;var m=document.createElement('meta');m.name='theme-color';m.content=c[v];document.head.append(m)}}catch(e){}";
const ENHANCER = "(function(){var k='l2c-theme',r=document.documentElement,w=document.querySelector('[data-theme-control]'),b=w.querySelectorAll('[data-theme-choice]');w.hidden=false;function m(){var e=document.querySelector('meta[name=theme-color]:not([media])');if(!e){e=document.createElement('meta');e.name='theme-color';document.head.append(e)}e.content=getComputedStyle(r).getPropertyValue('--canvas').trim()}function p(){var v=r.dataset.theme||'system';b.forEach(function(x){x.setAttribute('aria-pressed',String(x.dataset.themeChoice===v))})}b.forEach(function(x){x.addEventListener('click',function(){var c=x.dataset.themeChoice;if(c==='system'){delete r.dataset.theme;localStorage.removeItem(k)}else{r.dataset.theme=c;localStorage.setItem(k,c)}p();m()})});p()})();";
const CSS = ':root{color-scheme:light dark;--canvas:#fbf9f4}:root[data-theme=light]{color-scheme:light}@media screen and (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--canvas:#131a29}}:root[data-theme=dark]{color-scheme:dark;--canvas:#131a29}body{background:var(--canvas)}';
const CONTROL = '<div class="theme-control" data-theme-control hidden><span>Theme</span><button type="button" data-theme-choice="system" aria-pressed="true">System</button><button type="button" data-theme-choice="light" aria-pressed="false">Light</button><button type="button" data-theme-choice="dark" aria-pressed="false">Dark</button></div>';
const MEDIA_METAS = '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#fbf9f4"><meta name="theme-color" media="(prefers-color-scheme: dark)" content="#131a29">';
const MEDIA_SCRIPT_ATTR = "try{var v=localStorage.getItem('l2c-theme');if(v=='dark'||v=='light')document.documentElement.dataset.theme=v}catch(e){}";
const MEDIA_SCRIPT_FULL = "try{var v=localStorage.getItem('l2c-theme');if(v=='dark'||v=='light'){document.documentElement.dataset.theme=v;document.querySelectorAll('meta[name=theme-color]').forEach(function(m){m.content=v=='dark'?'#131a29':'#fbf9f4'})}}catch(e){}";
const themePage = (variant: 'good' | 'late-script' | 'ignores-stored' | 'media-metas' | 'media-metas-untouched') => {
  if (variant === 'media-metas' || variant === 'media-metas-untouched') {
    const script = variant === 'media-metas' ? MEDIA_SCRIPT_FULL : MEDIA_SCRIPT_ATTR;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title>${MEDIA_METAS}<script>${script}</script><style>${CSS}</style></head><body><main>${CONTROL}<p>Body</p></main><script>${ENHANCER}</script></body></html>`;
  }
  const head = variant === 'good' ? `<script>${HEAD_SCRIPT}</script>` : '';
  const late = variant === 'late-script' ? `<script>${HEAD_SCRIPT}</script>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title>${head}<style>${CSS}</style></head><body><main>${CONTROL}<p>Body</p></main>${late}<script>${ENHANCER}</script></body></html>`;
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
.theme-control button[aria-pressed=true]{outline:2px solid CanvasText;font-weight:700}
a:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid CanvasText;outline-offset:2px}
.evidence-panel::details-content{content-visibility:visible;display:block}`;
const printScript = (restore: boolean) => `var o=[];addEventListener('beforeprint',function(){o=[].filter.call(document.querySelectorAll('details.evidence-panel:not([open])'),function(d){return 1});o.forEach(function(d){d.open=true})});addEventListener('afterprint',function(){${restore ? 'o.forEach(function(d){d.open=false})' : ''}})`;
function mediumPage(options: { css?: string; print?: string; script?: string; extraCss?: string } = {}) {
  const steps = LABELS.map((label, index) => `<li class="timeline__step" data-step="${index + 1}"><strong>${label}</strong> <span class="timeline__caption">c</span></li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title><style>${options.css ?? GOOD_CSS}${options.extraCss ?? ''}@media print{${options.print ?? ''}}</style></head><body><main>
<h1>Title</h1><p class="notice" role="note"><strong>Warning:</strong> text</p><p class="evidence-badge">Tested on X · Jul 2026</p>
<details class="evidence-panel"><summary>What this means for you</summary><dl class="evidence-rows"><div class="evidence-row"><dt>Tested</dt><dd><ul><li>a</li></ul></dd></div></dl></details>
<ul class="doors"><li class="door"><h3 class="door__title">Understand the model</h3><a class="door__link" href="/t">Take the tour</a></li><li class="door"><h3 class="door__title">Translate it</h3><a class="door__link" href="/c">Open the map</a></li></ul>
<div class="theme-control"><button type="button" aria-pressed="true">System</button><button type="button" aria-pressed="false">Light</button></div>
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
    const colourOnly = mediumPage({ css: GOOD_CSS.replace('.theme-control button[aria-pressed=true]{outline:2px solid CanvasText;font-weight:700}', '.theme-control button[aria-pressed=true]{background:#123456}') });
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
