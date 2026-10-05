import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import Timeline from '../../site/src/components/Timeline.astro';
import { TIMELINE_STEPS } from '../../site/src/content/contracts';

const captions = {
  1: 'Caption one.', 2: 'Caption two.', 3: 'Proves the coordinator can serve.',
  4: 'Caption four.', 5: 'Caption five.', 6: 'Caption six.',
} as const;
let container: AstroContainer;

beforeAll(async () => {
  container = await AstroContainer.create();
});

const render = (props: Record<string, unknown> = {}) => container.renderToString(Timeline, { props: { captions, ...props } });
const steps = (html: string) => [...html.matchAll(/<li class="timeline__step" data-step="(\d)"( aria-current="step")?>([\s\S]*?)<\/li>/g)]
  .map(([, n, current, body]) => ({ n: Number(n) as keyof typeof captions, current: Boolean(current), body }));
const span = (body: string, lane: string) => body.match(new RegExp(`<span class="timeline__lane" data-lane="${lane}" data-span="([a-z]+)">`))?.[1];

describe('Timeline', () => {
  it('renders the contract shell with the default title, once', async () => {
    const html = await render();
    expect(html).toContain('<figure class="timeline" aria-labelledby="timeline-title"><figcaption id="timeline-title" class="timeline__title">One allocation, start to finish</figcaption><ol class="timeline__steps">');
    expect(html.match(/<figure class="timeline"/g)).toHaveLength(1);
    expect(await render({ title: 'The six steps' })).toContain('<figcaption id="timeline-title" class="timeline__title">The six steps</figcaption>');
  });

  it('lists the six frozen labels in order, each with an announced step number and its caption', async () => {
    const rendered = steps(await render());
    expect(rendered.map(({ n }) => n)).toEqual([1, 2, 3, 4, 5, 6]);
    rendered.forEach(({ n, body }, index) => {
      const expected = `<span class="timeline__num">Step ${n}</span> <strong>${TIMELINE_STEPS[index].label}</strong> <span class="timeline__caption">${captions[n]}</span><span class="timeline__bars" aria-hidden="true">`;
      expect(body.slice(0, expected.length)).toBe(expected);
    });
  });

  it('lights only the highlighted step, and none by default', async () => {
    expect(steps(await render()).filter(({ current }) => current)).toEqual([]);
    expect(steps(await render({ highlight: 3 })).filter(({ current }) => current).map(({ n }) => n)).toEqual([3]);
  });

  it('draws lanes that follow baseline.sbatch: scratch throughout with a tail, coordinator from step 2 to cleanup, workers in step 4 only', async () => {
    const rendered = steps(await render());
    expect(rendered.map(({ body }) => span(body, 'scratch'))).toEqual(['begin', 'full', 'full', 'full', 'full', 'fade']);
    expect(rendered.map(({ body }) => span(body, 'coord'))).toEqual(['none', 'begin', 'full', 'full', 'full', 'stop']);
    expect(rendered.map(({ body }) => span(body, 'workers'))).toEqual(['none', 'none', 'none', 'within', 'none', 'none']);
    expect(rendered.map(({ body }) => span(body, 'checks'))).toEqual(['none', 'none', 'none', 'none', 'none', 'none']);
    expect(rendered.map(({ body }) => body.includes('timeline__mark--gate'))).toEqual([false, false, true, false, false, false]);
    expect(rendered.map(({ body }) => body.includes('timeline__mark--verify'))).toEqual([false, false, false, false, true, false]);
    expect(rendered[2].body).toContain('<span class="timeline__mark timeline__mark--gate">◆</span>');
  });

  it('keeps the scratch note and the gate and verify key under the steps', async () => {
    const html = await render();
    const after = html.indexOf('<p class="timeline__after">');
    const key = html.indexOf('<dl class="timeline__key">');
    expect(html.indexOf('</ol>')).toBeLessThan(after);
    expect(after).toBeLessThan(key);
    expect(key).toBeLessThan(html.indexOf('</figure>'));
    const note = html.slice(after, html.indexOf('</p>', after));
    expect(note).toContain('<span class="c-scratch">Temporary job storage (job-scoped scratch)</span>');
    expect(note).toMatch(/may remain until your center clears it/);
    expect(note).toMatch(/Copy out what you need/);
    const dl = html.slice(key, html.indexOf('</dl>', key));
    expect([...dl.matchAll(/<dt>([^<]+)<\/dt>/g)].map(([, term]) => term)).toEqual(['Gate', 'Verify']);
    expect(dl).toMatch(/<dt>Gate<\/dt><dd>Is the coordinator answering yet\?[^<]*keep it/);
    expect(dl).toMatch(/<dt>Verify<\/dt><dd>Are the results right\?[^<]*replace this check with your own/);
  });

  it('uses list semantics only: one ordered list, no SVG, images or arrows', async () => {
    const html = await render();
    expect(html).not.toMatch(/<svg\b|<img\b|[↓→]/);
    expect(html.match(/<ol\b/g)).toHaveLength(1);
  });
});
