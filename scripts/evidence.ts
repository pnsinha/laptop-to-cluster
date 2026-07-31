import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync,
  statSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { z } from 'astro/zod';
import { parse as parseYaml } from 'yaml';
import { applicabilityRecordSchema, type ApplicabilityRecord } from '../site/src/content/schema.js';
import { canonicalDiagnosticId, isReadinessTimeoutDiagnostic } from '../site/src/content/diagnostics.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoDateTime = z.string().datetime({ offset: true });
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const revision = z.string().regex(/^(?:[a-f0-9]{40}|v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?)$/i);
const safeRelativePath = z.string().min(1).refine((value) => {
  const normalized = value.replaceAll('\\', '/');
  return !normalized.startsWith('/') && !normalized.split('/').includes('..');
}, 'must be a safe relative path');

export const recordRunMetadataSchema = z.object({
  schemaVersion: z.literal(1),
  evidenceId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  evidenceKind: z.enum(['success', 'readiness-timeout']),
  workflowId: z.string().min(1), workflowRevision: revision, releaseCandidate: z.string().min(1),
  environment: z.object({
    publicName: z.enum(['Purdue Anvil', 'SDSC Expanse']), fallback: z.boolean(),
    primaryUnavailableReason: z.string().min(1).optional(),
  }).strict(),
  schedulerVersion: z.string().min(1), runtimeVersion: z.string().min(1), containerDigest: digest,
  submissionId: z.string().min(1), startedAt: isoDateTime, endedAt: isoDateTime,
  nodes: z.literal(1), coordinatorCount: z.literal(1), workerCount: z.number().int().min(1).max(16),
  terminalState: z.string().min(1), exitCode: z.number().int(), reviewAfter: isoDate,
  assumptions: z.array(z.string().min(1)).min(1), limitations: z.array(z.string().min(1)).min(1),
  portabilityBoundaries: z.array(z.string().min(1)).min(1), reviewer: z.string().min(1),
  redactValues: z.array(z.string().min(1)).default([]),
}).strict().superRefine((metadata, context) => {
  if (metadata.environment.publicName === 'Purdue Anvil' && metadata.environment.fallback) {
    context.addIssue({ code: 'custom', path: ['environment', 'fallback'], message: 'Purdue Anvil is the primary environment' });
  }
  if (metadata.environment.publicName === 'SDSC Expanse' && (!metadata.environment.fallback || !metadata.environment.primaryUnavailableReason)) {
    context.addIssue({ code: 'custom', path: ['environment'], message: 'Expanse requires fallback true and a primary-unavailable reason' });
  }
});
export type RecordRunMetadata = z.infer<typeof recordRunMetadataSchema>;

const evidenceEventSchema = z.object({
  sequence: z.number().int().nonnegative(), at: isoDateTime,
  type: z.enum(['coordinator-started', 'ready', 'workers-started', 'verified', 'failed']),
  code: z.string().regex(/^BSSW-[A-Z0-9-]+$/).transform(canonicalDiagnosticId).optional(),
}).strict();

export const evidenceManifestSchema = z.object({
  schemaVersion: z.literal(1), evidenceId: z.string().min(1),
  evidenceKind: z.enum(['success', 'readiness-timeout']), workflowId: z.string().min(1),
  workflowRevision: revision, releaseCandidate: z.string().min(1),
  representativeEnvironment: z.object({
    publicName: z.enum(['Purdue Anvil', 'SDSC Expanse']), fallback: z.boolean(),
    primaryUnavailableReason: z.string().min(1).optional(),
  }).strict(),
  run: z.object({
    schedulerVersion: z.string().min(1), runtimeVersion: z.string().min(1), containerDigest: digest,
    submissionId: z.string().min(1), startedAt: isoDateTime, endedAt: isoDateTime,
    nodes: z.literal(1), coordinatorCount: z.literal(1), workerCount: z.number().int().min(1).max(16),
    terminalState: z.string().min(1), exitCode: z.number().int(),
  }).strict(),
  events: z.array(evidenceEventSchema).min(1),
  checks: z.array(z.object({ name: z.string().min(1), passed: z.boolean(), detail: z.string().min(1) }).strict()).min(1),
  artifacts: z.array(z.object({ path: safeRelativePath, sha256: digest, mediaType: z.string().min(1) }).strict()).min(1),
  redactions: z.array(z.string().min(1)).min(1), assumptions: z.array(z.string().min(1)).min(1),
  limitations: z.array(z.string().min(1)).min(1), portabilityBoundaries: z.array(z.string().min(1)).min(1),
  reviewer: z.string().min(1), reviewAfter: isoDate,
}).strict();
export type EvidenceManifest = z.infer<typeof evidenceManifestSchema>;

