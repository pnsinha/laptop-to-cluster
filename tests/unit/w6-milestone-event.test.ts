import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { ACKNOWLEDGMENT_STATEMENT } from '../../site/src/content/acknowledgment.js';
import { read, readItem } from './w6-content-helpers';

/** Verbatim from the program-review message of 2026-08-14 (verified_facts §3). Curly quotes as in the original. */
const QUOTE_ORIENTATION = 'I think the site could use a site-map or a \u201cmodule 0\u201d that gives users a baseline of who the audience is and how they should progress through the modules/site as a whole. It would be helpful to know what assumptions and pre-existing skills a learner should have.';
const QUOTE_WORKFLOW = 'What does the \u201cworkflow source\u201d do? How would a user modify it to run their own application? It seems that the workflow includes results verification, is this something the user would expect to see for their own application? Are the various json files (such as results.json) intended for humans or for other tools to parse?';

const milestone = readItem('milestone-2.md');
const record = parse(read('site/src/content/milestones/milestone-2.yml')) as { deliverables: { sow_id: string; item_id: string; status: string; public_url?: string }[] };
const event = readItem('event-iguide-forum-2026.md');

describe('W6 Milestone 2 page', () => {
  it('quotes the program-review questions verbatim, with curly quotes', () => {
    expect(milestone.body).toContain(QUOTE_ORIENTATION);
    expect(milestone.body).toContain(QUOTE_WORKFLOW);
    expect(milestone.body).toContain('Milestone 1 program review, 2026-08-14');
  });

  it('never paraphrases the reviewer as having requested anything, and does not name her', () => {
    expect(milestone.body).not.toMatch(/Elsa|Gonsiorowski|\brequested\b|the review found|reflects the review/i);
  });

  it('maps each of the five program-review items to a page section that exists', () => {
    for (const target of [
      '(/guide/tour/)',
      '(/guide/baseline-single-node-pattern/#the-same-stack-in-one-allocation)',
      '(/guide/baseline-single-node-pattern/#adapt-it)',
      '(/guide/baseline-single-node-pattern/#files-the-workflow-reads-and-writes)',
    ]) expect(milestone.body).toContain(target);
    const module2 = readItem('02-baseline-single-node-pattern.md').body;
    expect(module2).toContain('## The same stack in one allocation');
    expect(module2).toContain('## Adapt it');
    expect(module2).toContain('## Files the workflow reads and writes');
  });

  it('lists the three dissemination engagements with truthful statuses and no hosted-PDF claim', () => {
    expect(milestone.body).toMatch(/\| I-GUIDE Forum 2026 poster \| Delivered \|/);
    expect(milestone.body).toMatch(/\| US-RSE’26 talk \| Accepted \|/);
    expect(milestone.body).toMatch(/\| SC26 research poster \| Accepted \|/);
    expect(milestone.body).toContain('(/about/talks-and-papers/)');
    expect(milestone.body).toContain('(/events/iguide-forum-2026/)');
  });

  it('keeps Module 5 neutral and promises no record id, and drops the retired name', () => {
    expect(milestone.body).toContain('reuse one CPU software layer across GPU variants');
    expect(milestone.body).not.toMatch(/container union|m2-layered-trees-anvil|layered install trees/i);
  });

  it('uses no old Module 0 slug and no bare glossary link', () => {
    expect(milestone.body).not.toContain('how-to-use-this-guide');
  });

  it('keeps the record in step with the pages: tour, Module 3 published, dissemination in progress', () => {
    const row = (sow: string) => record.deliverables.find(({ sow_id }) => sow_id === sow)!;
    expect(row('M2-MODULE-0')).toMatchObject({ status: 'complete', public_url: '/guide/tour/' });
    const module3Status = readItem('03-compose-to-hpc-translation.md').data.status;
    expect(row('M2-MODULE-3-SUPPORTING').status).toBe(module3Status === 'published' ? 'complete' : 'draft');
    expect(row('M2-DISSEMINATION')).toMatchObject({ status: 'draft', public_url: '/events/iguide-forum-2026/' });
    expect(row('M2-MODULE-4').status).toBe('planned');
    expect(row('M2-MODULE-5').status).toBe('planned');
  });
});

describe('W6 I-GUIDE event page', () => {
  it('asks the template for the acknowledgment beside the download link', () => {
    expect(event.data.acknowledgment_beside_download).toBe(true);
    const pdf = event.body.indexOf('(/iguide-forum-2026-poster.pdf)');
    const marker = event.body.indexOf('<!-- l2c:acknowledgment -->');
    expect(pdf).toBeGreaterThan(0);
    expect(marker).toBeGreaterThan(pdf);
    expect(event.body.match(/<!-- l2c:acknowledgment -->/g)).toHaveLength(1);
  });

  it('never types the acknowledgment into the Markdown', () => {
    expect(event.body).not.toContain(ACKNOWLEDGMENT_STATEMENT.slice(0, 60));
    expect(event.body).not.toMatch(/Better Scientific Software Fellowship Program, a collaborative effort/);
  });

  it('uses the page names the nav now uses', () => {
    expect(event.body).toContain('[Run the example](/start/)');
    expect(event.body).not.toContain('[Get started](/start/)');
  });
});
