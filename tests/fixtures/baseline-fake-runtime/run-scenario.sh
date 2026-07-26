#!/usr/bin/env bash
set -uo pipefail
SCENARIO=${1:?scenario is required}
FIXTURE_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPOSITORY_ROOT=$(CDPATH= cd -- "${FIXTURE_DIR}/../../.." && pwd)
WORKFLOW_ROOT=$REPOSITORY_ROOT/workflows/baseline-slurm-apptainer
OUTPUT_ROOT=${2:-$(mktemp -d "${TMPDIR:-/tmp}/bssw-fixture.XXXXXX")}
mkdir -p "$OUTPUT_ROOT/scratch"
printf 'fixture image: no container execution\n' > "$OUTPUT_ROOT/baseline.sif"
cp "$WORKFLOW_ROOT/inputs/tasks.json" "$OUTPUT_ROOT/input.json"
if [[ "$SCENARIO" == invalid-input ]]; then
  printf '{"schemaVersion":1,"tasks":[]}\n' > "$OUTPUT_ROOT/input.json"
fi
"$FIXTURE_DIR/bin/fixture-sha256" "$OUTPUT_ROOT/input.json" > "$OUTPUT_ROOT/input.sha256"
"$FIXTURE_DIR/bin/fixture-sha256" "$OUTPUT_ROOT/baseline.sif" > "$OUTPUT_ROOT/image.sha256"
if [[ "$SCENARIO" == checksum-mismatch ]]; then
  printf '%064d  input.json\n' 0 > "$OUTPUT_ROOT/input.sha256"
fi
export PATH="$FIXTURE_DIR/bin:$PATH"
export SLURM_JOB_ID=4242
export SLURM_TMPDIR="$OUTPUT_ROOT/scratch"
export BSSW_APPTAINER_CMD=apptainer
export BSSW_SRUN_CMD=srun
export BSSW_SLURM_VERSION_CMD=scontrol
export BSSW_KILL_CMD="$FIXTURE_DIR/bin/fake-kill"
export BSSW_SHA256_CMD="$FIXTURE_DIR/bin/fixture-sha256"
export BSSW_APP_ROOT="$WORKFLOW_ROOT/bin"
export BSSW_FAKE_RUNTIME_DIR="$OUTPUT_ROOT/scratch/bssw-4242"
export BSSW_FIXTURE_SCENARIO="$SCENARIO"
export BSSW_FIXTURE_SECRET=SECRET_FIXTURE_VALUE
export IMAGE_PATH="$OUTPUT_ROOT/baseline.sif"
export IMAGE_SHA256_FILE="$OUTPUT_ROOT/image.sha256"
export INPUT_PATH="$OUTPUT_ROOT/input.json"
export INPUT_SHA256_FILE="$OUTPUT_ROOT/input.sha256"
export EXPECTED_PATH="$WORKFLOW_ROOT/expected/results.json"
export WORKER_COUNT=2 TASK_COUNT=4 READINESS_TIMEOUT=3 CLEANUP_TIMEOUT=1
bash "$WORKFLOW_ROOT/slurm/baseline.sbatch"
status=$?
printf 'FIXTURE_RUNTIME=%s\n' "$BSSW_FAKE_RUNTIME_DIR"
# Diagnostic dump for CI environment debugging (temporary)
if [ -f "$BSSW_FAKE_RUNTIME_DIR/logs/input-validation.log" ]; then
  printf 'DIAG input-validation.log:\n'
  cat "$BSSW_FAKE_RUNTIME_DIR/logs/input-validation.log"
fi
printf 'DIAG python3=%s\n' "$(command -v python3 || echo MISSING)"
printf 'DIAG python3 --version: '; python3 --version 2>&1 || true
exit "$status"
