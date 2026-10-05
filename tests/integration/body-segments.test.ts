import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import BodySegments from '../../site/src/components/BodySegments.astro';

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

const html = '<h2 id="one">One</h2><p>First.</p>\n<!-- l2c:timeline -->\n<h2 id="two">Two</h2><p>Second.</p>\n<!-- l2c:diagram-single-node-architecture -->\n<p>End.</p>';
const render = (slots: Record<string, string> = {}) => container.renderToString(BodySegments, { props: { html }, slots });

describe('BodySegments', () => {
  it('puts each provided slot exactly where its marker sat and removes the marker', async () => {
    const out = await render({ timeline: '<figure class="timeline">T</figure>', 'diagram-single-node-architecture': '<figure class="diagram">D</figure>' });
    expect(out).not.toContain('l2c:');
    expect(out.indexOf('<h2 id="one">')).toBeLessThan(out.indexOf('<figure class="timeline">'));
    expect(out.indexOf('<figure class="timeline">')).toBeLessThan(out.indexOf('<h2 id="two">'));
    expect(out.indexOf('<h2 id="two">')).toBeLessThan(out.indexOf('<figure class="diagram">'));
    expect(out.indexOf('<figure class="diagram">')).toBeLessThan(out.indexOf('<p>End.</p>'));
  });

  it('renders nothing for a marker whose slot is not provided and still keeps the Markdown', async () => {
    const out = await render({ timeline: '<figure class="timeline">T</figure>' });
    expect(out).not.toContain('l2c:');
    expect(out).not.toContain('class="diagram"');
    expect(out).toContain('<p>End.</p>');
  });

  it('renders the whole body unchanged when there is no marker', async () => {
    const plain = await container.renderToString(BodySegments, { props: { html: '<p>Only text.</p>' } });
    expect(plain).toContain('<p>Only text.</p>');
  });
});
