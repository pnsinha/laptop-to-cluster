import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { currentReleaseVersion } from './release';

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
  readmeUrl: string;
  primarySourceUrl: string;
  excerpts: SourceExcerpt[];
}

const WORKFLOW_ID = 'module-2-baseline';
const RELEASE = 'v0.1.0';
const REPOSITORY = 'https://github.com/pnsinha/laptop-to-cluster';
const WORKFLOW_ROOT = resolve(process.cwd(), 'workflows/baseline-slurm-apptainer');
/* The package and README links follow the release being published, like the @release links in content. The excerpt links below stay pinned to the tag the line numbers come from. */
const CURRENT_RELEASE = currentReleaseVersion();
const PACKAGE_URL = `${REPOSITORY}/tree/${CURRENT_RELEASE}/workflows/baseline-slurm-apptainer`;
const README_URL = `${REPOSITORY}/blob/${CURRENT_RELEASE}/workflows/baseline-slurm-apptainer/README.md`;

/* Each excerpt pairs a code snippet with a link to the release-pinned line
   range it comes from on GitHub. The baseline.sbatch excerpts are the script's
   own lines, in order, from the tagged release: a "# …" line marks lines left
   out, and nothing is rewritten. validateLineRanges() enforces that at build
   time, and a unit test checks the same against the tag. The Python excerpts
   are shortened by hand. Readers who need the exact, executable files follow
   the per-excerpt link or the package link above. */
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
    annotation: 'One allocation claims one node and a bounded amount of CPU and time. The settings below the directives have defaults that you can override when you submit; a “# …” line marks lines left out.',
    code: `#!/usr/bin/env bash
#SBATCH --job-name=bssw-baseline
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --time=00:10:00
#SBATCH --output=slurm-%j.out

set -Eeuo pipefail
# …
WORKER_COUNT=\${WORKER_COUNT:-2}
TASK_COUNT=\${TASK_COUNT:-4}
READINESS_TIMEOUT=\${READINESS_TIMEOUT:-30}
CLEANUP_TIMEOUT=\${CLEANUP_TIMEOUT:-10}
INPUT_PATH=\${INPUT_PATH:-\${WORKFLOW_ROOT}/inputs/tasks.json}
EXPECTED_PATH=\${EXPECTED_PATH:-\${WORKFLOW_ROOT}/expected/results.json}
IMAGE_PATH=\${IMAGE_PATH:-\${WORKFLOW_ROOT}/container/baseline.sif}
INPUT_SHA256_FILE=\${INPUT_SHA256_FILE:-\${WORKFLOW_ROOT}/inputs/tasks.json.sha256}
IMAGE_SHA256_FILE=\${IMAGE_SHA256_FILE:-\${IMAGE_PATH}.sha256}`,
  },
  {
    id: 'sbatch-readiness-gate',
    title: 'Start the coordinator, then wait until it is ready',
    sourcePath: 'slurm/baseline.sbatch',
    lineStart: 200, lineEnd: 225, language: 'bash',
    annotation: 'The coordinator starts as its own job step, in the background. Nothing else starts until its endpoint file appears within the timeout and the readiness probe confirms it can actually serve, not just that the process exists. The script defines step_exec (run a command as a job step) and container_exec (run it in the container) earlier.',
    code: `step_exec "$APPTAINER_CMD" exec --cleanenv --bind "\${RUNTIME_DIR}:/work" "$IMAGE_PATH" \\
  python3 "$APP_ROOT/coordinator.py" --input /work/input.json \\
  --results /work/results.json --endpoint-file /work/endpoint.json \\
  > "$RUNTIME_DIR/logs/coordinator.log" 2>&1 &
COORDINATOR_PID=$!
CHILDREN+=("$COORDINATOR_PID")
emit_event "coordinator-start"

ENDPOINT_DEADLINE=$((SECONDS + READINESS_TIMEOUT))
while [[ ! -s "$RUNTIME_DIR/endpoint.json" ]]; do
  "$KILL_CMD" -0 "$COORDINATOR_PID" 2>/dev/null || \\
    fail "BSSW-COORDINATOR-EXIT" 74 "the coordinator exited before publishing its endpoint"
  (( SECONDS < ENDPOINT_DEADLINE )) || \\
    fail "BSSW-READY-TIMEOUT" 75 "the coordinator did not become semantically ready before the deadline"
  sleep 0.05
done
ENDPOINT=$(container_exec python3 -c \\
  'import json; print(json.load(open("/work/endpoint.json", encoding="utf-8"))["endpoint"])') || \\
  fail "BSSW-COORDINATOR-EXIT" 74 "the coordinator endpoint record is invalid"
container_exec python3 "$APP_ROOT/readiness.py" --endpoint "$ENDPOINT" \\
  --task-count "$TASK_COUNT" --timeout "$READINESS_TIMEOUT" \\
  > "$RUNTIME_DIR/logs/readiness.log" 2>&1 || \\
  fail "BSSW-READY-TIMEOUT" 75 "the coordinator did not become semantically ready before the deadline"
"$KILL_CMD" -0 "$COORDINATOR_PID" 2>/dev/null || \\
  fail "BSSW-COORDINATOR-EXIT" 74 "the coordinator exited immediately after readiness"
emit_event "coordinator-ready"`,
  },
  {
    id: 'sbatch-worker-verification',
    title: 'Run workers, then verify results before claiming success',
    sourcePath: 'slurm/baseline.sbatch',
    lineStart: 227, lineEnd: 252, language: 'bash',
    annotation: 'Each worker is its own job step, started in the background. The script waits for each worker, never for the coordinator, and stops with a named error if one fails. Only after every worker finishes does the verifier check the results: a completed process is not yet a successful result.',
    code: `WORKER_PIDS=()
for ((index=1; index<=10#$WORKER_COUNT; index++)); do
  printf -v worker_id 'worker-%02d' "$index"
  step_exec "$APPTAINER_CMD" exec --cleanenv --bind "\${RUNTIME_DIR}:/work" "$IMAGE_PATH" \\
    python3 "$APP_ROOT/worker.py" --endpoint "$ENDPOINT" --worker-id "$worker_id" \\
    --max-wait "$READINESS_TIMEOUT" > "$RUNTIME_DIR/logs/\${worker_id}.log" 2>&1 &
  worker_pid=$!
  CHILDREN+=("$worker_pid")
  WORKER_PIDS+=("$worker_pid")
  emit_event "worker-start"
done
for worker_pid in "\${WORKER_PIDS[@]}"; do
  if ! wait "$worker_pid"; then
    fail "BSSW-WORKER-EXIT" 76 "at least one exclusive worker step failed"
  fi
done
"$KILL_CMD" -0 "$COORDINATOR_PID" 2>/dev/null || \\
  fail "BSSW-COORDINATOR-EXIT" 74 "the coordinator exited before result verification"
container_exec python3 "$APP_ROOT/verify.py" --input /work/input.json \\
  --results /work/results.json --expected /work/expected.json --output /work/result.json \\
  > "$RUNTIME_DIR/logs/verification.log" 2>&1 || \\
  fail "BSSW-VERIFY-RESULT" 77 "result schema, count, uniqueness, or expected content verification failed"
[[ -s "$RESULT_PATH" ]] || \\
  fail "BSSW-VERIFY-RESULT" 77 "the verifier did not atomically create the success result"
emit_event "verification-success"
printf 'BSSW workflow completed: result is in the job-scoped runtime directory.\\n'`,
  },
  {
    id: 'readiness-contract',
    title: 'Readiness is a bounded health contract, not a sleep',
    sourcePath: 'bin/readiness.py',
    lineStart: 17, lineEnd: 38, language: 'python',
    annotation: 'The probe polls the coordinator /health endpoint on loopback with a hard deadline. It passes only when the coordinator reports the expected schema and task count—so workers never start against a half-initialized service.',
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
    title: 'What the coordinator reports as “ready”',
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
    title: 'The verifier is the only thing that can write “success”',
    sourcePath: 'bin/verify.py',
    lineStart: 22, lineEnd: 70, language: 'python',
    annotation: 'The verifier checks that every task produced exactly one result, that results are unique, and that they match the expected outputs. Only then does it atomically write the success marker—the single artifact a completed run is judged by.',
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

/* Returns the problems in an excerpt that claims to be the script's own lines:
   every shown line must equal the source line at the same position inside the
   labelled range, in order. A "# …" line (U+2026) is the only permitted gap. */
export const ELISION_LINE = '# …';
export function verbatimExcerptIssues(code: string, sourceLines: readonly string[], lineStart: number, lineEnd: number): string[] {
  const issues: string[] = [];
  let next = lineStart - 1;
  let skipping = false;
  for (const line of code.split('\n')) {
    if (line === ELISION_LINE) { skipping = true; continue; }
    let found = next;
    if (skipping) { while (found < lineEnd && sourceLines[found] !== line) found += 1; }
    if (found >= lineEnd || sourceLines[found] !== line) { issues.push(`not the source line at or after ${next + 1}: ${line}`); break; }
    next = found + 1;
    skipping = false;
  }
  if (!issues.length && !skipping && next !== lineEnd) issues.push(`ends at line ${next}, but its label says ${lineEnd}`);
  return issues;
}

/* Validate that each excerpt's line range points at a real span in the
   pinned source, and that the baseline.sbatch excerpts are verbatim lines. */
function validateLineRanges(): void {
  for (const excerpt of excerpts) {
    const localPath = resolve(WORKFLOW_ROOT, excerpt.sourcePath);
    const source = readFileSync(localPath, 'utf8');
    const lines = source.split(/\r?\n/);
    if (excerpt.lineStart < 1 || excerpt.lineEnd > lines.length || excerpt.lineStart > excerpt.lineEnd) {
      throw new Error(`${excerpt.sourcePath}: teaching-excerpt line range ${excerpt.lineStart}-${excerpt.lineEnd} is out of bounds (file has ${lines.length} lines)`);
    }
    if (excerpt.sourcePath.endsWith('.sbatch')) {
      const issues = verbatimExcerptIssues(excerpt.code, lines, excerpt.lineStart, excerpt.lineEnd);
      if (issues.length) throw new Error(`${excerpt.id}: excerpt is not the script's own lines (${issues.join('; ')})`);
    }
  }
}

validateLineRanges();

export const IMPLEMENTATION_REFERENCE: ImplementationReference = {
  workflowId: WORKFLOW_ID,
  release: RELEASE,
  packageUrl: PACKAGE_URL,
  readmeUrl: README_URL,
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
};
