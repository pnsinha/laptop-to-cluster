import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  ATTRIBUTION, MODULE_TYPE_LABELS, PROJECT, RECORD_LINK_TEXT,
  evidenceBadgeContext, evidenceBadgeLabel, evidenceStatusText, moduleHeaderLine, type EvidenceRecordStatus,
} from '../../site/src/content/wording.js';
import { escapeHtml, inlineCodeHtml } from '../../site/src/content/inline-code.js';
import { eventBandLead } from '../../site/src/content/home.js';
import { read, readItem } from './w6-content-helpers';

/* A straight apostrophe between two letters is a contraction or possessive typed
   without Markdown's smart quotes: it must be written as U+2019 in strings that
   skip Markdown (front matter, YAML data, TypeScript constants). */
const STRAIGHT_APOSTROPHE = /[A-Za-z]'[A-Za-z]/;

const stringValues = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringValues);
  return [];
};
const offenders = (values: string[]): string[] => values.filter((value) => STRAIGHT_APOSTROPHE.test(value));

describe('typographic apostrophes in rendered prose fields', () => {
  it('wording.ts: attribution, project and evidence wording (the acknowledgment is not part of it)', () => {
    const statuses: EvidenceRecordStatus[] = ['validated', 'stale', 'failed', 'unvalidated'];
    const wording = [
      ...stringValues(ATTRIBUTION), ...stringValues(PROJECT), ...stringValues(MODULE_TYPE_LABELS), RECORD_LINK_TEXT,
      ...statuses.flatMap((status) => [evidenceStatusText(status, 'Env', 'Oct 2026'), evidenceBadgeLabel(status), evidenceBadgeContext(status, 'Env', 'Oct 2026') ?? '']),
      moduleHeaderLine({ module_number: 2, module_type: 'runnable', estimated_minutes: 30 }),
    ];
    expect(offenders(wording)).toEqual([]);
    expect(ATTRIBUTION.funds).toContain('the author’s employer');
  });

  it('talks.yml', () => {
    const talks = parse(read('site/src/content/talks.yml')) as Array<{ venue: string }>;
    expect(offenders(stringValues(talks))).toEqual([]);
    expect(talks[0].venue).toBe('US-RSE’26');
  });

  it('the Module 2 test record: lists copied from the evidence stay byte-identical, every other prose field is typographic', () => {
    const record = parse(read('site/src/content/applicability/m2-baseline-anvil-2026-10.yml')) as Record<string, unknown>;
    const manifest = JSON.parse(read('evidence/anvil-baseline-20261007-success/manifest.json')) as Record<string, unknown>;
    // Evidence fidelity beats typography: these lists repeat the hash-pinned manifest word for word.
    const mirrored = { assumptions: 'assumptions', limitations: 'limitations', portability_boundaries: 'portabilityBoundaries' } as const;
    for (const [field, key] of Object.entries(mirrored)) expect(record[field], field).toEqual(manifest[key]);
    const prose = Object.fromEntries(Object.entries(record).filter(([field]) => !(field in mirrored)));
    expect(offenders(stringValues(prose))).toEqual([]);
  });

  it('Module 2 front matter', () => {
    expect(offenders(stringValues(readItem('02-baseline-single-node-pattern.md').data))).toEqual([]);
  });

  it('the project attribution record matches wording.ts byte for byte', () => {
    const record = parse(read('site/src/content/attribution/project.yml')) as { funds_administrator: string };
    expect(record.funds_administrator).toBe(ATTRIBUTION.funds);
  });
});

describe('one visible form of the US-RSE venue', () => {
  it('writes US-RSE’26 whichever way the venue was typed', () => {
    for (const venue of ["US-RSE'26", "US-RSE '26", 'US-RSE’26', 'US-RSE ’26']) {
      expect(eventBandLead({ kind: 'talk', venue, event_date: '2026-10-20' })).toBe('Talk at US-RSE’26 (Tue Oct 20)');
    }
  });
});

describe('inlineCodeHtml', () => {
  it('turns each backtick pair into <code> and escapes everything else', () => {
    expect(inlineCodeHtml('Run `command -v apptainer` and record `apptainer --version`'))
      .toBe('Run <code>command -v apptainer</code> and record <code>apptainer --version</code>');
    expect(inlineCodeHtml('Use <b> & "quotes" with `a < b`')).toBe('Use &lt;b&gt; &amp; &quot;quotes&quot; with <code>a &lt; b</code>');
  });

  it('leaves a string without backticks as the escaped text, and an unpaired backtick as written', () => {
    expect(inlineCodeHtml('Plain text, no commands')).toBe('Plain text, no commands');
    expect(inlineCodeHtml('One ` only')).toBe('One ` only');
    expect(inlineCodeHtml('A `` empty pair')).toBe('A `` empty pair');
    expect(escapeHtml(`it's`)).toBe('it&#39;s');
  });
});