export interface EvidenceValidationReport {
  valid: boolean;
  evidenceId?: string;
  kind?: EvidenceManifest['evidenceKind'];
  checks: Array<{ name: string; passed: boolean; detail: string }>;
  errors: string[];
}

export function sha256File(path: string): string {
  const hash = createHash('sha256');
  const content = readFileSync(path);
  hash.update(content);
  return `sha256:${hash.digest('hex')}`;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o644, flag: 'wx' });
}

function redactionRules(values: string[]): Array<{ name: string; pattern: RegExp; replacement: string }> {
  const escapedValues = values.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean);
  return [
    ...(escapedValues.length ? [{ name: 'configured sensitive values', pattern: new RegExp(escapedValues.join('|'), 'g'), replacement: '[REDACTED-VALUE]' }] : []),
    { name: 'credentials and allocation identifiers', pattern: /\b(token|password|secret|account|allocation)(\s*[:=]\s*)([^\s,"}]+)/gi, replacement: '$1$2[REDACTED-VALUE]' },
    { name: 'host identifiers', pattern: /\b(host|hostname|nodelist)(\s*[:=]\s*)([^\s,"}]+)/gi, replacement: '$1$2[REDACTED-HOST]' },
    { name: 'user-qualified hosts', pattern: /\b[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\b/g, replacement: '[REDACTED-USER]@[REDACTED-HOST]' },
    { name: 'email addresses', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: '[REDACTED-EMAIL]' },
    { name: 'user filesystem paths', pattern: /\/(home|users|scratch|work)\/[A-Za-z0-9._-]+(?=\/|\b)/g, replacement: '/$1/[REDACTED-USER]' },
  ];
}

export function redactText(text: string, values: string[] = []): { text: string; applied: string[] } {
  const applied = new Set<string>();
  let redacted = text;
  for (const rule of redactionRules(values)) {
    const next = redacted.replace(rule.pattern, (...args) => {
      applied.add(rule.name);
      return rule.replacement.replace(/\$(\d)/g, (_, index) => args[Number(index)] ?? '');
    });
    redacted = next;
  }
  return { text: redacted, applied: [...applied].sort() };
}

function eventType(source: string): EvidenceManifest['events'][number]['type'] | undefined {
  return ({
    'coordinator-start': 'coordinator-started',
    'coordinator-ready': 'ready',
    'worker-start': 'workers-started',
    'verification-success': 'verified',
    failure: 'failed',
  } as const)[source as 'coordinator-start'];
}

function parseEvents(path: string): EvidenceManifest['events'] {
  return readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((line, sequence) => {
    const source = JSON.parse(line) as { event?: string; at?: string; diagnosticId?: string };
    const type = source.event ? eventType(source.event) : undefined;
    if (!type) return [];
    return [evidenceEventSchema.parse({ sequence, at: source.at, type, ...(source.diagnosticId ? { code: source.diagnosticId } : {}) })];
  });
}

function mediaType(path: string): string {
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.jsonl')) return 'application/x-ndjson';
  return 'text/plain';
}

function collectSourceFiles(runDirectory: string, schedulerLog: string, kind: RecordRunMetadata['evidenceKind']): Array<{ source: string; target: string }> {
  const files = [
    { source: schedulerLog, target: 'scheduler.log' },
    { source: join(runDirectory, 'events.jsonl'), target: 'artifacts/events.jsonl' },
    { source: join(runDirectory, 'versions.txt'), target: 'artifacts/versions.txt' },
  ];
  const logs = join(runDirectory, 'logs');
  if (existsSync(logs)) {
    for (const name of readdirSync(logs).sort()) files.push({ source: join(logs, name), target: `logs/${name}` });
  }
  if (kind === 'success') {
    files.push({ source: join(runDirectory, 'result.json'), target: 'artifacts/result.json' });
    files.push({ source: join(runDirectory, 'results.json'), target: 'artifacts/results.json' });
  }
  for (const file of files) {
    if (!existsSync(file.source) || !statSync(file.source).isFile()) throw new Error(`required run output is missing: ${file.source}`);
  }
  return files;
}

function copyRedacted(source: string, target: string, values: string[]): string[] {
  const raw = readFileSync(source);
  if (raw.includes(0)) throw new Error(`binary evidence is not publishable: ${source}`);
  const redacted = redactText(raw.toString('utf8'), values);
  mkdirSync(dirname(target), { recursive: true, mode: 0o755 });
  writeFileSync(target, redacted.text, { encoding: 'utf8', mode: 0o644, flag: 'wx' });
  return redacted.applied;
}

function orderedIndex(events: EvidenceManifest['events'], type: EvidenceManifest['events'][number]['type']): number {
  return events.find((event) => event.type === type)?.sequence ?? -1;
}

function semanticErrors(manifest: EvidenceManifest, bundleDirectory: string): string[] {
  const errors: string[] = [];
  const coordinator = orderedIndex(manifest.events, 'coordinator-started');
  const ready = orderedIndex(manifest.events, 'ready');
  const worker = orderedIndex(manifest.events, 'workers-started');
  const verified = orderedIndex(manifest.events, 'verified');
  const failed = manifest.events.find((event) => event.type === 'failed');
  const resultPath = join(bundleDirectory, 'artifacts/result.json');
  if (manifest.evidenceKind === 'success') {
    if (manifest.run.terminalState !== 'COMPLETED' || manifest.run.exitCode !== 0) errors.push('success evidence requires terminal COMPLETED and exit code 0');
    if (!(coordinator >= 0 && coordinator < ready && ready < worker && worker < verified)) errors.push('success event ordering must be coordinator-started < ready < workers-started < verified');
    if (!existsSync(resultPath)) errors.push('success evidence requires artifacts/result.json');
    else {
      try {
        const result = JSON.parse(readFileSync(resultPath, 'utf8')) as { status?: string };
        if (result.status !== 'success') errors.push('artifacts/result.json is not a machine success marker');
      } catch { errors.push('artifacts/result.json is not valid JSON'); }
    }
    if (manifest.checks.some((check) => !check.passed)) errors.push('success evidence contains a failed output check');
  } else {
    if (manifest.run.exitCode === 0) errors.push('readiness-timeout evidence requires a nonzero exit code');
    if (worker >= 0) errors.push('readiness-timeout evidence must not contain a worker-start event');
    if (verified >= 0 || existsSync(resultPath)) errors.push('readiness-timeout evidence must not contain a success marker');
    if (coordinator < 0 || !failed || !isReadinessTimeoutDiagnostic(failed.code) || failed.sequence <= coordinator) {
      errors.push('readiness-timeout evidence requires coordinator-started followed by failed BSSW-READINESS-TIMEOUT');
    }
  }
  return errors;
}

export function recordRun(options: {
  metadata: unknown; runDirectory: string; schedulerLog: string; outputRoot: string;
}): string {
  const metadata = recordRunMetadataSchema.parse(options.metadata);
  const output = join(resolve(options.outputRoot), metadata.evidenceId);
  if (existsSync(output)) throw new Error(`immutable evidence already exists: ${output}`);
  const temporary = `${output}.tmp-${process.pid}`;
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
  mkdirSync(temporary, { recursive: true, mode: 0o755 });
  try {
    const redactions = new Set<string>();
    const copied = collectSourceFiles(resolve(options.runDirectory), resolve(options.schedulerLog), metadata.evidenceKind);
    for (const file of copied) {
      for (const name of copyRedacted(file.source, join(temporary, file.target), metadata.redactValues)) redactions.add(name);
    }
    if (redactions.size === 0) redactions.add('reviewed; no sensitive values detected by configured rules');
    const events = parseEvents(join(temporary, 'artifacts/events.jsonl'));
    const checks = metadata.evidenceKind === 'success' ? [
      { name: 'scheduler completion', passed: metadata.terminalState === 'COMPLETED' && metadata.exitCode === 0, detail: `${metadata.terminalState} exit ${metadata.exitCode}` },
      { name: 'success marker', passed: existsSync(join(temporary, 'artifacts/result.json')), detail: 'artifacts/result.json exists and is schema-checked' },
      { name: 'event ordering', passed: true, detail: 'coordinator readiness precedes worker start and verification' },
    ] : [
      { name: 'bounded failure', passed: metadata.exitCode !== 0, detail: `${metadata.terminalState} exit ${metadata.exitCode}` },
      { name: 'timeout diagnostic', passed: true, detail: 'BSSW-READINESS-TIMEOUT recorded after coordinator start' },
      { name: 'workers not started', passed: true, detail: 'no workers-started event is present' },
    ];
    const artifacts = copied.map(({ target }) => ({ path: target, sha256: sha256File(join(temporary, target)), mediaType: mediaType(target) }));
    const manifest = evidenceManifestSchema.parse({
      schemaVersion: 1, evidenceId: metadata.evidenceId, evidenceKind: metadata.evidenceKind,
      workflowId: metadata.workflowId, workflowRevision: metadata.workflowRevision,
      releaseCandidate: metadata.releaseCandidate, representativeEnvironment: metadata.environment,
      run: {
        schedulerVersion: metadata.schedulerVersion, runtimeVersion: metadata.runtimeVersion,
        containerDigest: metadata.containerDigest, submissionId: metadata.submissionId,
        startedAt: metadata.startedAt, endedAt: metadata.endedAt, nodes: metadata.nodes,
        coordinatorCount: metadata.coordinatorCount, workerCount: metadata.workerCount,
        terminalState: metadata.terminalState, exitCode: metadata.exitCode,
      },
      events, checks, artifacts, redactions: [...redactions].sort(), assumptions: metadata.assumptions,
      limitations: metadata.limitations, portabilityBoundaries: metadata.portabilityBoundaries,
      reviewer: metadata.reviewer, reviewAfter: metadata.reviewAfter,
    });
    writeJson(join(temporary, 'manifest.json'), manifest);
    const semantic = semanticErrors(manifest, temporary);
    if (semantic.length) throw new Error(semantic.join('\n'));
    writeJson(join(temporary, 'verification.json'), {
      schemaVersion: 1, evidenceId: metadata.evidenceId, verified: true,
      checks: [...checks, { name: 'redaction review', passed: true, detail: manifest.redactions.join('; ') }],
    });
    const checksummed = ['manifest.json', 'verification.json', ...artifacts.map(({ path }) => path)].sort();
    const checksumText = checksummed.map((path) => `${sha256File(join(temporary, path)).slice(7)}  ${path}`).join('\n');
    writeFileSync(join(temporary, 'checksums.sha256'), `${checksumText}\n`, { encoding: 'utf8', mode: 0o644, flag: 'wx' });
    mkdirSync(dirname(output), { recursive: true });
    renameSync(temporary, output);
    return output;
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function bundleFiles(root: string, directory = root): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...bundleFiles(root, absolute));
    else if (entry.isFile()) files.push(relative(root, absolute).split(sep).join('/'));
  }
  return files.sort();
}

function checksumEntries(path: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean)) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match || !safeRelativePath.safeParse(match[2]).success) throw new Error(`invalid checksum line: ${line}`);
    if (entries.has(match[2])) throw new Error(`duplicate checksum path: ${match[2]}`);
    entries.set(match[2], `sha256:${match[1]}`);
  }
  return entries;
}

const residualSensitive = [
  /\b(?:token|password|secret|account|allocation)\s*[:=]\s*(?!\[REDACTED-)[^\s,"}]+/i,
  /\b(?:host|hostname|nodelist)\s*[:=]\s*(?!\[REDACTED-)[^\s,"}]+/i,
  /\/(?:home|users|scratch|work)\/(?!\[REDACTED-)[A-Za-z0-9._-]+/,
];

export function validateEvidenceBundle(bundleDirectory: string): EvidenceValidationReport {
  const checks: EvidenceValidationReport['checks'] = [];
  const errors: string[] = [];
  const check = (name: string, action: () => string) => {
    try { checks.push({ name, passed: true, detail: action() }); }
    catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      checks.push({ name, passed: false, detail }); errors.push(`${name}: ${detail}`);
    }
  };
  let manifest: EvidenceManifest | undefined;
  check('manifest schema', () => {
    manifest = evidenceManifestSchema.parse(JSON.parse(readFileSync(join(bundleDirectory, 'manifest.json'), 'utf8')));
    if (manifest.representativeEnvironment.publicName === 'Purdue Anvil' && manifest.representativeEnvironment.fallback) throw new Error('Anvil cannot be fallback evidence');
    if (manifest.representativeEnvironment.publicName === 'SDSC Expanse' && (!manifest.representativeEnvironment.fallback || !manifest.representativeEnvironment.primaryUnavailableReason)) {
      throw new Error('Expanse evidence requires fallback designation and primary-unavailable reason');
    }
    return `schemaVersion ${manifest.schemaVersion}`;
  });
  check('bundle checksums', () => {
    const entries = checksumEntries(join(bundleDirectory, 'checksums.sha256'));
    const expected = bundleFiles(bundleDirectory).filter((path) => path !== 'checksums.sha256');
    if (JSON.stringify([...entries.keys()].sort()) !== JSON.stringify(expected)) throw new Error('checksum inventory does not exactly match bundle files');
    for (const [path, expectedDigest] of entries) {
      if (sha256File(join(bundleDirectory, path)) !== expectedDigest) throw new Error(`checksum mismatch: ${path}`);
    }
    return `${entries.size} files verified`;
  });
  check('artifact inventory', () => {
    if (!manifest) throw new Error('manifest unavailable');
    for (const artifact of manifest.artifacts) {
      const absolute = resolve(bundleDirectory, artifact.path);
      if (!absolute.startsWith(`${resolve(bundleDirectory)}${sep}`) || !existsSync(absolute)) throw new Error(`missing or unsafe artifact ${artifact.path}`);
      if (sha256File(absolute) !== artifact.sha256) throw new Error(`artifact checksum mismatch: ${artifact.path}`);
    }
    return `${manifest.artifacts.length} artifacts verified`;
  });
  check('workflow semantics', () => {
    if (!manifest) throw new Error('manifest unavailable');
    const issues = semanticErrors(manifest, bundleDirectory);
    if (issues.length) throw new Error(issues.join('; '));
    return `${manifest.evidenceKind} invariants verified`;
  });
  check('redaction', () => {
    if (!manifest) throw new Error('manifest unavailable');
    for (const path of bundleFiles(bundleDirectory).filter((path) => path !== 'checksums.sha256')) {
      const content = readFileSync(join(bundleDirectory, path), 'utf8');
      const residual = residualSensitive.find((pattern) => pattern.test(content));
      if (residual) throw new Error(`possible sensitive value remains in ${path}`);
    }
    return manifest.redactions.join('; ');
  });
  return { valid: errors.length === 0, evidenceId: manifest?.evidenceId, kind: manifest?.evidenceKind, checks, errors };
}

export function validateApplicabilityAgainstManifest(record: ApplicabilityRecord, manifest: EvidenceManifest, root: string, now: string): string[] {
  const errors: string[] = [];
  const evidencePath = resolve(root, record.evidence.path);
  if (sha256File(evidencePath) !== record.evidence.integrity) errors.push(`${record.id}.evidence.integrity does not match manifest`);
  if (manifest.evidenceId !== record.evidence.id) errors.push(`${record.id}: evidence ID does not match manifest`);
  if (manifest.workflowId !== record.workflow_id) errors.push(`${record.id}: workflow ID does not match manifest`);
  if (manifest.workflowRevision !== record.workflow_revision) errors.push(`${record.id}: workflow revision does not match manifest`);
  if (manifest.run.containerDigest !== record.container_digest) errors.push(`${record.id}: container digest does not match manifest`);
  if (manifest.representativeEnvironment.publicName !== record.environment.public_name || manifest.representativeEnvironment.fallback !== record.environment.fallback) {
    errors.push(`${record.id}: representative environment or fallback designation does not match manifest`);
  }
  if (manifest.run.schedulerVersion !== record.scheduler.version || manifest.run.runtimeVersion !== record.runtime.version) errors.push(`${record.id}: scheduler/runtime versions do not match manifest`);
  if (manifest.run.submissionId !== record.submission_id) errors.push(`${record.id}: submission ID does not match manifest`);
  if (manifest.run.startedAt.slice(0, 10) !== record.execution_date) errors.push(`${record.id}: execution date does not match manifest`);
  if (manifest.run.terminalState !== record.result.terminal_state || manifest.run.exitCode !== record.result.exit_code) errors.push(`${record.id}: terminal result does not match manifest`);
  if (record.status === 'validated' && manifest.evidenceKind !== 'success') errors.push(`${record.id}: validated status requires success evidence`);
  if (record.status === 'failed' && manifest.evidenceKind === 'success') errors.push(`${record.id}: failed status cannot reference success evidence`);
  if (record.status === 'validated' && record.review_after < now) errors.push(`${record.id}: validated evidence is stale after ${record.review_after}`);
  if (record.review_after !== manifest.reviewAfter) errors.push(`${record.id}: review-after date does not match manifest`);
  return errors;
}

function parseFrontmatter(path: string): Record<string, unknown> | undefined {
  const source = readFileSync(path, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  return match ? parseYaml(match[1]) as Record<string, unknown> : undefined;
}

export function validateEvidenceRepository(root: string, now = new Date().toISOString().slice(0, 10)): string[] {
  const errors: string[] = [];
  const applicabilityDirectory = join(root, 'site/src/content/applicability');
  const records: ApplicabilityRecord[] = [];
  for (const name of readdirSync(applicabilityDirectory).filter((name) => /\.ya?ml$/.test(name)).sort()) {
    try { records.push(applicabilityRecordSchema.parse(parseYaml(readFileSync(join(applicabilityDirectory, name), 'utf8')))); }
    catch (error) { errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  const validRecordIds = new Set<string>();
  for (const record of records) {
    const evidencePath = resolve(root, record.evidence.path);
    if (record.environment.public_name === 'Purdue Anvil' && record.environment.fallback) errors.push(`${record.id}: Purdue Anvil cannot be marked fallback`);
    if (record.environment.public_name === 'SDSC Expanse' && !record.environment.fallback) errors.push(`${record.id}: SDSC Expanse must be marked fallback`);
    if (!existsSync(evidencePath)) { errors.push(`${record.id}: evidence path is missing: ${record.evidence.path}`); continue; }
    if (record.status === 'unvalidated') {
      if (sha256File(evidencePath) !== record.evidence.integrity) errors.push(`${record.id}: status evidence integrity mismatch`);
      continue;
    }
    if (basename(evidencePath) !== 'manifest.json') { errors.push(`${record.id}: ${record.status} status requires an immutable manifest.json`); continue; }
    const bundle = dirname(evidencePath);
    const report = validateEvidenceBundle(bundle);
    if (!report.valid) { errors.push(...report.errors.map((error) => `${record.id}: ${error}`)); continue; }
    const manifest = evidenceManifestSchema.parse(JSON.parse(readFileSync(evidencePath, 'utf8')));
    const applicabilityErrors = validateApplicabilityAgainstManifest(record, manifest, root, now);
    if (applicabilityErrors.length) errors.push(...applicabilityErrors); else validRecordIds.add(record.id);
  }
  const contentDirectory = join(root, 'site/src/content/content-items');
  for (const name of readdirSync(contentDirectory).filter((name) => /\.mdx?$/.test(name)).sort()) {
    const data = parseFrontmatter(join(contentDirectory, name));
    if (!data || !['runnable', 'hybrid'].includes(String(data.module_type))) continue;
    const status = String(data.validation_status ?? '');
    const ids = Array.isArray(data.applicability_records) ? data.applicability_records.map(String) : [];
    const linked = records.filter((record) => ids.includes(record.id));
    if (status === 'validated' && !linked.some((record) => record.status === 'validated' && validRecordIds.has(record.id))) {
      errors.push(`${name}: validated workflow has no current checksum-verified representative evidence`);
    }
    if (status === 'unvalidated' && linked.some((record) => record.status === 'validated')) {
      errors.push(`${name}: workflow status is unvalidated but links validated applicability`);
    }
    if (status === 'stale' && linked.every((record) => record.review_after >= now)) {
      errors.push(`${name}: stale workflow status has no stale applicability evidence`);
    }
  }
  return errors;
}