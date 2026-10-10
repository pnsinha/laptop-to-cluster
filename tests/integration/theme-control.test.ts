import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import ThemeControl from '../../site/src/components/ThemeControl.astro';

let html = '';
beforeAll(async () => {
  html = await (await AstroContainer.create()).renderToString(ThemeControl);
});

describe('ThemeControl', () => {
  it('renders the contract markup: hidden until the script unhides it, one toggle button with a moon, a sun and the name "Dark theme"', () => {
    expect(html).toContain('<div class="theme-control" data-theme-control hidden>');
    // The script unhides the control through the toggle's parent, so the toggle must be its direct child.
    expect(html).toContain('<div class="theme-control" data-theme-control hidden><button ');
    const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
    expect(buttons).toHaveLength(1);
    expect(buttons[0][1]).toBe(' type="button" class="theme-control__toggle" data-theme-toggle aria-pressed="false"');
    const icons = [...buttons[0][2].matchAll(/<svg\b([^>]*)>/g)].map((match) => match[1]);
    expect(icons).toHaveLength(2);
    expect(icons[0]).toContain('class="theme-control__icon theme-control__icon--moon"');
    expect(icons[1]).toContain('class="theme-control__icon theme-control__icon--sun"');
    for (const attributes of icons) {
      expect(attributes).toContain('aria-hidden="true"');
      expect(attributes).toContain('focusable="false"');
      expect(attributes).toContain('viewBox="0 0 24 24"');
      expect(attributes).toContain('fill="none"');
      expect(attributes).toContain('stroke="currentColor"');
      expect(attributes).toContain('stroke-width="2"');
      expect(attributes).toContain('stroke-linecap="round"');
      expect(attributes).toContain('stroke-linejoin="round"');
    }
    expect(buttons[0][2]).toContain('<span class="vh">Dark theme</span>');
    expect(buttons[0][2].replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '')).toBe('Dark theme');
  });

  it('has no Theme label, no System, Light or Dark text and no choice buttons', () => {
    expect(html).not.toContain('theme-control__label');
    expect(html).not.toContain('data-theme-choice');
    const visibleText = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<span class="vh">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, '').trim();
    expect(visibleText).toBe('');
  });

  it('has no inline handler attributes and exactly one inline script', () => {
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html.match(/<script\b/g)).toHaveLength(1);
  });
});
