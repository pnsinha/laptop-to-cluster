import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const page = readFileSync(fileURLToPath(new URL('../../site/dist/about/attribution/index.html', import.meta.url)), 'utf8');

describe('the attribution page names the fellowship mentor', () => {
  it('links the mentor, kept apart from the funds-administration sentence', () => {
    expect(page).toContain('<strong>BSSw Fellowship mentor:</strong>');
    expect(page).toMatch(/<a href="https:\/\/www\.paratools\.com\/" rel="external">Sameer Shende<\/a>, Research Professor and Director of the Performance Research Laboratory, University of Oregon, and President of ParaTools, Inc\./);
    const mentor = page.indexOf('BSSw Fellowship mentor:');
    const funds = page.indexOf('Funds administration:');
    expect(mentor).toBeGreaterThan(-1);
    expect(funds).toBeGreaterThan(mentor);
  });
});
