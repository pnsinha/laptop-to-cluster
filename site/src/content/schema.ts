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

export const authorityReferenceSchema = z.object({
  kind: z.enum(['sow', 'official-guidance', 'inferred-practice', 'project-decision']),
  citation: nonEmpty,
  scope: nonEmpty,
}).strict();

export const prerequisiteSchema = z.object({
  id: nonEmpty,
  check: nonEmpty.optional(),
  diagnostic_id: z.string().regex(/^BSSW-[A-Z0-9-]+$/, 'must be a stable BSSW-* diagnostic ID').optional(),
}).strict();

const informativeImageSchema = z.object({
  kind: z.literal('image'), purpose: z.literal('informative'), src: nonEmpty,
  alt: z.string().trim().min(8, 'must provide an equivalent informative text alternative'),
}).strict().superRefine((media, context) => {
  if (/^(?:image|diagram|photo|graphic|figure|file|todo|tbd)(?:\.|$)/i.test(media.alt)) {
    context.addIssue({ code: 'custom', path: ['alt'], message: 'must describe meaning, not merely name the media type' });
  }
});
const decorativeImageSchema = z.object({
  kind: z.literal('image'), purpose: z.literal('decorative'), src: nonEmpty, alt: z.literal(''),
}).strict();
const prerecordedMediaSchema = z.object({
  kind: z.enum(['audio', 'video']), src: nonEmpty, prerecorded: z.literal(true),
  captions: nonEmpty.optional(), transcript: nonEmpty.optional(),
}).strict().superRefine((media, context) => {
  if (media.kind === 'audio' && !media.transcript) context.addIssue({ code: 'custom', path: ['transcript'], message: 'is required for prerecorded audio' });
  if (media.kind === 'video' && !media.captions && !media.transcript) context.addIssue({ code: 'custom', path: ['captions'], message: 'captions or a transcript is required for prerecorded video' });
});
export const publicationMediaSchema = z.discriminatedUnion('kind', [
  z.discriminatedUnion('purpose', [informativeImageSchema, decorativeImageSchema]), prerecordedMediaSchema,
]);

export const revisionSchema = z.object({ date: isoDate, summary: nonEmpty, evidence: evidenceReferenceSchema }).strict();
export const routeNamespaceSchema = z.enum([
  'guide', 'start', 'diagnostics', 'milestones', 'training', 'events', 'adoption',
  'feedback', 'releases', 'about', 'resources',
]);

const commonFields = {
  id: nonEmpty,
  stable_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be an immutable kebab-case slug'),
  route_namespace: routeNamespaceSchema.optional(), title: nonEmpty, summary: nonEmpty, description: nonEmpty.optional(),
  topics: z.array(nonEmpty).min(1), keywords: z.array(nonEmpty).min(1), audiences: z.array(nonEmpty).min(1),
  milestone: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), status: maturitySchema,
  publication_date: isoDate.optional(), last_reviewed: isoDate.optional(), responsible_maintainer: nonEmpty.optional(),
  applicable_release: nonEmpty.optional(), supporting_artifacts: z.array(repoRefSchema).default([]),
  schedulers: z.array(z.enum(['slurm', 'pbs-family', 'other'])).default([]),
  container_runtimes: z.array(z.enum(['apptainer', 'charliecloud', 'other'])).default([]),
  related: z.array(nonEmpty).default([]), applicability_records: z.array(nonEmpty).default([]),
  authority: z.array(authorityReferenceSchema).default([]), media: z.array(publicationMediaSchema).default([]),
  release_introduced: nonEmpty.optional(), release_superseded: nonEmpty.optional(), successor_id: nonEmpty.optional(),
  last_updated: isoDate.optional(), sow_deliverable_id: nonEmpty.optional(),
  deliverable_status: z.enum(['planned', 'draft', 'complete', 'externally-pending']).optional(),
  completion_evidence: evidenceReferenceSchema.optional(), revisions: z.array(revisionSchema).default([]),
  learning_stage: z.enum(['baseline', 'portability', 'training', 'operations', 'adoption']).optional(),
};

const genericArtifactType = z.enum([
  'guidance-note', 'template', 'training-package', 'event-assets', 'checklist', 'milestone',
  'feedback', 'release', 'diagnostic', 'report', 'news', 'support', 'contribution',
  'attribution', 'accessibility', 'maintenance',
]);
export const genericContentItemSchema = z.object({ ...commonFields, artifact_type: genericArtifactType }).strict();

