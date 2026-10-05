import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import Doors from '../../site/src/components/Doors.astro';
import { DOORS } from '../../site/src/content/contracts';

const path = [
  { label: 'The five-minute tour', href: '/guide/tour/' },
  { label: 'Scheduler as Orchestrator', href: '/guide/scheduler-as-orchestrator/' },
];
const doors = DOORS.map((door, index) => ({ ...door, summary: `Summary for ${door.id}.`, ...(index === 0 ? { path } : {}) }));
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!);
let container: AstroContainer;

beforeAll(async () => {
  container = await AstroContainer.create();
});

const render = (input: unknown = doors) => container.renderToString(Doors, { props: { doors: input } });
const items = (html: string) => [...html.matchAll(/<li class="door" id="door-([a-z]+)">([\s\S]*?)<\/li>(?=<li class="door"|<\/ul>)/g)]
  .map(([, id, body]) => ({ id, body }));

describe('Doors', () => {
  it('renders one list of exactly three doors with the frozen ids and order', async () => {
    const html = await render();
    expect(html).toContain('<ul class="doors" role="list" id="doors">');
    expect(items(html).map(({ id }) => id)).toEqual(['understand', 'translate', 'evaluate']);
  });

  it('renders eyebrow, h3 title, summary, the optional path and one go-link per door', async () => {
    const rendered = items(await render());
    DOORS.forEach((door, index) => {
      const pathHtml = index === 0
        ? `<ol class="door__path">${path.map(({ label, href }) => `<li><a href="${href}">${escapeHtml(label)}</a></li>`).join('')}</ol>`
        : '';
      expect(rendered[index].body).toBe(
        `<p class="door__who">${escapeHtml(door.eyebrow)}</p><h3 class="door__title">${escapeHtml(door.title)}</h3><p class="door__summary">Summary for ${door.id}.</p>${pathHtml}<p class="door__go"><a class="door__link" href="${door.href}">${escapeHtml(door.linkText)}</a></p>`,
      );
    });
  });

  it('renders the learning path only where given and never an empty list', async () => {
    const withoutPath = DOORS.map((door) => ({ ...door, summary: 'Summary.' }));
    expect(await render(withoutPath)).not.toContain('door__path');
    const emptyPath = withoutPath.map((door, index) => (index === 0 ? { ...door, path: [] } : door));
    expect(await render(emptyPath)).not.toContain('door__path');
  });

  it('keeps the card itself unclickable and the links arrow-free', async () => {
    const html = await render();
    expect(html).not.toMatch(/<a\b[^>]*>\s*<li|onclick=|role="link"|tabindex=/i);
    for (const { body } of items(html)) {
      expect(body.match(/class="door__link"/g)).toHaveLength(1);
      expect(body.match(/<h3 class="door__title">([\s\S]*?)<\/h3>/)?.[1]).not.toContain('<a');
    }
    expect(html).not.toMatch(/[→↗➔➜⟶»]/);
  });
});
