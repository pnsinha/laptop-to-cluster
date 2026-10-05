import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import ThemeControl from '../../site/src/components/ThemeControl.astro';

let html = '';
beforeAll(async () => {
  html = await (await AstroContainer.create()).renderToString(ThemeControl);
});

describe('ThemeControl', () => {
  it('renders the contract markup: hidden until the script unhides it, three text-labelled buttons in order', () => {
    expect(html).toContain('<div class="theme-control" data-theme-control hidden><span class="theme-control__label">Theme</span>');
    const buttons = [...html.matchAll(/<button type="button" data-theme-choice="(system|light|dark)" aria-pressed="(true|false)">(System|Light|Dark)<\/button>/g)];
    expect(buttons.map((match) => [match[1], match[3].toLowerCase()])).toEqual([['system', 'system'], ['light', 'light'], ['dark', 'dark']]);
  });

  it('has no inline handler attributes and exactly one inline script', () => {
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html.match(/<script\b/g)).toHaveLength(1);
  });
});
