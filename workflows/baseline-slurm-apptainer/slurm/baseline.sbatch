#!/usr/bin/env bash
#SBATCH --job-name=bssw-baseline
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --time=00:10:00
#SBATCH --output=slurm-%j.out

set -Eeuo pipefail
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
WORKFLOW_ROOT=$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)
APPTAINER_CMD=${BSSW_APPTAINER_CMD:-apptainer}
SRUN_CMD=${BSSW_SRUN_CMD:-srun}
SLURM_VERSION_CMD=${BSSW_SLURM_VERSION_CMD:-scontrol}
KILL_CMD=${BSSW_KILL_CMD:-kill}
SHA256_CMD=${BSSW_SHA256_CMD:-sha256sum}
APP_ROOT=${BSSW_APP_ROOT:-/opt/bssw/bin}
WORKER_COUNT=${WORKER_COUNT:-2}
TASK_COUNT=${TASK_COUNT:-4}
READINESS_TIMEOUT=${READINESS_TIMEOUT:-30}
CLEANUP_TIMEOUT=${CLEANUP_TIMEOUT:-10}
INPUT_PATH=${INPUT_PATH:-${WORKFLOW_ROOT}/inputs/tasks.json}
EXPECTED_PATH=${EXPECTED_PATH:-${WORKFLOW_ROOT}/expected/results.json}
IMAGE_PATH=${IMAGE_PATH:-${WORKFLOW_ROOT}/container/baseline.sif}
INPUT_SHA256_FILE=${INPUT_SHA256_FILE:-${WORKFLOW_ROOT}/inputs/tasks.json.sha256}
IMAGE_SHA256_FILE=${IMAGE_SHA256_FILE:-${IMAGE_PATH}.sha256}
RUNTIME_DIR=""
DIAGNOSTIC_LOG=""
EVENT_LOG=""
RESULT_PATH=""
CHILDREN=()

emit_event() {
  local event=$1 code=${2:-}
  [[ -n "$EVENT_LOG" ]] || return 0
  if [[ -n "$code" ]]; then
    printf '{"event":"%s","at":"%s","diagnosticId":"%s"}\n' "$event" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$code" >> "$EVENT_LOG"
  else
    printf '{"event":"%s","at":"%s"}\n' "$event" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$EVENT_LOG"
  fi
}

emit_diagnostic() {
  local id=$1 message=$2
  local line
  printf -v line '{"diagnosticId":"%s","message":"%s","status":"failure"}' "$id" "$message"
  printf '%s\n' "$line" >&2
  if [[ -n "$DIAGNOSTIC_LOG" ]]; then printf '%s\n' "$line" >> "$DIAGNOSTIC_LOG"; fi
}

fail() {
  local id=$1 code=$2 message=$3
  if [[ -n "$RESULT_PATH" ]]; then rm -f -- "$RESULT_PATH"; fi
  emit_event "failure" "$id"
  emit_diagnostic "$id" "$message"
  exit "$code"
}

