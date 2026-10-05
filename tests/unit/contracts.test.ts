import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { ACKNOWLEDGMENT_TEXT, ACKNOWLEDGMENT_SHA256, ACKNOWLEDGMENT_STATEMENT, ACKNOWLEDGMENT_DISCLAIMER } from '../../site/src/content/acknowledgment';
import { NAV_ITEMS, TIMELINE_STEPS, DOORS, EVIDENCE_ROW_LABELS, LEARNING_PATH, CONCEPTS, DESIGNED_NOT_RUN, TALKS_LABEL } from '../../site/src/content/contracts';
import { storedChoice, themeAttribute, effectiveTheme } from '../../site/src/content/theme';
import { applicabilityRecordSchema, genericContentItemSchema, talkSchema } from '../../site/src/content/schema';

describe('C0 contracts', () => {
  it('pins the acknowledgment by hash and keeps the footer identical', () => {
    expect(ACKNOWLEDGMENT_TEXT).toBe(`${ACKNOWLEDGMENT_STATEMENT} ${ACKNOWLEDGMENT_DISCLAIMER}`);
    expect(ACKNOWLEDGMENT_TEXT.length).toBe(605);
    expect(createHash('sha256').update(ACKNOWLEDGMENT_TEXT).digest('hex')).toBe(ACKNOWLEDGMENT_SHA256);
    const layout = readFileSync('site/src/layouts/BaseLayout.astro', 'utf8');
    const footer = layout.match(/<p class="acknowledgment">([\s\S]*?)<\/p>/)?.[1]?.replace(/\s+/g, ' ').trim();
    expect(footer).toBe(ACKNOWLEDGMENT_TEXT);
  });

  it('freezes the user-facing model', () => {
    expect(NAV_ITEMS.map((n) => n.label)).toEqual(['Get started', 'Guide', 'Troubleshooting', 'About', 'GitHub (external)']);
    expect(TIMELINE_STEPS.map((s) => s.label)).toEqual(['Get an allocation', 'Start coordinator', 'Readiness gate', 'Run workers', 'Verify results', 'Clean up']);
    expect(DOORS.map((d) => d.href)).toEqual(['/guide/tour/', '/guide/compose-to-hpc-translation/', '/adoption/evaluate/']);
    expect([...EVIDENCE_ROW_LABELS]).toEqual(['Tested', 'You need', 'Depends on your center']);
    expect(CONCEPTS.map((c) => c.mark)).toEqual(['■', '◆', '▲', '●']);
    expect(DESIGNED_NOT_RUN).toBe('Designed, not run');
    expect(LEARNING_PATH).toHaveLength(6);
    expect(TALKS_LABEL).toBe('Talks & papers');
  });

  it('lets generic content items opt in to the acknowledgment beside a download', () => {
    const flag = genericContentItemSchema.shape.acknowledgment_beside_download;
    expect(flag.parse(true)).toBe(true);
    expect(flag.parse(undefined)).toBeUndefined();
    expect(() => flag.parse('yes')).toThrow();
  });

  it('resolves theme precedence: stored choice beats the OS, otherwise follow the OS', () => {
    expect(storedChoice(null)).toBe('system');
    expect(storedChoice('bogus')).toBe('system');
    expect(themeAttribute('dark')).toBe('dark');
    expect(themeAttribute(null)).toBeNull();
    expect(effectiveTheme('light', true)).toBe('light');
    expect(effectiveTheme(null, true)).toBe('dark');
    expect(effectiveTheme(null, false)).toBe('light');
  });

  it('accepts the existing record unchanged and validates talks.yml', () => {
    const record = parse(readFileSync('site/src/content/applicability/m1-baseline-anvil.yml', 'utf8'));
    expect(applicabilityRecordSchema.parse(record).related_evidence).toEqual([]);
    const talks = parse(readFileSync('site/src/content/talks.yml', 'utf8')) as unknown[];
    expect(talks.map((t) => talkSchema.parse(t).id)).toEqual(['usrse26-talk', 'sc26-research-poster', 'iguide-forum-2026-poster']);
    expect(talks.filter((t: any) => t.featured)).toHaveLength(1);
  });

  it('derives the release version from env, then the newest release candidate', async () => {
    const { currentReleaseVersion } = await import('../../site/src/content/release');
    const saved = process.env.RELEASE_VERSION;
    process.env.RELEASE_VERSION = 'v9.9.9';
    expect(currentReleaseVersion('.')).toBe('v9.9.9');
    delete process.env.RELEASE_VERSION;
    expect(currentReleaseVersion('.')).toBe('v0.2.0');
    if (saved !== undefined) process.env.RELEASE_VERSION = saved;
  });
});
