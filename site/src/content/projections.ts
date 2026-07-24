import {
  CANONICAL_ORIGIN,
  isTechnicalContent,
  releaseChangeSchema,
  type ApplicabilityRecord,
  type ContentItem,
  type EvidenceReference,
  type ReleaseRecord,
} from './schema.js';
import { RegistryValidationError, canonicalPath, generateCanonicalRoutes } from './registry.js';

export interface MilestoneDeliverableProjection {
  sow_id: string;
  item_id: string;
  title: string;
  primary_milestone: 1 | 2 | 3 | 4;
  status: 'planned' | 'draft' | 'complete' | 'externally-pending';
  public_url: string;
  completion_evidence?: EvidenceReference;
  revisions: ContentItem['revisions'];
}

export interface MilestoneProjection {
  number: 1 | 2 | 3 | 4;
  canonical_url: string;
  deliverables: MilestoneDeliverableProjection[];
}

export function projectMilestones(content: ContentItem[]): MilestoneProjection[] {
  const issues: string[] = [];
  const projections = ([1, 2, 3, 4] as const).map((number) => ({
    number,
    canonical_url: `/milestones/${number}/`,
    deliverables: [] as MilestoneDeliverableProjection[],
  }));
  const sowIds = new Set<string>();
  for (const item of content.filter(({ sow_deliverable_id }) => Boolean(sow_deliverable_id))) {
    if (sowIds.has(item.sow_deliverable_id!)) issues.push(`duplicate SOW deliverable ID ${item.sow_deliverable_id}`);
    sowIds.add(item.sow_deliverable_id!);
    const status = item.deliverable_status ?? (item.status === 'published' ? 'complete' : 'draft');
    if (status === 'complete' && !item.completion_evidence) {
      issues.push(`${item.id}.completion_evidence is required when a deliverable is complete`);
    }
    let previousDate = '';
    for (const revision of item.revisions) {
      if (revision.date <= previousDate) issues.push(`${item.id}.revisions must be strictly chronological`);
      if (item.publication_date && revision.date < item.publication_date) {
        issues.push(`${item.id}.revisions cannot predate original publication`);
      }
      previousDate = revision.date;
    }
    projections[item.milestone - 1].deliverables.push({
      sow_id: item.sow_deliverable_id!, item_id: item.id, title: item.title,
      primary_milestone: item.milestone, status, public_url: canonicalPath(item),
      completion_evidence: item.completion_evidence, revisions: [...item.revisions],
    });
  }
  for (const projection of projections) {
    projection.deliverables.sort((a, b) => a.sow_id.localeCompare(b.sow_id) || a.item_id.localeCompare(b.item_id));
  }
  if (issues.length) throw new RegistryValidationError(issues);
  return projections;
}

export interface SearchRecord {
  id: string;
  url: string;
  title: string;
  summary: string;
  keywords: string[];
}

export interface DiscoveryProjection {
  resources: Array<{ id: string; title: string; url: string }>;
  indexes: Record<string, Record<string, string[]>>;
  sequential_path: Array<{ stage: string; item_ids: string[] }>;
  search: SearchRecord[];
  relationships: Record<string, { related: string[]; prerequisites: string[] }>;
  no_result: { message: string; active_filters: string[]; complete_index_url: '/resources/' };
  sitemap: string[];
  feed: Array<{ id: string; url: string; title: string; date: string }>;
  url_manifest: Array<{ id: string; path: string; url: string }>;
  no_js_html: string;
}

const stages = ['baseline', 'portability', 'training', 'operations', 'adoption'] as const;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);

function addIndex(index: Record<string, string[]>, key: string | number, id: string): void {
  const normalized = String(key);
  index[normalized] = [...(index[normalized] ?? []), id];
}

export function projectNoResultState(activeFilters: string[]): DiscoveryProjection['no_result'] {
  return {
    message: 'No resources match the active filters. Clear filters or browse the complete index.',
    active_filters: [...activeFilters].sort(),
    complete_index_url: '/resources/',
  };
}

