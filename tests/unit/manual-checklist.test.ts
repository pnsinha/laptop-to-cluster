import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EVIDENCE_ROW_LABELS, TIMELINE_STEPS } from '../../site/src/content/contracts';

const checklist = readFileSync(fileURLToPath(new URL('../accessibility/MANUAL-CHECKLIST.md', import.meta.url)), 'utf8');
/* The sidebar groups and the site information links, as the built shell renders them (see tests/integration/starlight-shell.test.ts). */
const SIDEBAR_GROUPS = ['Learning path', 'While you run it', 'Evidence', 'Project'];
const FOOTER_LINKS = ['Report a problem', 'Accessibility', 'Attribution and licenses', 'GitHub repository (external)'];

describe('manual accessibility checklist', () => {
  it('covers every surface the keyboard and screen-reader gates name, and how to start the preview', () => {
    for (const surface of ['Skip link', 'Header', 'Sidebar navigation, wide', 'Sidebar navigation, narrow', 'Theme control', 'Hero actions', 'Evidence badge and panel', 'Timeline', 'Doors', 'Crosswalk', 'On this page', 'Pager', 'Footer']) {
      expect(checklist, surface).toContain(`**${surface}`);
    }
    for (const heading of ['## A. Keyboard pass', '## B. VoiceOver spot check', '## C. Real forced colours', '## D. Print', '## E. Quick extras']) expect(checklist, heading).toContain(heading);
    expect(checklist).toContain('npx astro preview --root site --port 4321');
    expect(checklist).toContain('VO+Space');
  });

  it("describes Starlight's theme select and narrow menu, not the old toggle and navigation disclosure", () => {
    const items = checklist.split('\n').filter((line) => line.startsWith('- [ ] **Theme control.**'));
    expect(items).toHaveLength(2);
    const [keyboard, voiceover] = items;
    expect(keyboard).toContain('"Select theme"');
    expect(keyboard).toContain('Dark, Light or Auto');
    expect(voiceover).toContain('"Select theme, pop-up button"');
    for (const stale of ['sun/moon', 'Dark theme, toggle button', 'System, Light, Dark', 'Press System']) expect(checklist).not.toContain(stale);
    const narrow = checklist.split('\n').find((line) => line.startsWith('- [ ] **Sidebar navigation, narrow.**')) ?? '';
    expect(narrow).toContain('"Menu"');
    expect(narrow).toContain('Escape closes the menu');
    expect(checklist).not.toContain('Tab to "Navigation"');
  });

  it('uses the frozen labels', () => {
    for (const { label } of TIMELINE_STEPS) expect(checklist, label).toContain(label);
    for (const label of EVIDENCE_ROW_LABELS) expect(checklist, label).toContain(label);
    for (const label of SIDEBAR_GROUPS) expect(checklist, label).toContain(label);
    for (const label of FOOTER_LINKS) expect(checklist, label).toContain(label);
  });

  it('gives every check a box to tick', () => {
    expect((checklist.match(/^- \[ \] /gm) ?? []).length).toBeGreaterThanOrEqual(30);
  });
});