const completionCheckSchema = z.object({
  kind: z.enum(['result', 'review-question', 'mapping-checklist', 'decision-exercise']), text: nonEmpty,
}).strict();
export const learningModuleSchema = z.object({
  ...commonFields, artifact_type: z.literal('learning-module'), module_number: z.number().int().positive(),
  module_type: z.enum(['conceptual', 'runnable', 'hybrid']), learning_outcomes: z.array(nonEmpty).min(1),
  prerequisites: z.array(prerequisiteSchema),
  section_kinds: z.array(z.enum(['concept', 'procedure', 'expected-result', 'limitations', 'next-steps'])).default([]),
  required_resources: z.array(nonEmpty).optional(), estimated_minutes: z.number().int().positive().optional(),
  completion_check: completionCheckSchema.optional(), conceptual_check: completionCheckSchema.optional(),
  validation_status: z.enum(['validated', 'failed', 'unvalidated', 'stale']).optional(), validation_date: isoDate.optional(),
  unvalidated_scopes: z.array(z.object({ anchor: nonEmpty, reason: nonEmpty }).strict()).default([]),
}).strict();

export const contentItemSchema = z.discriminatedUnion('artifact_type', [learningModuleSchema, genericContentItemSchema])
  .superRefine((item, context) => {
    const issue = (path: string, message: string) => context.addIssue({ code: 'custom', path: [path], message });
    if (['published', 'superseded', 'archived'].includes(item.status) && !item.publication_date) issue('publication_date', 'is required for published content');
    if (item.status === 'superseded' && !item.successor_id && item.revisions.length === 0) issue('successor_id', 'or an archived replacement revision is required');
    if (item.artifact_type !== 'learning-module') return;
    for (const section of ['concept', 'limitations', 'next-steps'] as const) {
      if (!item.section_kinds.includes(section)) issue('section_kinds', `must include ${section}`);
    }
    const runnable = ['runnable', 'hybrid'].includes(item.module_type);
    const conceptual = ['conceptual', 'hybrid'].includes(item.module_type);
    if (runnable) {
      for (const section of ['procedure', 'expected-result'] as const) if (!item.section_kinds.includes(section)) issue('section_kinds', `must include ${section}`);
      if (!item.required_resources?.length) issue('required_resources', 'is required for runnable workflows');
      if (!item.estimated_minutes) issue('estimated_minutes', 'is required for runnable workflows');
      if (item.completion_check?.kind !== 'result') issue('completion_check', 'must be a result check for runnable workflows');
      if (!item.validation_status) issue('validation_status', 'is required for runnable workflows');
      if (!item.validation_date) issue('validation_date', 'is required for runnable workflows');
      if (item.applicability_records.length === 0) issue('applicability_records', 'requires at least one record for runnable workflows');
      for (const [index, prerequisite] of item.prerequisites.entries()) {
        if (prerequisite.check && !prerequisite.diagnostic_id) issue(`prerequisites.${index}.diagnostic_id`, 'is required for an executable prerequisite check');
      }
    }
    const conceptualCheck = item.module_type === 'hybrid' ? item.conceptual_check : item.completion_check;
    if (conceptual && !conceptualCheck) issue(item.module_type === 'hybrid' ? 'conceptual_check' : 'completion_check', 'is required for conceptual guidance');
    if (conceptual && conceptualCheck?.kind === 'result') issue('conceptual_check', 'must be a review question, mapping checklist, or decision exercise');
  });
export type ContentItem = z.infer<typeof contentItemSchema>;

export const applicabilityRecordSchema = z.object({
  id: nonEmpty,
  workflow_id: nonEmpty,
  status: z.enum(['validated', 'failed', 'unvalidated', 'stale']),
  environment: z.object({
    public_name: z.enum(['Purdue Anvil', 'SDSC Expanse']), fallback: z.boolean(), notes: nonEmpty,
  }).strict(),
  scheduler: z.object({ family: nonEmpty, version: nonEmpty }).strict(),
  runtime: z.object({ name: nonEmpty, version: nonEmpty }).strict(),
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
  review_after: isoDate,
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
});
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

export const releaseRecordSchema = z.object({
  id: nonEmpty,
  version: z.string().regex(/^v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/),
  published_at: isoDate,
  site_commit: z.string().regex(/^[a-f0-9]{40}$/i),
  repository: repoRefSchema,
  url_manifest_sha256: sha256,
  site_artifact_sha256: sha256,
  artifact_file_manifest_sha256: sha256,
  cloudflare_deployment_id: nonEmpty,
  pages_dev_fallback_url: z.url().refine((value) => /^https:\/\/[^/]+\.pages\.dev\/?$/.test(value)),
  canonical_origin: z.literal(CANONICAL_ORIGIN),
  evidence_ids: z.array(nonEmpty),
  changes: z.array(releaseChangeSchema),
}).strict();
export type ReleaseRecord = z.infer<typeof releaseRecordSchema>;

