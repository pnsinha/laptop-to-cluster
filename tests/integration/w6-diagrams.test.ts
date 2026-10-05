import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import Diagrams from '../../site/src/components/Diagrams.astro';
import { DESIGNED_NOT_RUN } from '../../site/src/content/contracts';

const NAMES = ['compose-to-hpc', 'single-node-architecture', 'readiness-sequence'] as const;
const TEXT_CLASSES = new Set(['hdr', 'hdr--primary', 'lbl', 'sub', 'step', 'note', 'tag', 'ok', 'no']);
const PX_PER_CHAR = 8.6; // conservative at 14 px for IBM Plex Sans and Mono
const html = {} as Record<(typeof NAMES)[number], string>;

const attrs = (tag: string): Record<string, string> =>
  Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const plain = (inner: string): string => inner.replace(/<[^>]+>/g, '').trim();

beforeAll(async () => {
  const container = await AstroContainer.create();
  for (const name of NAMES) html[name] = await container.renderToString(Diagrams, { props: { name } });
});

describe('W6 diagrams', () => {
  it('renders one labelled figure per name with the svg hidden from assistive technology', () => {
    for (const name of NAMES) {
      expect(html[name].match(/<figure class="diagram"/g)).toHaveLength(1);
      expect(html[name]).toMatch(/<figure class="diagram" role="img" aria-label="[^"]{80,}"/);
      expect(html[name]).toMatch(/<svg[^>]*aria-hidden="true"/);
    }
  });

  it('carries no inline sizing, fonts or style, so the stylesheet owns text size', () => {
    for (const name of NAMES) {
      expect(html[name], name).not.toMatch(/\sstyle=|\sfont-size=|\sfont-family=|system-ui/);
    }
  });

  it('gives every text element a class from the closed set the stylesheet and scanner know', () => {
    for (const name of NAMES) {
      for (const [, tag] of html[name].matchAll(/<text\b([^>]*)>/g)) {
        const classes = (attrs(tag).class ?? '').split(/\s+/).filter(Boolean);
        expect(classes.length, `${name}: ${tag}`).toBeGreaterThan(0);
        for (const cls of classes) expect(TEXT_CLASSES.has(cls), `${name}: ${cls}`).toBe(true);
      }
    }
  });

  it('fits every label inside its box and inside the viewBox at 14 px', () => {
    for (const name of NAMES) {
      const width = Number(/viewBox="0 0 (\d+) \d+"/.exec(html[name])![1]);
      const rects = [...html[name].matchAll(/<rect\b([^>]*)>/g)].map((m) => attrs(m[1])).filter((r) => r.width && r.height)
        .map((r) => ({ x: +r.x, y: +r.y, w: +r.width, h: +r.height }));
      for (const [, tag, inner] of html[name].matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
        const a = attrs(tag);
        const text = plain(inner);
        const textWidth = text.length * PX_PER_CHAR;
        const middle = a['text-anchor'] === 'middle';
        const left = middle ? +a.x - textWidth / 2 : +a.x;
        const right = middle ? +a.x + textWidth / 2 : +a.x + textWidth;
        expect(left, `${name}: "${text}"`).toBeGreaterThanOrEqual(0);
        expect(right, `${name}: "${text}"`).toBeLessThanOrEqual(width);
        if (middle) {
          const box = rects.find((r) => r.x <= +a.x && +a.x <= r.x + r.w && r.y <= +a.y && +a.y <= r.y + r.h);
          if (box) {
            expect(left, `${name}: "${text}" in box`).toBeGreaterThanOrEqual(box.x + 4);
            expect(right, `${name}: "${text}" in box`).toBeLessThanOrEqual(box.x + box.w - 4);
          }
        }
      }
    }
  });

  it('uses the gate colour, never success green, for arrows and markers', () => {
    for (const name of NAMES) expect(html[name]).not.toContain('var(--success)');
    expect(html['single-node-architecture']).toContain('var(--c-gate)');
    expect(html['readiness-sequence']).toContain('var(--c-gate)');
  });

  it('keeps marker ids unique across figures, because Module 1 renders two on one page', () => {
    const ids = NAMES.flatMap((name) => [...html[name].matchAll(/<marker id="([^"]+)"/g)].map((m) => m[1]));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks the GPU row as Designed, not run and drops the tunnel from the loopback label', () => {
    const figure = html['compose-to-hpc'];
    expect(figure.indexOf(DESIGNED_NOT_RUN)).toBeGreaterThan(figure.indexOf('--gres=gpu'));
    expect(figure).not.toMatch(/tunnel/i);
    for (const glyph of ['■', '◆', '▲', '●']) expect(figure).toContain(glyph);
  });

  it('shows the real bind, files, and step kinds in the single-node figure', () => {
    const figure = html['single-node-architecture'];
    expect(figure).toContain('${RUNTIME_DIR}');
    expect(figure).toContain('bound at /work');
    for (const file of ['input.json', 'endpoint.json', 'results.json', 'result.json', 'events.jsonl', 'versions.txt', 'logs/']) expect(figure).toContain(`>${file}<`);
    expect(figure).not.toMatch(/\$SCRATCH|\/data|tasks\/|results\/<|digests/);
    expect(figure).toContain('srun step · apptainer exec');
    expect(figure).toContain('runs inside the job');
  });
});
