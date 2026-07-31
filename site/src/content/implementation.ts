import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type ImplementationLanguage = 'bash' | 'python' | 'json';

export interface SourceExcerpt {
  id: string;
  title: string;
  sourcePath: string;
  release: string;
  lineStart: number;
  lineEnd: number;
  sourceUrl: string;
  integrity: `sha256:${string}`;
  language: ImplementationLanguage;
  code: string;
  annotation: string;
}

export interface ImplementationReference {
  workflowId: string;
  release: string;
  packageUrl: string;
  primarySourceUrl: string;
  excerpts: SourceExcerpt[];
  expectedOutput: string;
}

type SourceDefinition = Omit<SourceExcerpt, 'release' | 'sourceUrl' | 'code' | 'integrity'> & {
  expectedIntegrity: `sha256:${string}`;
};

const WORKFLOW_ID = 'module-2-baseline';
const RELEASE = 'v0.1.0';
const REPOSITORY = 'https://github.com/pnsinha/laptop-to-cluster';
const WORKFLOW_ROOT = resolve(process.cwd(), 'workflows/baseline-slurm-apptainer');
const PACKAGE_URL = `${REPOSITORY}/tree/${RELEASE}/workflows/baseline-slurm-apptainer`;

const definitions: readonly SourceDefinition[] = [
  {
    id: 'sbatch-configuration',
    title: 'Scheduler submission and immutable inputs',
    sourcePath: 'slurm/baseline.sbatch', lineStart: 1, lineEnd: 28, language: 'bash',
    annotation: 'Adapt only the scheduler resource lines and approved input locations for the target center.',
    expectedIntegrity: 'sha256:890b68266320c1a3f6863d3b53a59aba788f374dc558c797d3658a84e7582a38',
  },
  {
    id: 'sbatch-readiness-gate',
    title: 'Coordinator startup and bounded readiness',
    sourcePath: 'slurm/baseline.sbatch', lineStart: 200, lineEnd: 225, language: 'bash',
    annotation: 'The worker steps cannot start until the coordinator publishes a loopback endpoint and the semantic probe passes.',
    expectedIntegrity: 'sha256:890b68266320c1a3f6863d3b53a59aba788f374dc558c797d3658a84e7582a38',
  },
  {
    id: 'sbatch-worker-verification',
    title: 'Workers, verification, and the success marker',
    sourcePath: 'slurm/baseline.sbatch', lineStart: 227, lineEnd: 252, language: 'bash',
    annotation: 'Workers run as exclusive steps; only the verifier can create the final success result after every invariant passes.',
    expectedIntegrity: 'sha256:890b68266320c1a3f6863d3b53a59aba788f374dc558c797d3658a84e7582a38',
  },
  {
    id: 'readiness-contract',
    title: 'Semantic readiness probe',
    sourcePath: 'bin/readiness.py', lineStart: 17, lineEnd: 38, language: 'python',
    annotation: 'Readiness is a bounded HTTP loopback health contract, not a fixed sleep or an unbounded retry.',
    expectedIntegrity: 'sha256:c55b11a45e509d76862300e48984aa47deede085699d3a410a44448e0503b815',
  },
  {
    id: 'coordinator-health',
    title: 'Coordinator health response',
    sourcePath: 'bin/coordinator.py', lineStart: 24, lineEnd: 37, language: 'python',
    annotation: 'The coordinator reports the schema version and task count that the readiness probe verifies before workers claim work.',
    expectedIntegrity: 'sha256:dd4e1c797058d2cf2a943cad20702b12997bcda8cc4ec44a19c1b98196c7bad0',
  },
  {
    id: 'result-verification',
    title: 'Result integrity and atomic success output',
    sourcePath: 'bin/verify.py', lineStart: 22, lineEnd: 70, language: 'python',
    annotation: 'The verifier checks schema, count, uniqueness, expected content, and digests before atomically writing status: success.',
    expectedIntegrity: 'sha256:c4769c27150c82e25fca2d30b0a07d792c1ef64be79587b6023aa688e8d0fedf',
  },
];

function digest(source: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(source).digest('hex')}`;
}

function loadExcerpt(definition: SourceDefinition): SourceExcerpt {
  const localPath = resolve(WORKFLOW_ROOT, definition.sourcePath);
  const source = readFileSync(localPath, 'utf8');
  const integrity = digest(source);
  if (integrity !== definition.expectedIntegrity) {
    throw new Error(`${definition.sourcePath}: release-pinned source integrity mismatch`);
  }
  const lines = source.split(/\r?\n/);
  if (definition.lineStart < 1 || definition.lineEnd > lines.length || definition.lineStart > definition.lineEnd) {
    throw new Error(`${definition.sourcePath}: invalid source excerpt line range`);
  }
  const sourceUrl = `${REPOSITORY}/blob/${RELEASE}/workflows/baseline-slurm-apptainer/${definition.sourcePath}#L${definition.lineStart}-L${definition.lineEnd}`;
  return {
    id: definition.id,
    title: definition.title,
    sourcePath: `workflows/baseline-slurm-apptainer/${definition.sourcePath}`,
    release: RELEASE,
    lineStart: definition.lineStart,
    lineEnd: definition.lineEnd,
    sourceUrl,
    integrity,
    language: definition.language,
    code: lines.slice(definition.lineStart - 1, definition.lineEnd).join('\n'),
    annotation: definition.annotation,
  };
}

const expectedResultsPath = resolve(WORKFLOW_ROOT, 'expected/results.json');
const expectedResults = JSON.parse(readFileSync(expectedResultsPath, 'utf8')) as {
  schemaVersion: number;
  results: Array<Record<string, string>>;
};
const expectedOutput = JSON.stringify({
  schemaVersion: expectedResults.schemaVersion,
  status: 'success',
  taskCount: expectedResults.results.length,
  results: expectedResults.results,
}, null, 2);

export const IMPLEMENTATION_REFERENCE: ImplementationReference = {
  workflowId: WORKFLOW_ID,
  release: RELEASE,
  packageUrl: PACKAGE_URL,
  primarySourceUrl: `${REPOSITORY}/blob/${RELEASE}/workflows/baseline-slurm-apptainer/slurm/baseline.sbatch`,
  excerpts: definitions.map(loadExcerpt),
  expectedOutput,
};