is_uint_range() {
  local value=$1 minimum=$2 maximum=$3
  [[ "$value" =~ ^[0-9]+$ ]] && (( 10#$value >= minimum && 10#$value <= maximum ))
}

digest_file() {
  local output
  output=$("$SHA256_CMD" "$1") || return 1
  output=${output%%[[:space:]]*}
  [[ "$output" =~ ^[0-9a-fA-F]{64}$ ]] || return 1
  printf '%s\n' "$output" | tr '[:upper:]' '[:lower:]'
}

container_exec() {
  "$APPTAINER_CMD" exec --cleanenv --bind "${RUNTIME_DIR}:/work" "$IMAGE_PATH" "$@"
}

step_exec() {
  "$SRUN_CMD" --exclusive --nodes=1 --ntasks=1 --cpus-per-task=1 "$@"
}

cleanup() {
  local rc=$? cleanup_failed=0 deadline pid alive
  set +u
  trap - EXIT TERM INT HUP
  for pid in "${CHILDREN[@]}"; do
    if "$KILL_CMD" -0 "$pid" 2>/dev/null; then
      "$KILL_CMD" -TERM "$pid" 2>/dev/null || cleanup_failed=1
    fi
  done
  deadline=$((SECONDS + CLEANUP_TIMEOUT))
  while (( SECONDS < deadline )); do
    alive=0
    for pid in "${CHILDREN[@]}"; do
      if "$KILL_CMD" -0 "$pid" 2>/dev/null; then alive=1; fi
    done
    (( alive == 0 )) && break
    sleep 0.1
  done
  for pid in "${CHILDREN[@]}"; do
    if "$KILL_CMD" -0 "$pid" 2>/dev/null; then
      "$KILL_CMD" -KILL "$pid" 2>/dev/null || cleanup_failed=1
    fi
    wait "$pid" 2>/dev/null || true
  done
  if (( cleanup_failed != 0 )); then
    [[ -n "$RESULT_PATH" ]] && rm -f -- "$RESULT_PATH"
    emit_diagnostic "BSSW-CLEANUP-CHILD" "bounded child cleanup failed"
    rc=79
  elif (( rc != 0 )) && [[ -n "$RESULT_PATH" ]]; then
    rm -f -- "$RESULT_PATH"
  fi
  exit "$rc"
}

on_signal() {
  emit_diagnostic "BSSW-CLEANUP-SIGNAL" "job received a termination signal"
  exit 78
}
trap cleanup EXIT
trap on_signal TERM INT HUP

[[ -n "${SLURM_JOB_ID:-}" && "$SLURM_JOB_ID" =~ ^[0-9]+([_.][0-9]+)?$ ]] || \
  fail "BSSW-PREQ-SLURM" 64 "a valid Slurm job context is required"
command -v "$SRUN_CMD" >/dev/null 2>&1 || \
  fail "BSSW-PREQ-SLURM" 64 "the Slurm step launcher is unavailable"
command -v "$APPTAINER_CMD" >/dev/null 2>&1 || \
  fail "BSSW-PREQ-APPTAINER" 65 "Apptainer is unavailable on the compute node"
command -v "$SHA256_CMD" >/dev/null 2>&1 || \
  fail "BSSW-PREQ-COMMAND" 66 "the configured SHA-256 command is unavailable"
is_uint_range "$WORKER_COUNT" 1 16 || \
  fail "BSSW-PREQ-VALUE" 67 "WORKER_COUNT must be an integer in 1..16"
is_uint_range "$TASK_COUNT" 1 256 || \
  fail "BSSW-PREQ-VALUE" 67 "TASK_COUNT must be an integer in 1..256"
is_uint_range "$READINESS_TIMEOUT" 1 300 || \
  fail "BSSW-PREQ-VALUE" 67 "READINESS_TIMEOUT must be an integer in 1..300"
is_uint_range "$CLEANUP_TIMEOUT" 1 60 || \
  fail "BSSW-PREQ-VALUE" 67 "CLEANUP_TIMEOUT must be an integer in 1..60"
[[ -f "$IMAGE_PATH" && ! -L "$IMAGE_PATH" ]] || \
  fail "BSSW-PREQ-IMAGE" 68 "the configured immutable image is missing or unsafe"
[[ -f "$INPUT_PATH" && ! -L "$INPUT_PATH" && -f "$EXPECTED_PATH" ]] || \
  fail "BSSW-PREQ-INPUT" 69 "the input or expected-output document is missing or unsafe"
[[ -f "$INPUT_SHA256_FILE" && -f "$IMAGE_SHA256_FILE" ]] || \
  fail "BSSW-PREQ-INPUT" 69 "required checksum metadata is missing"
read -r EXPECTED_INPUT_SHA _ < "$INPUT_SHA256_FILE" || \
  fail "BSSW-PREQ-INPUT" 69 "input checksum metadata is unreadable"
read -r EXPECTED_IMAGE_SHA _ < "$IMAGE_SHA256_FILE" || \
  fail "BSSW-PREQ-IMAGE" 68 "image checksum metadata is unreadable"
[[ "$EXPECTED_INPUT_SHA" =~ ^[0-9a-fA-F]{64}$ ]] || \
  fail "BSSW-PREQ-INPUT" 69 "input checksum metadata is invalid"
[[ "$EXPECTED_IMAGE_SHA" =~ ^[0-9a-fA-F]{64}$ ]] || \
  fail "BSSW-PREQ-IMAGE" 68 "image checksum metadata is invalid"
EXPECTED_INPUT_SHA=$(printf '%s' "$EXPECTED_INPUT_SHA" | tr '[:upper:]' '[:lower:]')
EXPECTED_IMAGE_SHA=$(printf '%s' "$EXPECTED_IMAGE_SHA" | tr '[:upper:]' '[:lower:]')
ACTUAL_INPUT_SHA=$(digest_file "$INPUT_PATH") || \
  fail "BSSW-INTEGRITY-INPUT" 70 "input SHA-256 calculation failed"
[[ "$ACTUAL_INPUT_SHA" == "$EXPECTED_INPUT_SHA" ]] || \
  fail "BSSW-INTEGRITY-INPUT" 70 "input SHA-256 does not match the immutable record"
ACTUAL_IMAGE_SHA=$(digest_file "$IMAGE_PATH") || \
  fail "BSSW-INTEGRITY-IMAGE" 71 "image SHA-256 calculation failed"
[[ "$ACTUAL_IMAGE_SHA" == "$EXPECTED_IMAGE_SHA" ]] || \
  fail "BSSW-INTEGRITY-IMAGE" 71 "image SHA-256 does not match the immutable record"

if [[ -n "${BSSW_SCRATCH_ROOT:-}" ]]; then
  SCRATCH_ROOT=$BSSW_SCRATCH_ROOT
elif [[ -n "${SLURM_TMPDIR:-}" ]]; then
  SCRATCH_ROOT=$SLURM_TMPDIR
else
  SCRATCH_ROOT=${TMPDIR:-/tmp}
fi
[[ -d "$SCRATCH_ROOT" && -w "$SCRATCH_ROOT" && ! -L "$SCRATCH_ROOT" ]] || \
  fail "BSSW-PREQ-STORAGE" 72 "the selected scratch root is not a safe writable directory"
RUNTIME_DIR=${SCRATCH_ROOT%/}/bssw-${SLURM_JOB_ID}
[[ ! -e "$RUNTIME_DIR" ]] || \
  fail "BSSW-PREQ-STORAGE" 72 "the job-scoped runtime directory already exists"
mkdir -m 700 -- "$RUNTIME_DIR" || \
  fail "BSSW-PREQ-STORAGE" 72 "the job-scoped runtime directory could not be created"
mkdir -m 700 -- "$RUNTIME_DIR/logs" || \
  fail "BSSW-PREQ-STORAGE" 72 "the job log directory could not be created"
DIAGNOSTIC_LOG=$RUNTIME_DIR/logs/diagnostic.log
EVENT_LOG=$RUNTIME_DIR/events.jsonl
RESULT_PATH=$RUNTIME_DIR/result.json
install -m 600 -- "$INPUT_PATH" "$RUNTIME_DIR/input.json"
install -m 600 -- "$EXPECTED_PATH" "$RUNTIME_DIR/expected.json"
[[ "$(digest_file "$RUNTIME_DIR/input.json")" == "$ACTUAL_INPUT_SHA" ]] || \
  fail "BSSW-INTEGRITY-INPUT" 70 "the job-scoped input copy failed integrity verification"
{
  printf 'job_id=%s\n' "$SLURM_JOB_ID"
  printf 'slurm='; "$SLURM_VERSION_CMD" --version 2>&1 || printf 'unavailable\n'
  printf 'apptainer='; "$APPTAINER_CMD" --version 2>&1
  printf 'image_sha256=%s\ninput_sha256=%s\n' "$ACTUAL_IMAGE_SHA" "$ACTUAL_INPUT_SHA"
} > "$RUNTIME_DIR/versions.txt"
emit_event "job-start"

container_exec python3 "$APP_ROOT/validate_input.py" \
  --input /work/input.json --task-count "$TASK_COUNT" \
  > "$RUNTIME_DIR/logs/input-validation.log" 2>&1 || \
  fail "BSSW-PREQ-INPUT" 73 "the inert input document failed schema or bounds validation"

step_exec "$APPTAINER_CMD" exec --cleanenv --bind "${RUNTIME_DIR}:/work" "$IMAGE_PATH" \
  python3 "$APP_ROOT/coordinator.py" --input /work/input.json \
  --results /work/results.json --endpoint-file /work/endpoint.json \
  > "$RUNTIME_DIR/logs/coordinator.log" 2>&1 &
COORDINATOR_PID=$!
CHILDREN+=("$COORDINATOR_PID")
emit_event "coordinator-start"

ENDPOINT_DEADLINE=$((SECONDS + READINESS_TIMEOUT))
while [[ ! -s "$RUNTIME_DIR/endpoint.json" ]]; do
  "$KILL_CMD" -0 "$COORDINATOR_PID" 2>/dev/null || \
    fail "BSSW-COORDINATOR-EXIT" 74 "the coordinator exited before publishing its endpoint"
  (( SECONDS < ENDPOINT_DEADLINE )) || \
    fail "BSSW-READY-TIMEOUT" 75 "the coordinator did not become semantically ready before the deadline"
  sleep 0.05
done
ENDPOINT=$(container_exec python3 -c \
  'import json; print(json.load(open("/work/endpoint.json", encoding="utf-8"))["endpoint"])') || \
  fail "BSSW-COORDINATOR-EXIT" 74 "the coordinator endpoint record is invalid"
container_exec python3 "$APP_ROOT/readiness.py" --endpoint "$ENDPOINT" \
  --task-count "$TASK_COUNT" --timeout "$READINESS_TIMEOUT" \
  > "$RUNTIME_DIR/logs/readiness.log" 2>&1 || \
  fail "BSSW-READY-TIMEOUT" 75 "the coordinator did not become semantically ready before the deadline"
"$KILL_CMD" -0 "$COORDINATOR_PID" 2>/dev/null || \
  fail "BSSW-COORDINATOR-EXIT" 74 "the coordinator exited immediately after readiness"
emit_event "coordinator-ready"

WORKER_PIDS=()
for ((index=1; index<=10#$WORKER_COUNT; index++)); do
  printf -v worker_id 'worker-%02d' "$index"
  step_exec "$APPTAINER_CMD" exec --cleanenv --bind "${RUNTIME_DIR}:/work" "$IMAGE_PATH" \
    python3 "$APP_ROOT/worker.py" --endpoint "$ENDPOINT" --worker-id "$worker_id" \
    --max-wait "$READINESS_TIMEOUT" > "$RUNTIME_DIR/logs/${worker_id}.log" 2>&1 &
  worker_pid=$!
  CHILDREN+=("$worker_pid")
  WORKER_PIDS+=("$worker_pid")
  printf '{"event":"worker-start","workerId":"%s"}\n' "$worker_id" >> "$RUNTIME_DIR/events.jsonl"
done
for worker_pid in "${WORKER_PIDS[@]}"; do
  if ! wait "$worker_pid"; then
    fail "BSSW-WORKER-EXIT" 76 "at least one exclusive worker step failed"
  fi
done
"$KILL_CMD" -0 "$COORDINATOR_PID" 2>/dev/null || \
  fail "BSSW-COORDINATOR-EXIT" 74 "the coordinator exited before result verification"
container_exec python3 "$APP_ROOT/verify.py" --input /work/input.json \
  --results /work/results.json --expected /work/expected.json --output /work/result.json \
  > "$RUNTIME_DIR/logs/verification.log" 2>&1 || \
  fail "BSSW-VERIFY-RESULT" 77 "result schema, count, uniqueness, or expected content verification failed"
[[ -s "$RESULT_PATH" ]] || \
  fail "BSSW-VERIFY-RESULT" 77 "the verifier did not atomically create the success result"
printf '{"event":"verification-success"}\n' >> "$RUNTIME_DIR/events.jsonl"
printf 'BSSW workflow completed: result is in the job-scoped runtime directory.\n'
