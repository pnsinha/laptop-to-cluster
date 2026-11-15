import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateFrozenPublicationWorkflow } from '../../scripts/publication.mjs';

const wf = (ref: string | null) =>
  `on:\n  push:\n    tags: ['v0.1.0']\njobs:\n  build:\n    steps:\n      - uses: actions/checkout@v4\n${ref === null ? '' : `        with:\n          ref: ${ref}\n`}      - run: echo ok\n`;

describe('frozen publication pin', () => {
  it.each(['refs/tags/v0.1.0', 'v0.1.0'])('accepts ref: %s', (ref) => {
    expect(validateFrozenPublicationWorkflow(wf(ref))).toEqual([]);
  });
  it.each(['refs/heads/v0.1.0', 'v0.2.0', 'main', 'v0.1.0-rc', 'refs/tags/v0.1.0-rc'])('rejects ref: %s', (ref) => {
    expect(validateFrozenPublicationWorkflow(wf(ref)).join('\n')).toMatch(/FROZEN-RELEASE.*pinned/);
  });
  it('rejects a checkout with no ref', () => {
    expect(validateFrozenPublicationWorkflow(wf(null)).join('\n')).toMatch(/FROZEN-RELEASE.*pinned/);
  });
  it('accepts the real publication workflow', () => {
    expect(validateFrozenPublicationWorkflow(readFileSync('.github/workflows/publication.yml', 'utf8'))).toEqual([]);
  });
});
