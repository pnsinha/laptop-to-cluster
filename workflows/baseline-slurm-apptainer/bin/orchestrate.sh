#!/bin/bash
# orchestrate.sh -- the HPC analogue of `docker compose up`.
#
# Launches the reference workflow's services as containerized processes inside a
# single Slurm allocation:
#
#   dashboard  (long-running service)  -> readiness gate -> producer -> workers
#
# Compose construct          Translation here
# -------------------------  ---------------------------------------------
# service                    background process under apptainer exec
# build: ./services/x        prebuilt x.sif (see build_images.sh)
# depends_on + healthcheck   wait_for_port before dependents start
# named volume               --bind of job-scoped scratch at /data
# ports:                     port derived from the job ID, bound to loopback
# docker compose down        EXIT trap
#
# Adapter variables (override per center / per run):
#   C2H_WORKERS        worker count                   (default 4)
#   C2H_TASKS          task count                     (default 20)
#   C2H_IMAGE_DIR      .sif location                  (default $SCRATCH/c2hpc-images)
#   C2H_RUNTIME        runtime binary                 (default apptainer)
#   C2H_BIND_HOST      dashboard bind address         (default 127.0.0.1)
#   C2H_PORT           dashboard port                 (default derived from job ID)
#   C2H_PROBE_PORT     port the readiness gate polls  (default = C2H_PORT)
#   C2H_READY_TIMEOUT  readiness timeout in seconds   (default 60)
#
# Set C2H_PROBE_PORT to an unused port to force the readiness-timeout path
# on purpose. That is how the negative-evidence run is produced.

set -uo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./readiness.sh
source "$SELF_DIR/readiness.sh"

die() {
    echo "ERROR [$1] $2" >&2
    exit "${3:-1}"
}

# ---------------------------------------------------------------- adapters ---
WORKERS="${C2H_WORKERS:-4}"
TASKS="${C2H_TASKS:-20}"
RUNTIME="${C2H_RUNTIME:-apptainer}"
IMAGE_DIR="${C2H_IMAGE_DIR:-${SCRATCH:-$HOME}/c2hpc-images}"
BIND_HOST="${C2H_BIND_HOST:-127.0.0.1}"
READY_TIMEOUT="${C2H_READY_TIMEOUT:-60}"

case "$WORKERS" in ''|*[!0-9]*) die BSSW-W006 "C2H_WORKERS must be a positive integer";; esac
case "$TASKS"   in ''|*[!0-9]*) die BSSW-W006 "C2H_TASKS must be a positive integer";;   esac
[ "$WORKERS" -ge 1 ] || die BSSW-W006 "C2H_WORKERS must be >= 1"
[ "$TASKS"   -ge 1 ] || die BSSW-W006 "C2H_TASKS must be >= 1"

command -v "$RUNTIME" >/dev/null 2>&1 \
    || die BSSW-W004 "container runtime '$RUNTIME' not found on PATH (try: module load apptainer)"

for img in worker dashboard; do
    [ -f "$IMAGE_DIR/$img.sif" ] \
        || die BSSW-W005 "missing image $IMAGE_DIR/$img.sif -- run container/build_images.sh first"
done

# ------------------------------------------------------- job-scoped storage ---
# Not every scheduler exports a per-job scratch variable. Anvil, for instance,
# provides $SCRATCH but no $SLURM_SCRATCH, so the job-scoped path is derived.
# This is a real portability boundary, not a defensive nicety.
if [ -n "${SLURM_SCRATCH:-}" ]; then
    JOB_DIR="$SLURM_SCRATCH/c2hpc"
    SCRATCH_SOURCE="SLURM_SCRATCH (scheduler-provided)"
elif [ -n "${SCRATCH:-}" ] && [ -n "${SLURM_JOB_ID:-}" ]; then
    JOB_DIR="$SCRATCH/c2hpc-jobs/$SLURM_JOB_ID"
    SCRATCH_SOURCE="derived from SCRATCH + SLURM_JOB_ID (no scheduler-provided job scratch)"
else
    die BSSW-W003 "no job-scoped storage available: set SLURM_SCRATCH, or SCRATCH with SLURM_JOB_ID"
fi

# ------------------------------------------------------------------- ports ---
# Compute nodes on shared partitions are shared with other users' jobs, so a
# fixed port invites collisions. Derive one from the job ID instead.
if [ -n "${C2H_PORT:-}" ]; then
    PORT="$C2H_PORT"
elif [ -n "${SLURM_JOB_ID:-}" ]; then
    PORT=$(( 8000 + SLURM_JOB_ID % 1000 ))
else
    PORT=8080
fi
PROBE_PORT="${C2H_PROBE_PORT:-$PORT}"

# --------------------------------------------------------------- lifecycle ---
DASH_PID=""
WORKER_PIDS=()

