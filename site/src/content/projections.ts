import {
  CANONICAL_ORIGIN,
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
  resource_groups: Array<{ artifact_type: ContentItem['artifact_type']; item_ids: string[] }>;
  indexes: Record<string, Record<string, string[]>>;
  sequential_path: Array<{ stage: LearningStage; item_ids: string[] }>;
  search: SearchRecord[];
  relationships: Record<string, { related: string[]; prerequisites: string[] }>;
  sitemap: string[];
  feed: Array<{ id: string; url: string; title: string; date: string }>;
  url_manifest: Array<{ id: string; path: string; url: string }>;
  no_js_html: string;
}

export const LEARNING_STAGES = ['baseline', 'portability', 'training', 'operations', 'adoption'] as const;
export type LearningStage = typeof LEARNING_STAGES[number];
export interface ModuleNavigationNode { id: string; title: string; url: string }
export interface ModuleNavigation { previous?: ModuleNavigationNode; next?: ModuleNavigationNode }
export interface NoResultState { message: string; active_filters: string[]; complete_index_url: '/resources/' }

const publicStatuses = ['published', 'superseded', 'archived'] as const;
const isPublic = ({ status }: ContentItem) => publicStatuses.includes(status as typeof publicStatuses[number]);
const stageRank = (stage: LearningStage) => LEARNING_STAGES.indexOf(stage);
const sequenceCompare = (a: ContentItem, b: ContentItem) => {
  const stageDifference = stageRank(a.learning_stage!) - stageRank(b.learning_stage!);
  if (stageDifference) return stageDifference;
  if (a.artifact_type === 'learning-module' && b.artifact_type === 'learning-module') {
    return a.module_number - b.module_number || a.id.localeCompare(b.id);
  }
  if (a.artifact_type === 'learning-module') return -1;
  if (b.artifact_type === 'learning-module') return 1;
  return canonicalPath(a).localeCompare(canonicalPath(b)) || a.id.localeCompare(b.id);
};

export function projectModuleNavigation(content: ContentItem[]): Record<string, ModuleNavigation> {
  const modules = content.filter((item): item is Extract<ContentItem, { artifact_type: 'learning-module' }> =>
    isPublic(item) && item.artifact_type === 'learning-module');
  const issues: string[] = [];
  const moduleNumbers = new Map<number, string>();
  for (const module of modules) {
    if (!module.learning_stage) issues.push(`${module.id}.learning_stage is required for module navigation`);
    const existing = moduleNumbers.get(module.module_number);
    if (existing) issues.push(`duplicate module_number ${module.module_number}: ${existing}, ${module.id}`);
    moduleNumbers.set(module.module_number, module.id);
  }
  if (issues.length) throw new RegistryValidationError(issues);
  const ordered = [...modules].sort(sequenceCompare);
  return Object.fromEntries(ordered.map((module, index) => [module.id, {
    previous: index > 0 ? { id: ordered[index - 1].id, title: ordered[index - 1].title, url: canonicalPath(ordered[index - 1]) } : undefined,
    next: index < ordered.length - 1 ? { id: ordered[index + 1].id, title: ordered[index + 1].title, url: canonicalPath(ordered[index + 1]) } : undefined,
  }]));
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);

function addIndex(index: Record<string, string[]>, key: string | number, id: string): void {
  const normalized = String(key);
  index[normalized] = [...(index[normalized] ?? []), id];
}

export function projectNoResultState(activeFilters: string[]): NoResultState {
  return {
    message: 'No resources match the active filters. Clear filters or browse the complete index.',
    active_filters: [...activeFilters].sort(),
    complete_index_url: '/resources/',
  };
}

