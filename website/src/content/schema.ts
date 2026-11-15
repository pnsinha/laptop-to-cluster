/* Schemas for the records the site loads: applicability (test) records, talks and the update feed. */
import { z } from 'astro/zod';

export const CANONICAL_ORIGIN = 'https://laptop-to-cluster.org' as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'must be a real date');
const nonEmpty = z.string().trim().min(1);
const path = z.string().regex(/^\/(?:[^?#]*\/)?$/, 'must be an origin-relative trailing-slash path');
const stableRouteId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be an immutable kebab-case route ID');
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/i, 'must be sha256:<64 hexadecimal characters>');

export const evidenceReferenceSchema = z.object({
  id: nonEmpty,
  path: z.string().regex(/^(?:evidence|releases|site\/public\/evidence)\/[A-Za-z0-9._/-]+$/, 'must be a repository evidence path under evidence/ or releases/'),
  integrity: sha256,
  label: nonEmpty.optional(),
}).strict();
export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;

export const repoRefSchema = z.object({
  repository: z.url(),
  release: nonEmpty,
  path: z.string().min(1),
  line_anchor: z.string().regex(/^#L\d+(?:-L\d+)?$/, 'must use #L<n> or #L<n>-L<n>').optional(),
  integrity: sha256,
}).strict();
export type RepoRef = z.infer<typeof repoRefSchema>;

const traceRef = z.string().regex(/^(?:assumptions|portability_boundaries|limitations|result\.checks|related_evidence)(?:\.\d+)?$/, 'must reference a record list (optionally .<index>)');
export const plainLanguageItemSchema = z.object({ text: nonEmpty, from: z.array(traceRef).min(1) }).strict();
export const plainLanguageSchema = z.object({
  tested: plainLanguageItemSchema,
  you_need: z.array(plainLanguageItemSchema).min(1),
  depends_on_center: z.array(plainLanguageItemSchema).min(1),
}).strict();
export const relatedEvidenceSchema = z.object({ ...evidenceReferenceSchema.shape, role: z.literal('negative-test') }).strict();
export const reviewExtensionSchema = z.object({ reviewed_by: nonEmpty, reviewed_on: isoDate, review_by: isoDate, scope_note: nonEmpty }).strict();

export const applicabilityRecordSchema = z.object({
  id: stableRouteId,
  workflow_id: nonEmpty,
  status: z.enum(['validated', 'failed', 'unvalidated', 'stale']),
  environment: z.object({
    public_name: z.enum(['Purdue Anvil', 'SDSC Expanse']), fallback: z.boolean(), notes: nonEmpty,
  }).strict(),
  scheduler: z.object({ family: nonEmpty, version: nonEmpty }).strict(),
  runtime: z.object({ name: nonEmpty, version: nonEmpty }).strict(),
  secondary_runtime: z.object({ name: nonEmpty, version: nonEmpty }).strict().optional(),
  container_digest: sha256,
  workflow_revision: z.string().regex(/^(?:[a-f0-9]{40}|v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?)$/i),
  validation_date: isoDate,
  execution_date: isoDate,
  submission_id: nonEmpty,
  result: z.object({ terminal_state: nonEmpty, exit_code: z.number().int(), checks: z.array(nonEmpty).min(1) }).strict(),
  assumptions: z.array(nonEmpty).min(1),
  limitations: z.array(nonEmpty).min(1),
  portability_boundaries: z.array(nonEmpty).min(1),
  evidence: evidenceReferenceSchema,
  provenance: z.array(z.object({ label: nonEmpty, reference: repoRefSchema }).strict()).min(1),
  review_after: isoDate,
  plain_language: plainLanguageSchema.optional(),
  related_evidence: z.array(relatedEvidenceSchema).default([]),
  superseded_by: stableRouteId.optional(),
  review_extension: reviewExtensionSchema.optional(),
}).strict().superRefine((record, context) => {
  const issue = (path: string, message: string) => context.addIssue({ code: 'custom', path: [path], message });
  if (record.environment.public_name === 'Purdue Anvil' && record.environment.fallback) issue('environment.fallback', 'Purdue Anvil is the primary environment');
  if (record.environment.public_name === 'SDSC Expanse' && !record.environment.fallback) issue('environment.fallback', 'SDSC Expanse must be explicitly marked fallback');
  if (record.execution_date > record.validation_date) issue('validation_date', 'cannot precede execution_date');
  if (record.validation_date > record.review_after) issue('review_after', 'cannot precede validation_date');
  if (record.status === 'validated' && (record.result.terminal_state !== 'COMPLETED' || record.result.exit_code !== 0)) {
    issue('result', 'validated evidence requires terminal COMPLETED and exit code 0');
  }
  if (record.status === 'failed' && record.result.exit_code === 0) issue('result.exit_code', 'failed evidence requires a nonzero exit code');
  if (record.status === 'unvalidated' && record.result.terminal_state === 'COMPLETED' && record.result.exit_code === 0) {
    issue('result', 'unvalidated status cannot contain a successful representative result');
  }
  const listLengths: Record<string, number> = {
    assumptions: record.assumptions.length,
    portability_boundaries: record.portability_boundaries.length,
    limitations: record.limitations.length,
    'result.checks': record.result.checks.length,
    related_evidence: record.related_evidence.length,
  };
  if (record.plain_language) {
    const covered = new Set<string>();
    const items = [
      { path: 'plain_language.tested', item: record.plain_language.tested },
      ...record.plain_language.you_need.map((item, index) => ({ path: `plain_language.you_need.${index}`, item })),
      ...record.plain_language.depends_on_center.map((item, index) => ({ path: `plain_language.depends_on_center.${index}`, item })),
    ];
    if (!record.plain_language.tested.from.some((reference) => /^result\.checks(?:\.\d+)?$/.test(reference))) {
      issue('plain_language.tested.from', 'must cite result.checks');
    }
    for (const { path, item } of items) {
      for (const reference of item.from) {
        const [, list, position] = /^(.+?)(?:\.(\d+))?$/.exec(reference) ?? [];
        const length = listLengths[list] ?? 0;
        const indices = position === undefined ? [...Array(length).keys()] : [Number(position)];
        if (length === 0 || indices.some((index) => index >= length)) {
          issue(`${path}.from`, `${reference} does not resolve to an existing ${list} entry`);
          continue;
        }
        for (const index of indices) covered.add(`${list}.${index}`);
      }
    }
    for (const list of ['assumptions', 'portability_boundaries'] as const) {
      record[list].forEach((_, index) => {
        if (!covered.has(`${list}.${index}`)) issue('plain_language', `${list}.${index} is not covered by any plain-language item`);
      });
    }
  }
  const relatedIds = new Set<string>();
  for (const [index, related] of record.related_evidence.entries()) {
    if (related.id === record.evidence.id || related.path === record.evidence.path) {
      issue(`related_evidence.${index}`, 'must differ from the primary evidence reference');
    }
    if (relatedIds.has(related.id)) issue(`related_evidence.${index}.id`, `duplicate related evidence ${related.id}`);
    relatedIds.add(related.id);
  }
  if (record.superseded_by === record.id) issue('superseded_by', 'a record cannot supersede itself');
  if (record.review_extension && record.review_extension.review_by <= record.review_after) {
    issue('review_extension.review_by', 'must be later than review_after');
  }
});
export type ApplicabilityRecord = z.infer<typeof applicabilityRecordSchema>;

export const talkSchema = z.object({
  id: stableRouteId,
  kind: z.enum(['talk', 'poster', 'paper']),
  title: nonEmpty,
  venue: nonEmpty,
  event_date: isoDate,
  location: nonEmpty.optional(),
  featured: z.boolean().default(false),
  links: z.array(z.object({ label: nonEmpty, href: z.union([z.url(), path]) }).strict()).min(1),
}).strict();
export type Talk = z.infer<typeof talkSchema>;

/* One feed item: a page path, optionally with a fragment, its date and, for an item that is a
   section of a page rather than the page itself, its own title. */
export const feedEntrySchema = z.object({
  link: z.string().regex(/^\/(?:[^?#]*\/)?(?:#[a-z0-9-]+)?$/, 'must be an origin-relative path, optionally with a fragment'),
  date: isoDate,
  title: nonEmpty.optional(),
}).strict();
export type FeedEntry = z.infer<typeof feedEntrySchema>;