export function projectDiscovery(content: ContentItem[], fixedPublicPaths: string[] = ['/','/resources/']): DiscoveryProjection {
  const published = content.filter(({ status }) => ['published', 'superseded', 'archived'].includes(status))
    .sort((a, b) => canonicalPath(a).localeCompare(canonicalPath(b)) || a.id.localeCompare(b.id));
  generateCanonicalRoutes(published);
  const indexNames = ['audience', 'topic', 'milestone', 'artifact_type', 'maturity', 'scheduler', 'container_runtime'] as const;
  const indexes = Object.fromEntries(indexNames.map((name) => [name, {}])) as DiscoveryProjection['indexes'];
  const relationships: DiscoveryProjection['relationships'] = {};
  for (const item of published) {
    for (const value of item.audiences) addIndex(indexes.audience, value, item.id);
    for (const value of item.topics) addIndex(indexes.topic, value, item.id);
    addIndex(indexes.milestone, item.milestone, item.id);
    addIndex(indexes.artifact_type, item.artifact_type, item.id);
    addIndex(indexes.maturity, item.status, item.id);
    for (const value of item.schedulers) addIndex(indexes.scheduler, value, item.id);
    for (const value of item.container_runtimes) addIndex(indexes.container_runtime, value, item.id);
    relationships[item.id] = {
      related: [...item.related].sort(),
      prerequisites: item.artifact_type === 'learning-module' ? item.prerequisites.map(({ id }) => id).sort() : [],
    };
  }
  for (const index of Object.values(indexes)) {
    for (const ids of Object.values(index)) ids.sort();
  }
  const manifest = published.map((item) => ({ id: item.id, path: canonicalPath(item), url: `${CANONICAL_ORIGIN}${canonicalPath(item)}` }));
  const allUrls = [...new Set([...fixedPublicPaths.map((path) => `${CANONICAL_ORIGIN}${path}`), ...manifest.map(({ url }) => url)])].sort();
  const resources = published.map((item) => ({ id: item.id, title: item.title, url: canonicalPath(item) }));
  return {
    resources, indexes,
    sequential_path: stages.map((stage) => ({ stage, item_ids: published.filter((item) => item.learning_stage === stage).map(({ id }) => id) })),
    search: published.map((item) => ({ id: item.id, url: canonicalPath(item), title: item.title, summary: item.summary, keywords: [...item.keywords].sort() })),
    relationships,
    no_result: projectNoResultState([]),
    sitemap: allUrls,
    feed: published.filter(({ publication_date }) => Boolean(publication_date)).map((item) => ({ id: item.id, url: `${CANONICAL_ORIGIN}${canonicalPath(item)}`, title: item.title, date: item.publication_date! })).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
    url_manifest: manifest,
    no_js_html: `<ul>${resources.map(({ title, url }) => `<li><a href="${escapeHtml(url)}">${escapeHtml(title)}</a></li>`).join('')}</ul>`,
  };
}

export interface TechnicalStatusProjection {
  item_id: string;
  url: string;
  maturity: ContentItem['status'];
  applicable_release?: string;
  last_reviewed?: string;
  validation_status?: 'validated' | 'failed' | 'unvalidated' | 'stale';
  validation_date?: string;
  applicability: Array<{
    id: string;
    environment: string;
    scheduler: string;
    runtime: string;
    validation_status: ApplicabilityRecord['status'];
    validation_date: string;
    evidence_path: string;
  }>;
}

export function projectTechnicalStatus(
  content: ContentItem[],
  applicability: ApplicabilityRecord[],
): TechnicalStatusProjection[] {
  const issues: string[] = [];
  const applicabilityById = new Map(applicability.map((record) => [record.id, record]));
  const projections = content.filter(isTechnicalContent).map((item) => {
    const records = item.applicability_records.flatMap((id) => {
      const record = applicabilityById.get(id);
      if (!record) { issues.push(`${item.id}: missing applicability projection source ${id}`); return []; }
      if (record.workflow_id !== item.id) issues.push(`${item.id}: applicability ${id} belongs to ${record.workflow_id}`);
      return [record];
    });
    const moduleValidation = item.artifact_type === 'learning-module'
      ? { validation_status: item.validation_status, validation_date: item.validation_date }
      : {};
    return {
      item_id: item.id,
      url: canonicalPath(item),
      maturity: item.status,
      applicable_release: item.applicable_release,
      last_reviewed: item.last_reviewed,
      ...moduleValidation,
      applicability: records.map((record) => ({
        id: record.id,
        environment: record.environment.public_name,
        scheduler: `${record.scheduler.family} ${record.scheduler.version}`,
        runtime: `${record.runtime.name} ${record.runtime.version}`,
        validation_status: record.status,
        validation_date: record.execution_date,
        evidence_path: record.evidence.path,
      })),
    };
  }).sort((a, b) => a.url.localeCompare(b.url));
  if (issues.length) throw new RegistryValidationError(issues);
  return projections;
}

export interface ReleaseChangeProjection {
  release: string;
  published_at: string;
  immutable_repository_url: string;
  classes: Record<'added' | 'changed' | 'deprecated' | 'corrected', Array<{
    item_id: string;
    reason?: string;
    affected_environments: string[];
    migration?: string;
    material: boolean;
  }>>;
}

export function projectReleaseChanges(releases: ReleaseRecord[]): ReleaseChangeProjection[] {
  return [...releases].sort((a, b) => a.version.localeCompare(b.version)).map((release) => {
    const classes: ReleaseChangeProjection['classes'] = { added: [], changed: [], deprecated: [], corrected: [] };
    for (const rawChange of release.changes) {
      const change = releaseChangeSchema.parse(rawChange);
      classes[change.class].push({
        item_id: change.item_id,
        reason: change.reason,
        affected_environments: [...change.affected_environments].sort(),
        migration: change.migration,
        material: change.material,
      });
    }
    for (const changes of Object.values(classes)) changes.sort((a, b) => a.item_id.localeCompare(b.item_id));
    const revision = release.repository.release.startsWith('refs/tags/')
      ? release.repository.release.slice('refs/tags/'.length)
      : release.repository.release;
    return {
      release: release.version,
      published_at: release.published_at,
      immutable_repository_url: `${release.repository.repository.replace(/\/$/, '')}/tree/${encodeURIComponent(revision)}/${release.repository.path.replace(/^\/+/, '')}`,
      classes,
    };
  });
}