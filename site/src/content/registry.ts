import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import {
  applicabilityRecordSchema,
  contentItemSchema,
  milestoneRecordSchema,
  redirectRecordSchema,
  releaseRecordSchema,
  repoRefSchema,
  parseContentItem,
  type ApplicabilityRecord,
  type ContentItem,
  type MilestoneRecord,
  type Maturity,
  type RedirectRecord,
  type ReleaseGate,
  type ReleaseRecord,
  type RepoRef,
} from './schema.js';

export class RegistryValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(issues.join('\n'));
    this.name = 'RegistryValidationError';
    this.issues = issues;
  }
}

export interface RegistryInput {
  content: unknown[];
  applicability?: unknown[];
  releases?: unknown[];
  milestones?: unknown[];
  previousContent?: unknown[];
  gate?: ReleaseGate;
}

export interface ValidatedRegistry {
  content: ContentItem[];
  applicability: ApplicabilityRecord[];
  releases: ReleaseRecord[];
  milestones: MilestoneRecord[];
}

const relationFields = [
  'topics', 'keywords', 'audiences', 'supporting_artifacts', 'schedulers',
  'container_runtimes', 'related', 'applicability_records',
] as const;
const publicStatuses: Maturity[] = ['published', 'superseded', 'archived'];

function normalizedKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase() : JSON.stringify(value);
}

function rejectDuplicates(item: ContentItem, issues: string[]): ContentItem {
  for (const field of relationFields) {
    const seen = new Set<string>();
    for (const value of item[field]) {
      const key = normalizedKey(value);
      if (seen.has(key)) issues.push(`${item.id}.${field} contains duplicate value ${key}`);
      seen.add(key);
    }
  }
  if (item.artifact_type === 'learning-module') {
    const seen = new Set<string>();
    for (const prerequisite of item.prerequisites) {
      if (seen.has(prerequisite.id)) issues.push(`${item.id}.prerequisites contains duplicate ID ${prerequisite.id}`);
      seen.add(prerequisite.id);
    }
  }
  return item;
}

export function normalizeRelationships(item: ContentItem): ContentItem {
  const strings = (values: string[]) => values.map((value) => value.trim()).sort((a, b) => a.localeCompare(b));
  const normalized = {
    ...item,
    topics: strings(item.topics),
    keywords: strings(item.keywords),
    audiences: strings(item.audiences),
    schedulers: [...item.schedulers].sort(),
    container_runtimes: [...item.container_runtimes].sort(),
    related: strings(item.related),
    applicability_records: strings(item.applicability_records),
    supporting_artifacts: [...item.supporting_artifacts].sort((a, b) =>
      `${a.repository}:${a.release}:${a.path}`.localeCompare(`${b.repository}:${b.release}:${b.path}`)),
  };
  if (item.artifact_type === 'learning-module') {
    return { ...normalized, prerequisites: [...item.prerequisites].sort((a, b) => a.id.localeCompare(b.id)) } as ContentItem;
  }
  return normalized as ContentItem;
}

const allowedTransitions: Record<Maturity, readonly Maturity[]> = {
  draft: ['draft', 'validated', 'archived'],
  validated: ['validated', 'published', 'archived'],
  published: ['published', 'superseded', 'archived'],
  superseded: ['superseded', 'archived'],
  archived: ['archived'],
};

