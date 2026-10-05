import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import Crosswalk from '../../site/src/components/Crosswalk.astro';
import { CONCEPTS } from '../../site/src/content/contracts';
import { CROSSWALK } from '../../site/src/content/crosswalk';

const decode = (value: string) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const markFor = Object.fromEntries(CONCEPTS.map(({ key, mark }) => [key, mark])) as Record<string, string>;
const labelFor = Object.fromEntries(CONCEPTS.map(({ key, label }) => [key, label])) as Record<string, string>;
let container: AstroContainer;

beforeAll(async () => {
  container = await AstroContainer.create();
});

const render = (slots: Record<string, string> = {}) => container.renderToString(Crosswalk, { props: { data: CROSSWALK }, slots });
const panes = (html: string) => [...html.matchAll(/<figure class="crosswalk__pane" data-pane="([a-z]+)"><figcaption>([\s\S]*?)<\/figcaption><pre><code>([\s\S]*?)<\/code><\/pre><\/figure>/g)]
  .map(([, id, caption, code]) => ({
    id,
    caption,
    code,
    lines: [...code.matchAll(/<span class="crosswalk__line"(?: data-concepts="([a-z ]+)")?><span class="crosswalk__mark" aria-hidden="true">([^<]*)<\/span>(?:<span class="crosswalk__sr">([^<]*)<\/span>)?(?:<span class="crosswalk__n">(\d+)<\/span>)?([^<]*)<\/span>/g)]
      .map(([, concepts = '', marks, sr = '', n, body]) => ({
        concepts: concepts ? concepts.split(' ') : [],
        marks,
        sr,
        n: n ? Number(n) : undefined,
        text: decode(body).replace(/\n$/, ''),
      })),
  }));

describe('Crosswalk', () => {
  it('opens with the heading, subtitle and a four-term legend naming the old Compose form', async () => {
    const html = await render();
    expect(html).toContain('<section class="crosswalk" id="crosswalk" aria-labelledby="crosswalk-title"><h2 id="crosswalk-title">Four ideas that change meaning</h2><p class="crosswalk__subtitle">Same idea, same color and shape, on every page of this site.</p><dl class="crosswalk__legend">');
    for (const { key, label, was, mark } of CONCEPTS) {
      expect(html).toContain(`<div class="crosswalk__term" data-concept="${key}"><dt><span class="crosswalk__mark" aria-hidden="true">${mark}</span> ${label}</dt><dd>was ${was}</dd></div>`);
    }
    expect([...html.matchAll(/data-concept="([a-z]+)"/g)].map(([, key]) => key)).toEqual(CONCEPTS.map(({ key }) => key));
  });

  it('renders every pane and line from the data, in order, with a shape for each tagged concept', async () => {
    const rendered = panes(await render());
    expect(rendered.map(({ id }) => id)).toEqual(CROSSWALK.panes.map(({ id }) => id));
    rendered.forEach((pane, index) => {
      const source = CROSSWALK.panes[index];
      expect(pane.lines.map(({ n, text, concepts }) => ({ n, text, concepts }))).toEqual(
        source.lines.map(({ n, text, concepts }) => ({ n, text, concepts: [...concepts] })),
      );
      for (const line of pane.lines) expect(line.marks).toBe(line.concepts.map((key) => markFor[key]).join(''));
    });
  });

  it('reads the concept labels aloud on tagged lines only, so the shape is never the only cue', async () => {
    for (const pane of panes(await render())) {
      for (const line of pane.lines) {
        expect(line.sr, `${pane.id}:${line.n ?? line.text}`).toBe(line.concepts.length > 0 ? `${line.concepts.map((key) => labelFor[key]).join(', ')}: ` : '');
      }
    }
    const html = await render();
    expect(html).toContain('<span class="crosswalk__sr">Readiness gate: </span>');
    expect(html).not.toMatch(/<span class="crosswalk__sr"[^>]*aria-hidden/);
  });

  it('keeps every line on its own line without CSS or JavaScript', async () => {
    for (const pane of panes(await render())) expect(pane.code.match(/\n<\/span>/g)).toHaveLength(pane.lines.length);
  });

  it('labels panes by file and revision, adding the record link only to the script pane', async () => {
    const plain = panes(await render());
    expect(plain.map(({ caption }) => decode(caption))).toEqual(CROSSWALK.panes.map(({ file, note }) => `${file} · ${note}`));
    expect(plain.some(({ caption }) => caption.includes('Full test record'))).toBe(false);
    const linked = panes(await render({ record: '<a href="/applicability/m2-example/">Full test record</a>' }));
    expect(linked[0].caption).toBe('docker-compose.yml · simplified · Designed, not run');
    expect(linked[1].caption).toBe('slurm/baseline.sbatch · excerpt · line numbers from v0.1.0 · <a href="/applicability/m2-example/">Full test record</a>');
    expect(linked[2].caption).toBe('bin/coordinator.py · excerpt · line numbers from v0.1.0');
  });
});
