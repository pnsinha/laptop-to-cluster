import { z } from 'astro/zod';

export const CANONICAL_ORIGIN = 'https://laptop-to-cluster.org' as const;
export const releaseGates = ['m1', 'm2', 'm3', 'v1.0'] as const;
export type ReleaseGate = (typeof releaseGates)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'must be a real date');
const nonEmpty = z.string().trim().min(1);
const path = z.string().regex(/^\/(?:[^?#]*\/)?$/, 'must be an origin-relative trailing-slash path');
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/i, 'must be sha256:<64 hexadecimal characters>');

export const maturitySchema = z.enum(['draft', 'validated', 'published', 'superseded', 'archived']);
export type Maturity = z.infer<typeof maturitySchema>;
export const artifactTypeSchema = z.enum([
  'learning-module', 'guidance-note', 'template', 'training-package', 'event-assets',
  'checklist', 'milestone', 'feedback', 'release', 'diagnostic', 'report', 'news',
  'support', 'contribution', 'attribution', 'accessibility', 'maintenance',
]);
export type ArtifactType = z.infer<typeof artifactTypeSchema>;

export const evidenceReferenceSchema = z.object({
  id: nonEmpty,
  path: z.string().regex(/^(?:evidence|site\/public\/evidence)\/[A-Za-z0-9._/-]+$/, 'must be a repository evidence path'),
  integrity: sha256,
  label: nonEmpty.optional(),
}).strict();
export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;

export const repoRefSchema = z.object({
  repository: z.string().url(),
  release: nonEmpty,
  path: z.string().min(1),
  line_anchor: z.string().regex(/^#L\d+(?:-L\d+)?$/, 'must use #L<n> or #L<n>-L<n>').optional(),
  integrity: sha256,
}).strict();
export type RepoRef = z.infer<typeof repoRefSchema>;

export const authorityReferenceSchema = z.object({
  kind: z.enum(['sow', 'official-guidance', 'inferred-practice', 'project-decision']),
  citation: nonEmpty,
  scope: nonEmpty,
}).strict();

export const prerequisiteSchema = z.object({
  id: nonEmpty,
  check: nonEmpty.optional(),
  diagnostic_id: nonEmpty.optional(),
}).strict();

export const revisionSchema = z.object({
  date: isoDate,
  summary: nonEmpty,
  evidence: evidenceReferenceSchema,
}).strict();

export const routeNamespaceSchema = z.enum([
  'guide', 'start', 'diagnostics', 'milestones', 'training', 'events', 'adoption',
  'feedback', 'releases', 'about', 'resources',
]);

const commonFields = {
  id: nonEmpty,
  stable_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be an immutable kebab-case slug'),
  route_namespace: routeNamespaceSchema.optional(),
  title: nonEmpty,
  summary: nonEmpty,
  description: nonEmpty.optional(),
  topics: z.array(nonEmpty).min(1),
  keywords: z.array(nonEmpty).min(1),
  audiences: z.array(nonEmpty).min(1),
  milestone: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  status: maturitySchema,
  publication_date: isoDate.optional(),
  last_reviewed: isoDate.optional(),
  responsible_maintainer: nonEmpty.optional(),
  applicable_release: nonEmpty.optional(),
  supporting_artifacts: z.array(repoRefSchema).default([]),
  schedulers: z.array(z.enum(['slurm', 'pbs-family', 'other'])).default([]),
  container_runtimes: z.array(z.enum(['apptainer', 'charliecloud', 'other'])).default([]),
  related: z.array(nonEmpty).default([]),
  applicability_records: z.array(nonEmpty).default([]),
  authority: z.array(authorityReferenceSchema).default([]),
  release_introduced: nonEmpty.optional(),
  release_superseded: nonEmpty.optional(),
  successor_id: nonEmpty.optional(),
  last_updated: isoDate.optional(),
  sow_deliverable_id: nonEmpty.optional(),
  deliverable_status: z.enum(['planned', 'draft', 'complete', 'externally-pending']).optional(),
  completion_evidence: evidenceReferenceSchema.optional(),
  revisions: z.array(revisionSchema).default([]),
  learning_stage: z.enum(['baseline', 'portability', 'training', 'operations', 'adoption']).optional(),
};

const genericArtifactType = z.enum([
  'guidance-note', 'template', 'training-package', 'event-assets', 'checklist', 'milestone',
  'feedback', 'release', 'diagnostic', 'report', 'news', 'support', 'contribution',
  'attribution', 'accessibility', 'maintenance',
]);

export const genericContentItemSchema = z.object({
  ...commonFields,
  artifact_type: genericArtifactType,
}).strict();

export const learningModuleSchema = z.object({
  ...commonFields,
  artifact_type: z.literal('learning-module'),
  module_number: z.number().int().positive(),
  module_type: z.enum(['conceptual', 'runnable', 'hybrid']),
  learning_outcomes: z.array(nonEmpty).min(1),
  prerequisites: z.array(prerequisiteSchema),
  section_kinds: z.array(z.enum(['concept', 'procedure', 'expected-result', 'limitations', 'next-steps'])).default([]),
  required_resources: z.array(nonEmpty).optional(),
  estimated_minutes: z.number().int().positive().optional(),
  completion_check: z.object({
    kind: z.enum(['result', 'review-question', 'mapping-checklist', 'decision-exercise']),
    text: nonEmpty,
  }).strict().optional(),
  validation_status: z.enum(['validated', 'failed', 'unvalidated', 'stale']).optional(),
  validation_date: isoDate.optional(),
  unvalidated_scopes: z.array(z.object({ anchor: nonEmpty, reason: nonEmpty }).strict()).default([]),
}).strict();

export const contentItemSchema = z.discriminatedUnion('artifact_type', [
  learningModuleSchema,
  genericContentItemSchema,
]).superRefine((item, context) => {
  if (['published', 'superseded', 'archived'].includes(item.status) && !item.publication_date) {
    context.addIssue({ code: 'custom', path: ['publication_date'], message: 'is required for published content' });
  }
  if (item.status === 'superseded' && !item.successor_id && item.revisions.length === 0) {
    context.addIssue({ code: 'custom', path: ['successor_id'], message: 'or an archived replacement revision is required' });
  }
  if (item.artifact_type === 'learning-module' && ['runnable', 'hybrid'].includes(item.module_type)) {
    for (const field of ['validation_status', 'validation_date'] as const) {
      if (!item[field]) context.addIssue({ code: 'custom', path: [field], message: 'is required for runnable workflows' });
    }
    if (item.applicability_records.length === 0) {
      context.addIssue({ code: 'custom', path: ['applicability_records'], message: 'requires at least one record for runnable workflows' });
    }
  }
});
export type ContentItem = z.infer<typeof contentItemSchema>;

export const applicabilityRecordSchema = z.object({
  id: nonEmpty,
  workflow_id: nonEmpty,
  status: z.enum(['validated', 'failed', 'unvalidated', 'stale']),
  environment: z.object({ public_name: nonEmpty, fallback: z.boolean(), notes: nonEmpty }).strict(),
  scheduler: z.object({ family: nonEmpty, version: nonEmpty }).strict(),
  runtime: z.object({ name: nonEmpty, version: nonEmpty }).strict(),
  container_digest: sha256,
  workflow_revision: z.string().regex(/^(?:[a-f0-9]{40}|v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?)$/i),
  execution_date: isoDate,
  submission_id: nonEmpty,
  result: z.object({ terminal_state: nonEmpty, exit_code: z.number().int(), checks: z.array(nonEmpty) }).strict(),
  assumptions: z.array(nonEmpty),
  limitations: z.array(nonEmpty),
  portability_boundaries: z.array(nonEmpty),
  evidence: evidenceReferenceSchema,
  review_after: isoDate,
}).strict();
export type ApplicabilityRecord = z.infer<typeof applicabilityRecordSchema>;

export const releaseChangeSchema = z.object({
  class: z.enum(['added', 'changed', 'deprecated', 'corrected']),
  item_id: nonEmpty,
  material: z.boolean().default(false),
  reason: nonEmpty.optional(),
  affected_environments: z.array(nonEmpty).default([]),
  migration: nonEmpty.optional(),
}).strict().superRefine((change, context) => {
  if (change.class === 'changed' && change.material) {
    for (const field of ['reason', 'migration'] as const) {
      if (!change[field]) context.addIssue({ code: 'custom', path: [field], message: 'is required for a material change' });
    }
    if (change.affected_environments.length === 0) {
      context.addIssue({ code: 'custom', path: ['affected_environments'], message: 'is required for a material change' });
    }
  }
});