export const redirectRecordSchema = z.object({
  id: nonEmpty,
  from: path,
  to: path,
  reason: z.enum(['moved', 'superseded', 'archived']),
  active_from: isoDate,
}).strict();
export type RedirectRecord = z.infer<typeof redirectRecordSchema>;

export const milestoneDeliverableSchema = z.object({
  sow_id: nonEmpty,
  item_id: nonEmpty,
  status: z.enum(['planned', 'draft', 'complete', 'externally-pending']),
  public_url: path,
  completion_evidence: evidenceReferenceSchema.optional(),
  revisions: z.array(revisionSchema).default([]),
}).strict();
export const milestoneRecordSchema = z.object({
  id: nonEmpty,
  number: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  due_date: isoDate,
  deliverables: z.array(milestoneDeliverableSchema),
}).strict();
export type MilestoneRecord = z.infer<typeof milestoneRecordSchema>;

export const feedbackRecordSchema = z.object({
  id: nonEmpty,
  themes: z.array(nonEmpty),
  decisions: z.array(nonEmpty),
  revisions: z.array(nonEmpty),
  dispositions: z.array(z.object({ theme: nonEmpty, disposition: nonEmpty, rationale: nonEmpty }).strict()),
  attribution_approved: z.boolean(),
}).strict();

const placeholderApproval = /\b(?:tbd|todo|placeholder|to be approved|pending approval|lorem ipsum)\b/i;
export const attributionSchema = z.object({
  id: nonEmpty,
  author: nonEmpty,
  fellowship_role: nonEmpty,
  professional_affiliation: nonEmpty,
  funds_administrator: nonEmpty,
  sponsors: z.array(nonEmpty).min(1),
  non_endorsement: nonEmpty,
  licenses: z.array(z.object({ scope: nonEmpty, license: nonEmpty }).strict()).min(1),
  contributors: z.array(z.object({ name: nonEmpty, role: nonEmpty, funding_scope: nonEmpty.optional() }).strict()).default([]),
}).strict().superRefine((record, context) => {
  for (const [field, value] of Object.entries(record)) {
    const values = Array.isArray(value) ? value.flatMap((entry) => typeof entry === 'string' ? [entry] : Object.values(entry)) : [value];
    if (values.some((entry) => typeof entry === 'string' && placeholderApproval.test(entry))) {
      context.addIssue({ code: 'custom', path: [field], message: 'contains unapproved placeholder wording' });
    }
  }
});

export const evidenceManifestReferenceSchema = z.object({
  id: nonEmpty,
  manifest: evidenceReferenceSchema,
  workflow_revision: nonEmpty,
  release_candidate: nonEmpty,
  execution_date: isoDate,
}).strict();

export function isTechnicalContent(item: ContentItem): boolean {
  return item.schedulers.length > 0 || item.container_runtimes.length > 0 || item.applicability_records.length > 0
    || (item.artifact_type === 'learning-module' && ['runnable', 'hybrid'].includes(item.module_type));
}

export function releaseGateIssues(item: ContentItem, gate: ReleaseGate): string[] {
  const issues: string[] = [];
  const requireField = (field: keyof ContentItem, condition = true) => {
    if (condition && (item[field] === undefined || item[field] === '')) issues.push(`${item.id}.${String(field)} is required at ${gate}`);
  };
  const technicalPublished = isTechnicalContent(item) && ['validated', 'published'].includes(item.status);
  if (gate !== 'm1') requireField('last_reviewed', technicalPublished);
  if (gate === 'm3' || gate === 'v1.0') requireField('responsible_maintainer', item.status === 'published');
  if (gate === 'v1.0') {
    requireField('description');
    requireField('last_reviewed');
    requireField('responsible_maintainer');
    requireField('applicable_release', isTechnicalContent(item));
  }
  if (item.publication_date && item.last_reviewed && item.publication_date > item.last_reviewed) {
    issues.push(`${item.id}.last_reviewed cannot precede publication_date`);
  }
  return issues;
}

export function parseContentItem(input: unknown, gate: ReleaseGate = 'm1'): ContentItem {
  const item = contentItemSchema.parse(input);
  const issues = releaseGateIssues(item, gate);
  if (gate === 'v1.0' && input && typeof input === 'object') {
    const raw = input as Record<string, unknown>;
    const requiredKeys = ['description', 'last_reviewed', 'responsible_maintainer', 'supporting_artifacts'];
    if (isTechnicalContent(item)) requiredKeys.push('applicable_release', 'schedulers', 'container_runtimes');
    for (const field of requiredKeys) {
      if (!Object.hasOwn(raw, field)) issues.push(`${item.id}.${field} is required at v1.0`);
    }
  }
  if (issues.length > 0) throw new Error(issues.join('\n'));
  return item;
}