export function projectDiscovery(content: ContentItem[], fixedPublicPaths: string[] = ['/','/resources/']): DiscoveryProjection {
  const published = content.filter(isPublic)
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
  const artifactTypes = [...new Set(published.map(({ artifact_type }) => artifact_type))].sort();
  const sequenced = published.filter((item): item is ContentItem & { learning_stage: LearningStage } => Boolean(item.learning_stage));
  return {
    resources,
    resource_groups: artifactTypes.map((artifact_type) => ({
      artifact_type,
      item_ids: published.filter((item) => item.artifact_type === artifact_type).map(({ id }) => id),
    })),
    indexes,
    sequential_path: LEARNING_STAGES.map((stage) => ({
      stage,
      item_ids: sequenced.filter((item) => item.learning_stage === stage).sort(sequenceCompare).map(({ id }) => id),
    })),
    search: published.map((item) => ({ id: item.id, url: canonicalPath(item), title: item.title, summary: item.summary, keywords: [...item.keywords].sort() })),
    relationships,
    sitemap: allUrls,
    feed: published.filter(({ publication_date }) => Boolean(publication_date)).map((item) => ({ id: item.id, url: `${CANONICAL_ORIGIN}${canonicalPath(item)}`, title: item.title, date: item.publication_date! })).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
    url_manifest: manifest,
    no_js_html: `<ul>${resources.map(({ title, url }) => `<li><a href="${escapeHtml(url)}">${escapeHtml(title)}</a></li>`).join('')}</ul>`,
  };
}

export const COMPOSITION_PROFILES = [
  'landing', 'resources', 'learning-conceptual', 'learning-runnable', 'start',
  'diagnostic', 'milestone', 'release', 'about', 'support', 'accessibility', 'applicability',
  'not-found',
] as const;
export type CompositionProfile = typeof COMPOSITION_PROFILES[number];
export type ApplicabilityConsumer = 'landing' | 'runnable-module' | 'milestone' | 'release';
export type ApplicabilitySupplement = { kind: 'boundary' | 'status'; text: string };
export interface ApplicabilityProjection {
  projectionId: `${ApplicabilityConsumer}:${string}`;
  consumer: ApplicabilityConsumer;
  recordId: string;
  canonicalPath: `/applicability/${string}/`;
  testedScope: string;
  supplement: ApplicabilitySupplement;
}
export interface DiagnosticApplicabilityContext {
  projectionId: `diagnostic:${string}:${string}`;
  diagnosticId: string;
  recordId: string;
  canonicalPath: `/applicability/${string}/`;
  discriminator: string;
}

const compositionProfiles = new Set<string>(COMPOSITION_PROFILES);

export function assertKnownCompositionProfile(requested: unknown, context = 'page'): CompositionProfile {
  if (typeof requested !== 'string' || !compositionProfiles.has(requested)) {
    throw new RegistryValidationError([`${context}: unknown composition profile ${String(requested)}`]);
  }
  return requested as CompositionProfile;
}

function assertProfileNamespace(item: ContentItem, expected: string): void {
  if (item.route_namespace && item.route_namespace !== expected) {
    throw new RegistryValidationError([
      `${item.id}: ${item.artifact_type} content cannot use ${item.route_namespace} composition; expected ${expected}`,
    ]);
  }
}

export function compositionProfileFor(item: ContentItem): CompositionProfile {
  if (item.artifact_type === 'learning-module') {
    assertProfileNamespace(item, 'guide');
    return item.module_type === 'conceptual' ? 'learning-conceptual' : 'learning-runnable';
  }
  if (item.route_namespace === 'start') {
    if (item.artifact_type !== 'guidance-note') {
      throw new RegistryValidationError([`${item.id}: start composition requires guidance-note content`]);
    }
    return 'start';
  }
  if (item.artifact_type === 'diagnostic') {
    assertProfileNamespace(item, 'diagnostics');
    return 'diagnostic';
  }
  if (item.artifact_type === 'milestone') {
    assertProfileNamespace(item, 'milestones');
    return 'milestone';
  }
  if (item.artifact_type === 'release') {
    assertProfileNamespace(item, 'releases');
    return 'release';
  }
  if (item.artifact_type === 'support') {
    assertProfileNamespace(item, 'about');
    return 'support';
  }
  if (item.artifact_type === 'accessibility') {
    assertProfileNamespace(item, 'about');
    return 'accessibility';
  }

  const aboutArtifacts: ReadonlySet<ContentItem['artifact_type']> = new Set([
    'guidance-note', 'report', 'news', 'contribution', 'attribution', 'maintenance',
  ]);
  const defaultsToAbout = ['contribution', 'attribution', 'maintenance'].includes(item.artifact_type);
  if (aboutArtifacts.has(item.artifact_type) && (item.route_namespace === 'about' || (!item.route_namespace && defaultsToAbout))) {
    return 'about';
  }
  throw new RegistryValidationError([
    `${item.id}: no composition profile for ${item.artifact_type} content${item.route_namespace ? ` in ${item.route_namespace}` : ''}`,
  ]);
}

