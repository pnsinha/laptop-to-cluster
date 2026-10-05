import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { checkThemePrecedence, inspectThemeScript } from './browser-checks';
import { serveFixtures } from './fixture-server';

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); }, 60_000);
afterAll(async () => { await browser?.close(); });

const THEMES = { light: { canvas: '#fbf9f4' }, dark: { canvas: '#131a29' } };
const HEAD_SCRIPT = "try{var v=localStorage.getItem('l2c-theme'),c={dark:'#131a29',light:'#fbf9f4'};if(c[v]){document.documentElement.dataset.theme=v;var m=document.createElement('meta');m.name='theme-color';m.content=c[v];document.head.append(m)}}catch(e){}";
const ENHANCER = "(function(){var k='l2c-theme',r=document.documentElement,w=document.querySelector('[data-theme-control]'),b=w.querySelectorAll('[data-theme-choice]');w.hidden=false;function m(){var e=document.querySelector('meta[name=theme-color]:not([media])');if(!e){e=document.createElement('meta');e.name='theme-color';document.head.append(e)}e.content=getComputedStyle(r).getPropertyValue('--canvas').trim()}function p(){var v=r.dataset.theme||'system';b.forEach(function(x){x.setAttribute('aria-pressed',String(x.dataset.themeChoice===v))})}b.forEach(function(x){x.addEventListener('click',function(){var c=x.dataset.themeChoice;if(c==='system'){delete r.dataset.theme;localStorage.removeItem(k)}else{r.dataset.theme=c;localStorage.setItem(k,c)}p();m()})});p()})();";
const CSS = ':root{color-scheme:light dark;--canvas:#fbf9f4}:root[data-theme=light]{color-scheme:light}@media screen and (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--canvas:#131a29}}:root[data-theme=dark]{color-scheme:dark;--canvas:#131a29}body{background:var(--canvas)}';
const CONTROL = '<div class="theme-control" data-theme-control hidden><span>Theme</span><button type="button" data-theme-choice="system" aria-pressed="true">System</button><button type="button" data-theme-choice="light" aria-pressed="false">Light</button><button type="button" data-theme-choice="dark" aria-pressed="false">Dark</button></div>';
const themePage = (variant: 'good' | 'late-script' | 'ignores-stored') => {
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
