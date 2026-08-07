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

const WORKFLOW_ID = 'module-2-baseline';
const RELEASE = 'v0.1.0';
const REPOSITORY = 'https://github.com/pnsinha/laptop-to-cluster';
const WORKFLOW_ROOT = resolve(process.cwd(), 'workflows/baseline-slurm-apptainer');
const PACKAGE_URL = `${REPOSITORY}/tree/${RELEASE}/workflows/baseline-slurm-apptainer`;

/* Each excerpt pairs a purpose-written teaching snippet (the `code` a learner
   reads) with a link to the release-pinned line range it summarizes on GitHub
   (the real, verified source). The snippets are authored, not verbatim slices:
   they show only the commands and control flow that matter for understanding
   the pattern, with the defensive integrity machinery (digest variables,
   bounds checks, error-code plumbing) elided. Readers who need the exact,
   executable script follow the per-excerpt link or the package link above. */
interface TeachingExcerpt {
  id: string;
  title: string;
  sourcePath: string;
  lineStart: number;
  lineEnd: number;
  language: ImplementationLanguage;
  code: string;
  annotation: string;
}

const excerpts: readonly TeachingExcerpt[] = [
  {
    id: 'sbatch-configuration',
    title: 'Scheduler submission and the resources it claims',
    sourcePath: 'slurm/baseline.sbatch',
    lineStart: 1, lineEnd: 28, language: 'bash',
    annotation: 'One allocation claims one node and a bounded amount of CPU and time. These are the only lines that change between centers.',
    code: `#!/usr/bin/env bash
#SBATCH --job-name=bssw-baseline
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --time=00:10:00
#SBATCH --output=slurm-%j.out

set -Eeuo pipefail

WORKER_COUNT=\${WORKER_COUNT:-2}
TASK_COUNT=\${TASK_COUNT:-4}
READINESS_TIMEOUT=\${READINESS_TIMEOUT:-30}
IMAGE_PATH=\${IMAGE_PATH:-\${WORKFLOW_ROOT}/container/baseline.sif}`,
  },
  {
    id: 'sbatch-readiness-gate',
    title: 'Start the coordinator, then wait until it is ready',
    sourcePath: 'slurm/baseline.sbatch',
    lineStart: 200, lineEnd: 225, language: 'bash',
    annotation: 'The coordinator is launched inside the container on loopback. Nothing else starts until the readiness probe confirms it can actually serve — not just that the process exists.',
    code: `# Launch the coordinator on loopback inside the allocation.
apptainer exec --cleanenv --bind "\${RUNTIME_DIR}:/work" "\${IMAGE_PATH}" \\
  python3 "\${APP_ROOT}/coordinator.py" \\
  --input /work/input.json --results /work/results.json &

# Wait for it to publish its loopback endpoint.
while [[ ! -s "\${RUNTIME_DIR}/endpoint.json" ]]; do
  sleep 0.05
done

# Run the semantic readiness probe (bounded HTTP /health contract).
ENDPOINT=$(cat "\${RUNTIME_DIR}/endpoint.json" | python3 -c \\
  'import json,sys; print(json.load(sys.stdin)["endpoint"])')
python3 "\${APP_ROOT}/readiness.py" \\
  --endpoint "\${ENDPOINT}" --task-count "\${TASK_COUNT}" \\
  --timeout "\${READINESS_TIMEOUT}"`,
  },
  {
    id: 'sbatch-worker-verification',
    title: 'Run workers, then verify results before claiming success',
    sourcePath: 'slurm/baseline.sbatch',
    lineStart: 227, lineEnd: 252, language: 'bash',
    annotation: 'Workers pull work from the coordinator over loopback. Only after every worker finishes does the verifier check the results — a completed process is not yet a successful result.',
    code: `# Start one exclusive step per worker.
for ((i=1; i<=WORKER_COUNT; i++)); do
  printf -v worker_id 'worker-%02d' "\$i"
  srun apptainer exec --bind "\${RUNTIME_DIR}:/work" "\${IMAGE_PATH}" \\
    python3 "\${APP_ROOT}/worker.py" \\
    --endpoint "\${ENDPOINT}" --worker-id "\${worker_id}" &
done
wait

# Verify: schema, count, uniqueness, and expected content.
apptainer exec --bind "\${RUNTIME_DIR}:/work" "\${IMAGE_PATH}" \\
  python3 "\${APP_ROOT}/verify.py" \\
  --input /work/input.json --results /work/results.json \\
  --expected /work/expected.json --output /work/result.json

echo "BSSW workflow completed: result is in the runtime directory."`,
  },
  {
    id: 'readiness-contract',
    title: 'Readiness is a bounded health contract, not a sleep',
    sourcePath: 'bin/readiness.py',
    lineStart: 17, lineEnd: 38, language: 'python',
    annotation: 'The probe polls the coordinator /health endpoint on loopback with a hard deadline. It passes only when the coordinator reports the expected schema and task count — so workers never start against a half-initialized service.',
    code: `deadline = time.monotonic() + args.timeout
while time.monotonic() < deadline:
    try:
        with urllib.request.urlopen(f"{args.endpoint}/health") as response:
            health = json.load(response)
        if response.status == 200 and health == {
            "status": "ready",
            "schemaVersion": 1,
            "taskCount": args.task_count,
        }:
            raise SystemExit(0)   # ready
    except (OSError, ValueError, urllib.error.URLError):
        pass
    time.sleep(min(args.interval, deadline - time.monotonic()))
raise SystemExit(24)   # timed out`,
  },
  {
    id: 'coordinator-health',
    title: 'What the coordinator reports as "ready"',
    sourcePath: 'bin/coordinator.py',
    lineStart: 24, lineEnd: 37, language: 'python',
    annotation: 'The /health response is the contract the readiness probe checks. Reporting taskCount means the coordinator has parsed its input and has work to hand out before any worker asks.',
    code: `def health(self) -> dict:
    return {
        "status": "ready",
        "schemaVersion": 1,
        "taskCount": len(self.tasks),
    }

def claim(self) -> dict:
    # A worker asks for work; the coordinator hands out one task
    # or reports that all tasks are done (or that more may arrive).
    if self.pending:
        task_id = self.pending.popleft()
        return {"status": "task", "task": self.tasks[task_id]}
    status = "done" if len(self.results) == len(self.tasks) else "wait"
    return {"status": status}`,
  },
  {
    id: 'result-verification',
    title: 'The verifier is the only thing that can write "success"',
    sourcePath: 'bin/verify.py',
    lineStart: 22, lineEnd: 70, language: 'python',
    annotation: 'The verifier checks that every task produced exactly one result, that results are unique, and that they match the expected outputs. Only then does it atomically write the success marker — the single artifact a completed run is judged by.',
    code: `# Load tasks, actual results, and the expected results.
tasks = load_tasks(args.input)
actual = json.load(open(args.results))["results"]
expected = json.load(open(args.expected))["results"]

seen = set()
for result in actual:
    if result["taskId"] in seen:
        raise ValueError("duplicate task id")
    if result["taskId"] not in {e["taskId"] for e in expected}:
        raise ValueError("unexpected task id")
    seen.add(result["taskId"])

# Every task must be covered exactly once.
if seen != {task["id"] for task in tasks}:
    raise ValueError("results do not cover each task exactly once")

# Atomically write the success marker.
success = {
    "schemaVersion": 1,
    "status": "success",
    "taskCount": len(tasks),
    "results": sorted(actual, key=lambda r: r["taskId"]),
}
atomic_json(args.output, success)`,
  },
];