export function assertCompositionProfile(item: ContentItem, requested: unknown): CompositionProfile {
  const selected = assertKnownCompositionProfile(requested, item.id);
  const inferred = compositionProfileFor(item);
  if (selected !== inferred) {
    throw new RegistryValidationError([`${item.id}: composition profile ${selected} contradicts ${inferred}`]);
  }
  return inferred;
}

const statusSupplement = (status: ApplicabilityRecord['status']): ApplicabilitySupplement | undefined => ({
  failed: { kind: 'status', text: 'This recorded run failed; use the linked record before attempting the workflow.' },
  unvalidated: { kind: 'status', text: 'This workflow scope is unvalidated; do not treat it as executable evidence.' },
  stale: { kind: 'status', text: 'This validation is stale and requires review before reuse.' },
  validated: undefined,
})[status] as ApplicabilitySupplement | undefined;

export function projectApplicability(record: ApplicabilityRecord, consumer: ApplicabilityConsumer): ApplicabilityProjection {
  const supplement = statusSupplement(record.status) ?? {
    kind: 'boundary' as const,
    text: record.portability_boundaries[0],
  };
  return {
    projectionId: `${consumer}:${record.id}`,
    consumer,
    recordId: record.id,
    canonicalPath: `/applicability/${record.id}/`,
    testedScope: `The baseline workflow was ${record.status === 'validated' ? 'validated' : 'recorded'} on ${record.environment.public_name} with ${record.scheduler.family} and ${record.runtime.name}.`,
    supplement,
  };
}

const applicabilityConsumerByProfile: Partial<Record<CompositionProfile, ApplicabilityConsumer>> = {
  landing: 'landing',
  'learning-runnable': 'runnable-module',
  milestone: 'milestone',
  release: 'release',
};

/** Applies the closed composition allowlist before any applicability output is created. */
export function projectApplicabilityForProfile(
  profile: CompositionProfile,
  record?: ApplicabilityRecord,
): ApplicabilityProjection | undefined {
  const selected = assertKnownCompositionProfile(profile);
  const consumer = applicabilityConsumerByProfile[selected];
  return consumer && record ? projectApplicability(record, consumer) : undefined;
}

export function projectApplicabilityForItem(
  item: ContentItem,
  records: ApplicabilityRecord[],
  consumer: Exclude<ApplicabilityConsumer, 'landing'>,
): ApplicabilityProjection | undefined {
  const allowed = consumer === 'runnable-module'
    ? item.artifact_type === 'learning-module' && item.module_type !== 'conceptual'
    : item.artifact_type === consumer;
  if (!allowed) throw new RegistryValidationError([`${item.id}: ${consumer} applicability is not allowed for ${item.artifact_type}`]);
  if (item.applicability_records.length === 0) return undefined;
  if (item.applicability_records.length !== 1) throw new RegistryValidationError([`${item.id}: exactly one applicability record is allowed`]);
  const record = records.find(({ id }) => id === item.applicability_records[0]);
  if (!record) throw new RegistryValidationError([`${item.id}: missing applicability source ${item.applicability_records[0]}`]);
  if (consumer === 'runnable-module' && record.workflow_id !== item.id) {
    throw new RegistryValidationError([`${item.id}: applicability ${record.id} belongs to ${record.workflow_id}`]);
  }
  return projectApplicability(record, consumer);
}

