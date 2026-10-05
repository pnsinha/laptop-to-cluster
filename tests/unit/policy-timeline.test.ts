import { describe, expect, it } from 'vitest';
import { TIMELINE_STEPS } from '../../site/src/content/contracts';
import { TIMELINE_LABELS, timelineIssues, validatePageComposition } from '../../scripts/publication.mjs';

const step = (n: number, label: string, current = false) =>
  `<li class="timeline__step" data-step="${n}"${current ? ' aria-current="step"' : ''}><span class="timeline__num">Step ${n}</span> <strong>${label}</strong> <span class="timeline__caption">A caption.</span><span class="timeline__bars" aria-hidden="true"><i></i></span></li>`;
const figure = (labels: readonly string[] = TIMELINE_LABELS, current = 3) =>
  `<figure class="timeline" aria-labelledby="timeline-title"><figcaption id="timeline-title" class="timeline__title">One allocation, start to finish</figcaption><ol class="timeline__steps">${labels.map((label, index) => step(index + 1, label, index + 1 === current)).join('')}</ol><dl class="timeline__key"><dt>Gate</dt><dd>Checks the coordinator can serve.</dd><dt>Verify</dt><dd>Checks the results.</dd></dl></figure>`;
const row = (label: string) => `<div class="evidence-row"><dt>${label}</dt><dd><ul><li>An item.</li></ul></dd></div>`;
const projection = `<section class="applicability-projection" data-projection-id="landing:m1" data-source-id="m1" aria-label="Tested workflow scope"><p class="evidence-badge">Tested on Purdue Anvil · Jul 2026</p><p class="evidence-link"><a href="/applicability/m1/">Full test record</a></p><details class="evidence-panel"><summary>What this means for you</summary><dl class="evidence-rows">${row('Tested')}${row('You need')}${row('Depends on your center')}</dl><p class="evidence-untested"><a href="/adoption/evaluate/#not-tested">What hasn't been tested yet</a></p></details></section>`;
// The landing profile also needs its one generated projection; other profiles forbid it.
const page = (body: string, profile = 'landing') => `<body data-composition-profile="${profile}"><main>${profile === 'landing' ? projection : ''}${body}</main></body>`;

describe('TIMELINE', () => {
  it('pins the labels to the frozen contract', () => {
    expect([...TIMELINE_LABELS]).toEqual(TIMELINE_STEPS.map(({ label }) => label));
  });

  it('accepts one well-formed timeline, lit or unlit, and ignores other ordered lists and other strong text', () => {
    expect(timelineIssues(page(figure()))).toEqual([]);
    expect(timelineIssues(page(figure(TIMELINE_LABELS, 0)))).toEqual([]);
    expect(timelineIssues(page(`${figure()}<ol class="door__path"><li><strong>Tour</strong></li><li><strong>Module 1</strong></li></ol>`))).toEqual([]);
    expect(validatePageComposition('/', page(figure()))).toEqual([]);
  });

  it('requires exactly one on the landing page, and allows none elsewhere', () => {
    expect(validatePageComposition('/', page('<p>No figure.</p>')).join('\n')).toMatch(/TIMELINE.*exactly one/);
    expect(validatePageComposition('/', page(figure() + figure())).join('\n')).toMatch(/TIMELINE.*at most one/);
    expect(validatePageComposition('/about/', page('<p>No figure.</p>', 'about'))).toEqual([]);
    expect(validatePageComposition('/about/', page(figure(), 'about'))).toEqual([]);
    expect(validatePageComposition('/about/', page(figure() + figure(), 'about')).join('\n')).toMatch(/TIMELINE/);
  });

  it('rejects wrong, missing, renamed or reordered labels, with the legacy figure also rejected', () => {
    const swapped = [...TIMELINE_LABELS];
    [swapped[4], swapped[5]] = [swapped[5], swapped[4]];
    for (const labels of [swapped, TIMELINE_LABELS.slice(0, 5), ['Allocation', 'Coordinator', 'Readiness gate', 'Workers', 'Verification', 'Clean up'], [...TIMELINE_LABELS.slice(0, 5), 'Cleanup']]) {
      expect(timelineIssues(page(figure(labels))).join('\n')).toMatch(/step labels must read/);
    }
    const legacy = '<figure class="workflow-figure"><figcaption>One allocation, five ordered responsibilities</figcaption><ol><li><strong>Allocation</strong></li></ol></figure>';
    expect(validatePageComposition('/', page(legacy)).join('\n')).toMatch(/TIMELINE.*exactly one/);
  });

  it('checks the figure label, the step numbering, aria-current and the hidden bars', () => {
    expect(timelineIssues(page(figure().replace(' aria-labelledby="timeline-title"', ''))).join('\n')).toMatch(/figcaption/);
    expect(timelineIssues(page(figure().replace('data-step="2"', 'data-step="9"'))).join('\n')).toMatch(/data-step/);
    expect(timelineIssues(page(figure().replace('<li class="timeline__step" data-step="1">', '<li class="timeline__step" data-step="1" aria-current="step">'))).join('\n')).toMatch(/aria-current/);
    expect(timelineIssues(page(figure().replace('class="timeline__bars" aria-hidden="true"', 'class="timeline__bars"'))).join('\n')).toMatch(/aria-hidden/);
    expect(timelineIssues(page(figure().replace('<ol class="timeline__steps">', '<ul>').replace('</ol>', '</ul>'))).join('\n')).toMatch(/exactly one ordered list/);
  });

  it('rejects a second copy of the six-step sequence outside the figure', () => {
    const copy = `<ol>${TIMELINE_LABELS.map((label) => `<li><strong>${label}</strong></li>`).join('')}</ol>`;
    expect(timelineIssues(page(figure() + copy)).join('\n')).toMatch(/outside the timeline figure/);
  });
});