cleanup() {
    if [ -n "$DASH_PID" ]; then
        kill "$DASH_PID" 2>/dev/null || true
    fi
    if [ "${#WORKER_PIDS[@]}" -gt 0 ]; then
        kill "${WORKER_PIDS[@]}" 2>/dev/null || true
    fi
    wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 143' TERM INT

mkdir -p "$JOB_DIR"/{tasks,results,processing,logs}

run_in() {  # run_in <image-name> <command...>
    local image="$1"; shift
    "$RUNTIME" exec --cleanenv --bind "$JOB_DIR:/data" "$IMAGE_DIR/$image.sif" "$@"
}

RUNTIME_VERSION="$($RUNTIME --version 2>/dev/null | head -1)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat <<EOF
=== Compose2HPC reference workflow ===
  Job          : ${SLURM_JOB_ID:-manual} on ${SLURM_JOB_NODELIST:-$(hostname)}
  Runtime      : $RUNTIME_VERSION
  Images       : $IMAGE_DIR
  Job scratch  : $JOB_DIR
                 [$SCRATCH_SOURCE]
  Dashboard    : $BIND_HOST:$PORT
  Readiness    : polling port $PROBE_PORT, timeout ${READY_TIMEOUT}s
  Workers      : $WORKERS    Tasks: $TASKS
EOF

# 1. Coordinating service -----------------------------------------------------
echo "[$(date -u +%H:%M:%S)] starting dashboard..."
run_in dashboard python3 /app/app.py \
    --tasks-dir /data/tasks \
    --results-dir /data/results \
    --port "$PORT" \
    --host "$BIND_HOST" \
    > "$JOB_DIR/logs/dashboard.log" 2>&1 &
DASH_PID=$!

# 2. Readiness gate -----------------------------------------------------------
# Compose would express this as depends_on + healthcheck. There is no scheduler
# equivalent, so the gate is explicit -- and a failed gate must fail the job.
if ! wait_for_port "$PROBE_PORT" "$READY_TIMEOUT"; then
    echo "--- dashboard log ---" >&2
    tail -20 "$JOB_DIR/logs/dashboard.log" >&2 2>/dev/null || true
    die BSSW-W001 "coordinating service not ready on port $PROBE_PORT within ${READY_TIMEOUT}s; no workers were started"
fi
echo "[$(date -u +%H:%M:%S)] dashboard ready on port $PORT"

# 3. Producer (synchronous: sequencing here is free, unlike in Compose) --------
echo "[$(date -u +%H:%M:%S)] producing $TASKS tasks..."
run_in worker python3 /app/producer.py --output /data/tasks --count "$TASKS" \
    > "$JOB_DIR/logs/producer.log" 2>&1 \
    || die BSSW-W007 "producer failed; see $JOB_DIR/logs/producer.log"

# 4. Workers ------------------------------------------------------------------
echo "[$(date -u +%H:%M:%S)] launching $WORKERS workers..."
for w in $(seq 1 "$WORKERS"); do
    run_in worker python3 /app/worker.py \
        --input /data/tasks \
        --output /data/results \
        --worker-id "$w" \
        > "$JOB_DIR/logs/worker_${w}.log" 2>&1 &
    WORKER_PIDS+=($!)
done

# 5. Wait for workers ONLY. A bare `wait` would also wait on the dashboard,
#    which never exits -- the job would hang to walltime and land in TIMEOUT
#    rather than COMPLETED.
WORKER_FAIL=0
for pid in "${WORKER_PIDS[@]}"; do
    wait "$pid" || WORKER_FAIL=1
done
echo "[$(date -u +%H:%M:%S)] all workers exited"

# 6. Verification -------------------------------------------------------------
count_json() { find "$1" -maxdepth 1 -name '*.json' -type f 2>/dev/null | wc -l | tr -d ' '; }
RESULTS="$(count_json "$JOB_DIR/results")"
PENDING="$(count_json "$JOB_DIR/tasks")"
STUCK="$(count_json "$JOB_DIR/processing")"

echo "  results=$RESULTS/$TASKS  pending=$PENDING  stuck=$STUCK"

[ "$WORKER_FAIL" -eq 0 ] || die BSSW-W008 "at least one worker exited nonzero; see $JOB_DIR/logs/"
[ "$RESULTS" -eq "$TASKS" ] \
    || die BSSW-W002 "result count mismatch: expected $TASKS, found $RESULTS (pending=$PENDING stuck=$STUCK)"
[ "$PENDING" -eq 0 ] && [ "$STUCK" -eq 0 ] \
    || die BSSW-W002 "queue not drained: pending=$PENDING stuck=$STUCK"

# 7. Machine-identifiable success marker --------------------------------------
IMAGE_DIGESTS="$(cd "$IMAGE_DIR" && sha256sum worker.sif dashboard.sif 2>/dev/null | tr '\n' ';')"
cat > "$JOB_DIR/SUCCESS.json" <<EOF
{
  "status": "success",
  "job_id": "${SLURM_JOB_ID:-manual}",
  "node": "${SLURM_JOB_NODELIST:-$(hostname)}",
  "started_at": "$STARTED_AT",
  "finished_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "runtime": "$RUNTIME_VERSION",
  "image_digests": "$IMAGE_DIGESTS",
  "scratch_source": "$SCRATCH_SOURCE",
  "job_dir": "$JOB_DIR",
  "workers": $WORKERS,
  "tasks_expected": $TASKS,
  "results_found": $RESULTS,
  "dashboard_port": $PORT
}
EOF

echo "[$(date -u +%H:%M:%S)] SUCCESS -- marker written to $JOB_DIR/SUCCESS.json"
echo "NOTE: \$SCRATCH purges after 30 days. Copy $JOB_DIR out before it ages."
exit 0
