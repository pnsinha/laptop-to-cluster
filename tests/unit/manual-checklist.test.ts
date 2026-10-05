import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EVIDENCE_ROW_LABELS, NAV_ITEMS, TIMELINE_STEPS } from '../../site/src/content/contracts';

const checklist = readFileSync(fileURLToPath(new URL('../accessibility/MANUAL-CHECKLIST.md', import.meta.url)), 'utf8');

describe('manual accessibility checklist', () => {
  it('covers every surface the keyboard and screen-reader gates name, and how to start the preview', () => {
    for (const surface of ['Skip link', 'Header navigation', 'Theme control', 'Hero actions', 'Evidence badge and panel', 'Timeline', 'Doors', 'Crosswalk', 'Pager', 'Footer']) {
      expect(checklist, surface).toContain(`**${surface}`);
    }
    for (const heading of ['## A. Keyboard pass', '## B. VoiceOver spot check', '## C. Real forced colours', '## D. Print', '## E. Quick extras']) expect(checklist, heading).toContain(heading);
    expect(checklist).toContain('npx astro preview --root site --port 4321');
    expect(checklist).toContain('VO+Space');
  });

  it('uses the frozen labels', () => {
    for (const { label } of TIMELINE_STEPS) expect(checklist, label).toContain(label);
    for (const label of EVIDENCE_ROW_LABELS) expect(checklist, label).toContain(label);
    for (const { label } of NAV_ITEMS) expect(checklist, label).toContain(label.replace(' (external)', ''));
  });

  it('gives every check a box to tick', () => {
    expect((checklist.match(/^- \[ \] /gm) ?? []).length).toBeGreaterThanOrEqual(30);
  });
});
