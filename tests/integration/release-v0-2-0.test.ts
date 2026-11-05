import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/* The v0.2.0 release as built: what the release promised is on the pages. Needs a built site:
   `npm run build` first. */
const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = `${root}/site/dist`;
const candidate = JSON.parse(readFileSync(`${root}/releases/v0.2.0/release-candidate.json`, 'utf8'));
const read = (path: string) => readFileSync(`${dist}/${path}`, 'utf8');
beforeAll(() => { if (!existsSync(`${dist}/index.html`)) throw new Error('site/dist is missing: run `npm run build` first'); });

describe('release v0.2.0 as built', () => {
  it('renders the release inside Milestone 2 under the frozen anchor, exactly once', () => {
    const milestone = read('milestones/2/index.html');
    expect(milestone.match(/id="release-v0-2-0"/g)).toHaveLength(1);
    expect(milestone.match(/<section class="release-notes" id="release-v0-2-0"/g)).toHaveLength(1);
  });

  it('creates no standalone release page and lists none in the URL manifest', () => {
    expect(existsSync(`${dist}/releases/v0-2-0`)).toBe(false);
    expect(read('url-manifest.json')).not.toContain('/releases/v0-2-0/');
  });

  it('builds every page the candidate record advertises', () => {
    for (const url of candidate.publicSiteUrls as string[]) {
      const path = new URL(url).pathname;
      expect(existsSync(`${dist}${path}index.html`), path).toBe(true);
    }
  });

  it('links the candidate version from the footer when RELEASE_VERSION is unset or equal', () => {
    expect(read('index.html')).toMatch(new RegExp(`<a href="/milestones/2/#release-v0-2-0">Release ${candidate.version.replace(/\\./g, '\\\\.')}</a>`));
  });
});