function excerptSourceUrl(path: string, start: number, end: number): string {
  return `${REPOSITORY}/blob/${RELEASE}/workflows/baseline-slurm-apptainer/${path}#L${start}-L${end}`;
}

/* Validate that each excerpt's line range points at a real span in the
   pinned source. This keeps the GitHub links honest without forcing the
   displayed code to be a verbatim slice. */
function validateLineRanges(): void {
  for (const excerpt of excerpts) {
    const localPath = resolve(WORKFLOW_ROOT, excerpt.sourcePath);
    const source = readFileSync(localPath, 'utf8');
    const lines = source.split(/\r?\n/);
    if (excerpt.lineStart < 1 || excerpt.lineEnd > lines.length || excerpt.lineStart > excerpt.lineEnd) {
      throw new Error(`${excerpt.sourcePath}: teaching-excerpt line range ${excerpt.lineStart}-${excerpt.lineEnd} is out of bounds (file has ${lines.length} lines)`);
    }
  }
}

validateLineRanges();

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
  excerpts: excerpts.map((excerpt) => ({
    id: excerpt.id,
    title: excerpt.title,
    sourcePath: `workflows/baseline-slurm-apptainer/${excerpt.sourcePath}`,
    release: RELEASE,
    lineStart: excerpt.lineStart,
    lineEnd: excerpt.lineEnd,
    sourceUrl: excerptSourceUrl(excerpt.sourcePath, excerpt.lineStart, excerpt.lineEnd),
    language: excerpt.language,
    code: excerpt.code,
    annotation: excerpt.annotation,
  })),
  expectedOutput,
};