export function projectDiagnosticApplicabilityContext(
  item: ContentItem,
  records: ApplicabilityRecord[],
): DiagnosticApplicabilityContext | undefined {
  if (item.artifact_type !== 'diagnostic') throw new RegistryValidationError([`${item.id}: diagnostic context requires a diagnostic item`]);
  const relationship = item.diagnostic_applicability;
  if (!relationship) return undefined;
  const record = records.find(({ id }) => id === relationship.record_id);
  if (!record) throw new RegistryValidationError([`${item.id}: missing diagnostic applicability source ${relationship.record_id}`]);
  if (!item.related.includes(record.workflow_id)) {
    throw new RegistryValidationError([`${item.id}: diagnostic applicability must reference a record for a related workflow`]);
  }
  const discriminator = relationship.discriminator === 'environment' ? record.environment.public_name
    : relationship.discriminator === 'scheduler' ? record.scheduler.family : record.runtime.name;
  return {
    projectionId: `diagnostic:${item.id}:${record.id}`,
    diagnosticId: item.id,
    recordId: record.id,
    canonicalPath: `/applicability/${record.id}/`,
    discriminator: `${relationship.discriminator}: ${discriminator}`,
  };
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

export interface LandingPageProjection {
  applicability_projection?: ApplicabilityProjection;
  validation_unavailable_reason?: string;
  learning_path: Array<{ label: string; title: string; summary: string; url: string }>;
  estimated_minutes: number;
  release: { title: string; status: ContentItem['status']; url: string };
  milestone: { title: string; url: string };
}

/** Builds the root-page editorial data strictly from validated content records. */
export function projectLandingPage(
  content: ContentItem[],
  applicability: ApplicabilityRecord[],
): LandingPageProjection {
  const published = content.filter(({ status }) => ['published', 'superseded', 'archived'].includes(status));
  const model = published.find((item) => item.artifact_type === 'learning-module' && item.module_number === 1);
  const baseline = published.find((item) => item.artifact_type === 'learning-module' && item.module_number === 2);
  const start = published.find((item) => item.route_namespace === 'start');
  const milestone = baseline && published.find((item) => item.artifact_type === 'milestone' && item.milestone === baseline.milestone);
  const missing = [!model && 'module 1', !start && 'getting-started guide', !baseline && 'module 2', !milestone && 'milestone collection'].filter(Boolean);
  if (missing.length) throw new RegistryValidationError([`landing projection is missing ${missing.join(', ')}`]);

  const modules = [model!, baseline!];
  const missingDurations = modules.filter((item) => item.artifact_type === 'learning-module' && !item.estimated_minutes);
  if (missingDurations.length) {
    throw new RegistryValidationError(missingDurations.map((item) => `${item.id}.estimated_minutes is required by the landing learning path`));
  }

  const records = baseline!.applicability_records.flatMap((id) => {
    const record = applicability.find((candidate) => candidate.id === id && candidate.workflow_id === baseline!.id);
    return record ? [record] : [];
  });
  const latestDate = records.map(({ validation_date }) => validation_date).sort().at(-1);
  const currentRecords = latestDate ? records.filter(({ validation_date }) => validation_date === latestDate) : [];
  const current = currentRecords.length === 1 ? currentRecords[0] : undefined;
  const release = published.find((item) => item.artifact_type === 'release'
    && (!current || item.applicability_records.includes(current.id)));
  if (!release) throw new RegistryValidationError(['landing projection is missing the current release record']);

  const step = (label: string, item: ContentItem) => ({
    label, title: item.title, summary: item.summary, url: canonicalPath(item),
  });
  return {
    applicability_projection: current ? projectApplicability(current, 'landing') : undefined,
    validation_unavailable_reason: current ? undefined : records.length
      ? 'Multiple applicability records share the latest validation date.'
      : 'No current applicability record is published.',
    learning_path: [step('Understand the model', model!), step('Check your center', start!), step('Run the baseline', baseline!)],
    estimated_minutes: modules.reduce((total, item) => total + (item.artifact_type === 'learning-module' ? item.estimated_minutes ?? 0 : 0), 0),
    release: { title: release.title, status: release.status, url: canonicalPath(release) },
    milestone: { title: milestone!.title, url: canonicalPath(milestone!) },
  };
}
