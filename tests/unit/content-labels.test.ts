import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const item = (file: string) => readFileSync(`${root}/site/src/content/content-items/${file}`, 'utf8');

describe('labels say what they point at', () => {
  it('Milestone 2 calls the first quoted item a suggestion, as the section does', () => {
    const text = item('milestone-2.md');
    expect(text).toContain('it answers the program-review suggestion quoted below.');
    expect(text).not.toContain('first Milestone 1 program-review question');
    expect(text).toContain('made one suggestion and asked four questions');
  });

  it('the talks page scope names its one hosted exception', () => {
    const text = item('about-talks-and-papers.md');
    expect(text).toContain('this site hosts no slides, abstracts or posters, except the I-GUIDE Forum 2026 poster, kept as presented on its event page.');
    expect(text).toContain('The one exception is the I-GUIDE Forum poster');
  });

  it('links called a test record go to a test record', () => {
    expect(item('about-project.md')).toContain('[test record](/applicability/m1-baseline-anvil/)');
    expect(item('about-cheat-sheet.md')).toContain('[the test record](/applicability/m2-baseline-anvil-2026-10/)');
    for (const file of ['about-project.md', 'about-cheat-sheet.md']) expect(item(file)).not.toMatch(/\[(?:the )?test record\]\((?:\/milestones\/1\/|\/adoption\/evaluate\/)\)/);
  });
});
