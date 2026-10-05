import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { ACKNOWLEDGMENT_SHA256, ACKNOWLEDGMENT_STATEMENT, ACKNOWLEDGMENT_DISCLAIMER } from '../../site/src/content/acknowledgment';
import { TALKS_LABEL } from '../../site/src/content/contracts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = resolve(root, 'site/dist');
const page = (route: string) => readFileSync(resolve(dist, route, 'index.html'), 'utf8');
const normalized = (value: string) => value.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

describe('milestone date label', () => {
  const dueDate = (number: 1 | 2) => parse(readFileSync(resolve(root, `site/src/content/milestones/milestone-${number}.yml`), 'utf8')).due_date as string;

  it('shows the milestone record due date under "Due", never the publication date', () => {
    for (const number of [1, 2] as const) {
      const html = page(`milestones/${number}`);
      const context = html.match(/<p class="record-context">[\s\S]*?<\/p>/)?.[0] ?? '';
      expect(context, `milestone ${number}`).toContain('<strong>Due:</strong>');
      expect(context).toContain(`<time datetime="${dueDate(number)}">`);
      if (number === 2) expect(context).not.toContain('2026-09-26');
    }
  });
});

describe('About section navigation', () => {
  it('lists the Talks label on every About page', () => {
    for (const route of ['about/project', 'about/attribution', 'about/glossary', 'about/support', 'about/accessibility']) {
      const nav = page(route).match(/<nav class="section-nav" aria-label="About sections">[\s\S]*?<\/nav>/)?.[0] ?? '';
      expect(nav, route).toContain('href="/about/talks-and-papers/"');
      expect(nav, route).toContain(`>${TALKS_LABEL.replace(/&/g, '&amp;')}<`);
    }
  });
});

describe('consolidated release notes on the milestone page', () => {
  const releaseSource = resolve(root, 'site/src/content/content-items/release-v0.2.0.md');

  it.runIf(existsSync(releaseSource))('renders the v0.2.0 release item once, as a section after the article and before Sources', () => {
    const html = page('milestones/2');
    expect(html.match(/id="release-v0-2-0"/g)).toHaveLength(1);
    expect(html).toContain('<section class="release-notes" id="release-v0-2-0" aria-labelledby="release-v0-2-0-heading">');
    expect(html.indexOf('id="release-v0-2-0"')).toBeGreaterThan(html.indexOf('</article>'));
    expect(html.indexOf('id="release-v0-2-0"')).toBeLessThan(html.indexOf('class="sources-scope"'));
  });

  it('leaves the v0.1.0 notes inline on Milestone 1, with no generated section', () => {
    expect(page('milestones/1')).not.toContain('class="release-notes"');
  });
});

describe('event acknowledgment beside the download link', () => {
  const source = readFileSync(resolve(root, 'site/src/content/content-items/event-iguide-forum-2026.md'), 'utf8');
  const flagged = /^acknowledgment_beside_download:\s*true\s*$/m.test(source);

  it.runIf(flagged)('renders the verbatim statement once, after the PDF link, from the single source', () => {
    const html = page('events/iguide-forum-2026');
    const section = html.match(/<section class="event-acknowledgment"[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(section).toContain('Acknowledgment for this work');
    const text = normalized(section.replace(/<h2[\s\S]*?<\/h2>/, ''));
    expect(createHash('sha256').update(text).digest('hex')).toBe(ACKNOWLEDGMENT_SHA256);
    expect(html.indexOf('/iguide-forum-2026-poster.pdf')).toBeLessThan(html.indexOf('class="event-acknowledgment"'));
    expect(html.match(/class="event-acknowledgment"/g)).toHaveLength(1);
  });

  it('does not put the acknowledgment text in the Markdown body', () => {
    const body = normalized(source);
    expect(body).not.toContain(ACKNOWLEDGMENT_STATEMENT.split(',')[0]);
    expect(body).not.toContain(normalized(ACKNOWLEDGMENT_DISCLAIMER));
  });
});
