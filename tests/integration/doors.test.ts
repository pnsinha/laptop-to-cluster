import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import Doors from '../../site/src/components/Doors.astro';
import { DOORS } from '../../site/src/content/contracts';

const doors = DOORS.map((door) => ({ ...door, summary: `Summary for ${door.id}.` }));
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!);
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let container: AstroContainer;

beforeAll(async () => {
  container = await AstroContainer.create();
});

const render = (input: unknown = doors) => container.renderToString(Doors, { props: { doors: input } });
const items = (html: string) => [...html.matchAll(/<div class="door" id="door-([a-z]+)">([\s\S]*?)<\/div>/g)].map(([, id, body]) => ({ id, body }));

describe('Doors', () => {
  it('renders three Starlight cards with the frozen ids and order', async () => {
    const html = await render();
    expect(html).toContain('<div class="doors not-content" id="doors">');
    expect(html.match(/<article class="card/g)).toHaveLength(3);
    expect(items(html).map(({ id }) => id)).toEqual(['understand', 'translate', 'evaluate']);
  });

  it('puts the audience line in the card title, then the door name as a heading, the summary and one link', async () => {
    const html = await render();
    const rendered = items(html);
    DOORS.forEach((door, index) => {
      expect(html, door.id).toMatch(new RegExp(`<p class="title[^"]*"[^>]*>(?:<svg[\\s\\S]*?</svg>)?<span[^>]*>${escapeRegExp(escapeHtml(door.eyebrow))}</span></p>`));
      expect(rendered[index].body).toContain(`<h3 class="door__title">${escapeHtml(door.title)}</h3>`);
      expect(rendered[index].body).toContain(`<p class="door__summary">Summary for ${door.id}.</p>`);
      expect(rendered[index].body).toContain(`<p class="door__go"><a class="door__link" href="${door.href}">${escapeHtml(door.linkText)}</a></p>`);
      expect(rendered[index].body.match(/<a\b/g)).toHaveLength(1);
    });
  });

  it('gives each door an icon the stylesheet does not have to draw', async () => {
    const html = await render();
    expect(html.match(/<svg[^>]*aria-hidden="true"/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('keeps the card itself unclickable, never lists a learning path, and uses no arrows', async () => {
    const html = await render();
    expect(html).not.toMatch(/<a\b[^>]*>\s*<(?:article|div class="door")|onclick=|role="link"|tabindex=/i);
    expect(html).not.toContain('door__path');
    for (const { body } of items(html)) {
      expect(body.match(/class="door__link"/g)).toHaveLength(1);
      expect(body.match(/<h3 class="door__title">([\s\S]*?)<\/h3>/)?.[1]).not.toContain('<a');
    }
    expect(html).not.toMatch(/[→↗➔➜⟶»]/);
  });
});