function parseRecords<T>(values: unknown[], label: string, parser: { parse(value: unknown): T }, issues: string[]): T[] {
  const records: T[] = [];
  values.forEach((value, index) => {
    try {
      records.push(parser.parse(value));
    } catch (error) {
      issues.push(`${label}[${index}]: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  return records;
}

export function canonicalPath(item: ContentItem): string {
  const namespace = item.route_namespace ?? ({
    'learning-module': 'guide', 'guidance-note': 'guide', template: 'guide',
    'training-package': 'training', 'event-assets': 'events', checklist: 'adoption',
    milestone: 'milestones', feedback: 'feedback', release: 'releases', diagnostic: 'diagnostics',
    report: 'resources', news: 'resources', support: 'about', contribution: 'about',
    attribution: 'about', accessibility: 'about', maintenance: 'about',
  } as const)[item.artifact_type];
  if (namespace === 'start') return '/start/';
  if (namespace === 'milestones') return `/milestones/${item.milestone}/`;
  return `/${namespace}/${item.stable_slug}/`;
}

export function generateCanonicalRoutes(content: ContentItem[], publishDrafts = false): Map<string, ContentItem> {
  const routes = new Map<string, ContentItem>();
  const issues: string[] = [];
  for (const item of content) {
    if (!publishDrafts && !publicStatuses.includes(item.status)) continue;
    const route = canonicalPath(item);
    const existing = routes.get(route);
    if (existing) issues.push(`duplicate canonical route ${route}: ${existing.id}, ${item.id}`);
    else routes.set(route, item);
  }
  if (issues.length) throw new RegistryValidationError(issues);
  return routes;
}

function validateReferences(registry: ValidatedRegistry, issues: string[]): void {
  const byId = new Map(registry.content.map((item) => [item.id, item]));
  const applicabilityIds = new Set(registry.applicability.map((record) => record.id));
  const releaseIds = new Set(registry.releases.flatMap((record) => [record.id, record.version]));
  for (const item of registry.content) {
    const references = [...item.related];
    if (item.successor_id) references.push(item.successor_id);
    if (item.artifact_type === 'learning-module') references.push(...item.prerequisites.map(({ id }) => id));
    for (const id of references) {
      const target = byId.get(id);
      if (!target) issues.push(`${item.id}: missing content reference ${id}`);
      else if (publicStatuses.includes(item.status) && target.status === 'draft') {
        issues.push(`${item.id}: published content cannot depend on draft ${id}`);
      }
    }
    for (const id of item.applicability_records) {
      if (!applicabilityIds.has(id)) issues.push(`${item.id}.applicability_records: missing ${id}`);
    }
    for (const id of [item.release_introduced, item.release_superseded].filter(Boolean) as string[]) {
      if (!releaseIds.has(id)) issues.push(`${item.id}: missing release reference ${id}`);
    }
    if (item.artifact_type === 'learning-module') {
      for (const prerequisite of item.prerequisites) {
        if (prerequisite.diagnostic_id && byId.get(prerequisite.diagnostic_id)?.artifact_type !== 'diagnostic') {
          issues.push(`${item.id}.prerequisites: ${prerequisite.diagnostic_id} is not a diagnostic`);
        }
      }
    }
  }
  for (const record of registry.applicability) {
    if (!byId.has(record.workflow_id)) issues.push(`${record.id}.workflow_id: missing ${record.workflow_id}`);
  }
}

function validateMilestoneOwnership(registry: ValidatedRegistry, issues: string[]): void {
  if (registry.milestones.length === 0) return;
  const owners = new Map<string, number[]>();
  for (const milestone of registry.milestones) {
    for (const deliverable of milestone.deliverables) {
      owners.set(deliverable.item_id, [...(owners.get(deliverable.item_id) ?? []), milestone.number]);
      const item = registry.content.find(({ id }) => id === deliverable.item_id);
      if (!item) issues.push(`${milestone.id}: missing deliverable item ${deliverable.item_id}`);
      else {
        if (item.milestone !== milestone.number) issues.push(`${item.id}: milestone ${item.milestone} conflicts with owner ${milestone.number}`);
        if (canonicalPath(item) !== deliverable.public_url) issues.push(`${milestone.id}.${item.id}: public_url is not canonical`);
      }
    }
  }
  for (const item of registry.content.filter(({ sow_deliverable_id }) => Boolean(sow_deliverable_id))) {
    const itemOwners = owners.get(item.id) ?? [];
    if (itemOwners.length !== 1) issues.push(`${item.id}: SOW deliverable must have exactly one primary milestone owner`);
  }
}

function validateTransitions(current: ContentItem[], previous: ContentItem[], issues: string[]): void {
  const currentById = new Map(current.map((item) => [item.id, item]));
  for (const prior of previous) {
    const next = currentById.get(prior.id);
    if (!next) continue;
    if (!allowedTransitions[prior.status].includes(next.status)) {
      issues.push(`${prior.id}.status: invalid transition ${prior.status} -> ${next.status}`);
    }
    if (prior.stable_slug !== next.stable_slug || canonicalPath(prior) !== canonicalPath(next)) {
      issues.push(`${prior.id}: stable slug or canonical path changed`);
    }
    if (prior.completion_evidence && JSON.stringify(prior.completion_evidence) !== JSON.stringify(next.completion_evidence)) {
      issues.push(`${prior.id}.completion_evidence: original completion evidence is immutable`);
    }
    const prefix = next.revisions.slice(0, prior.revisions.length);
    if (JSON.stringify(prefix) !== JSON.stringify(prior.revisions)) {
      issues.push(`${prior.id}.revisions: completion history must be append-only`);
    }
  }
}

export function validateRegistry(input: RegistryInput): ValidatedRegistry {
  const issues: string[] = [];
  const content = parseRecords(input.content, 'content', {
    parse: (value) => parseContentItem(value, input.gate ?? 'm1'),
  }, issues).map((item) => normalizeRelationships(rejectDuplicates(item, issues)));
  const registry: ValidatedRegistry = {
    content,
    applicability: parseRecords(input.applicability ?? [], 'applicability', applicabilityRecordSchema, issues),
    releases: parseRecords(input.releases ?? [], 'releases', releaseRecordSchema, issues),
    milestones: parseRecords(input.milestones ?? [], 'milestones', milestoneRecordSchema, issues),
  };
  const unique = (records: Array<{ id: string }>, label: string) => {
    const seen = new Set<string>();
    for (const record of records) {
      if (seen.has(record.id)) issues.push(`duplicate ${label} ID ${record.id}`);
      seen.add(record.id);
    }
  };
  unique(content, 'content');
  unique(registry.applicability, 'applicability');
  unique(registry.releases, 'release');
  validateReferences(registry, issues);
  validateMilestoneOwnership(registry, issues);
  try { generateCanonicalRoutes(content, true); } catch (error) {
    if (error instanceof RegistryValidationError) issues.push(...error.issues); else throw error;
  }
  if (input.previousContent) {
    const previous = parseRecords(input.previousContent, 'previousContent', contentItemSchema, issues);
    validateTransitions(content, previous, issues);
  }
  if (issues.length) throw new RegistryValidationError(issues);
  return registry;
}

const privateIpv4 = /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
const immutableRevision = /^(?:[a-f0-9]{40}|refs\/tags\/[A-Za-z0-9._/-]+|v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?)$/i;
const mutableRevision = /^(?:main|master|develop|development|refs\/heads\/.+)$/i;

export interface ResolvedRepoRef extends RepoRef {
  local_path: string;
  href: string;
}

export function resolveRepoRef(
  value: unknown,
  repositoryRoot: string,
  context: Pick<ContentItem, 'artifact_type'>,
): ResolvedRepoRef {
  const reference = repoRefSchema.parse(value);
  const issues: string[] = [];
  const repository = new URL(reference.repository);
  if (repository.protocol !== 'https:') issues.push('repository must use public HTTPS');
  if (repository.username || repository.password || repository.port) issues.push('repository must not contain credentials or a custom port');
  if (repository.hostname === 'localhost' || repository.hostname.endsWith('.local') || privateIpv4.test(repository.hostname)) {
    issues.push('repository must have a public hostname');
  }
  const supportContext = ['support', 'contribution'].includes(context.artifact_type);
  if (!immutableRevision.test(reference.release)) {
    if (!(supportContext && mutableRevision.test(reference.release))) {
      issues.push('release must be a release tag or full 40-character commit; branches are limited to support/contribution pages');
    }
  }
  const cleanPath = reference.path.replace(/^\/+/, '');
  const localPath = resolve(repositoryRoot, cleanPath);
  const root = resolve(repositoryRoot);
  if (localPath !== root && !localPath.startsWith(`${root}${sep}`)) issues.push('path escapes the companion repository');
  if (!existsSync(localPath)) issues.push(`local repository path does not exist: ${reference.path}`);
  if (issues.length) throw new RegistryValidationError(issues);
  const revision = reference.release.startsWith('refs/tags/')
    ? reference.release.slice('refs/tags/'.length)
    : reference.release;
  const base = reference.repository.replace(/\/$/, '');
  const href = `${base}/blob/${encodeURIComponent(revision)}/${cleanPath}${reference.line_anchor ?? ''}`;
  return { ...reference, local_path: localPath, href };
}

export interface RedirectValidationInput {
  redirects: unknown[];
  currentPaths: Iterable<string>;
  previousPaths?: Iterable<string>;
  retiredPaths?: Iterable<string>;
}

export function validateRedirects(input: RedirectValidationInput): RedirectRecord[] {
  const issues: string[] = [];
  const redirects = parseRecords(input.redirects, 'redirects', redirectRecordSchema, issues);
  const current = new Set(input.currentPaths);
  const previous = new Set(input.previousPaths ?? []);
  const retired = new Set(input.retiredPaths ?? []);
  const bySource = new Map<string, RedirectRecord>();
  for (const redirect of redirects) {
    if (bySource.has(redirect.from)) issues.push(`duplicate redirect source ${redirect.from}`);
    bySource.set(redirect.from, redirect);
    if (redirect.from === redirect.to) issues.push(`redirect loop at ${redirect.from}`);
    if (current.has(redirect.from)) issues.push(`retired path reused by canonical route ${redirect.from}`);
    if (retired.has(redirect.to)) issues.push(`redirect target is retired: ${redirect.to}`);
  }
  for (const redirect of redirects) {
    if (bySource.has(redirect.to)) issues.push(`redirect chain is not one-hop: ${redirect.from} -> ${redirect.to}`);
    if (!current.has(redirect.to)) issues.push(`redirect target is missing: ${redirect.to}`);
  }
  for (const oldPath of previous) {
    if (!current.has(oldPath) && !bySource.has(oldPath)) issues.push(`removed public URL is unaccounted for: ${oldPath}`);
  }
  for (const retiredPath of retired) {
    if (current.has(retiredPath)) issues.push(`retired path reused by canonical route ${retiredPath}`);
  }
  if (issues.length) throw new RegistryValidationError(issues);
  return redirects;
}