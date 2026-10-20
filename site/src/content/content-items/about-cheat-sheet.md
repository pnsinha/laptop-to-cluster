---
id: cheat-sheet
stable_slug: cheat-sheet
title: One-page cheat sheet
summary: "A printable reference for one cluster run: the six steps, how Compose ideas map to the cluster, what to set before you submit, and what the error IDs mean."
artifact_type: guidance-note
route_namespace: about
topics: [orientation, reference]
keywords: [cheat sheet, printable, Compose, Slurm, Apptainer]
audiences: [all visitors, research software engineers]
milestone: 2
status: published
publication_date: "2026-10-20"
---
<div class="cheat-sheet">

Print this page (Ctrl+P or Cmd+P) for a sheet to keep beside your terminal. The shapes ■ job step, ◆ readiness gate, ▲ job-scoped scratch and ● loopback keep their meaning in black and white. **Tested**: see [the test record](/applicability/m2-baseline-anvil-2026-10/). **Shim-tested** means it ran off-cluster against test fixtures, never on a cluster. **Designed, not run** means the design describes it, but nobody has run it on a cluster.

## Six steps in one allocation

| Step | What the script does | Evidence |
|---|---|---|
| 1 Get an allocation | Asks for one node and a time limit, checks its inputs and makes a private job folder ▲ | Tested |
| 2 Start coordinator | Starts the coordinator as a job step ■. It listens only on `127.0.0.1` ● and writes its address to `endpoint.json` | Tested |
| 3 Readiness gate ◆ | Waits for an exact `/health` answer within the timeout, otherwise stops with `BSSW-READY-TIMEOUT` | Tested |
| 4 Run workers | Starts the workers as job steps ■ and waits for the workers, never for the coordinator | Tested |
| 5 Verify results | With the coordinator still up, checks the results. Only a full pass writes `result.json` | Tested |
| 6 Clean up | An exit trap stops every child process, and the job folder is kept | Tested |
| 6 Force stop | Any child still alive after the cleanup timeout is killed | Designed, not run |

## Compose idea to cluster form

| Compose | On the cluster | Evidence |
|---|---|---|
| a service ■ | a job step started with `srun` | Tested |
| `deploy.replicas: N` | a loop of N job steps, each waited on | Tested |
| `healthcheck` with `service_healthy` ◆ | a two-stage gate: the endpoint file appears, then `/health` answers | Tested |
| `service_completed_successfully` | plain sequential steps in the script | Tested |
| a named volume ▲ | job-scoped scratch at `$SCRATCH_ROOT/bssw-$SLURM_JOB_ID`, mode 700 | Tested |
| `ports: "8080:8080"` ● | `127.0.0.1` and a port chosen at start, published in `endpoint.json` | Tested |
| reaching a service from your laptop | an SSH tunnel by a route your center approves | Designed, not run |
| `build:` | a prebuilt `.sif` image whose checksum is checked at start | Tested |
| a GPU reservation | `--gres=gpu:N` and `apptainer exec --nv` | Designed, not run |
| `restart:` | none: one failure ends the job | Designed, not run |

**The gate is not the check.** The gate asks whether the coordinator can serve. Keep it, and change only what "ready" means for your service. Verification asks whether the results are right. Only your science can say, so replace that check with your own.

## Before you submit

Set or confirm: account, partition, wall time, CPUs (one per step, plus one), the Apptainer module, the image path with its `.sha256` file, `BSSW_SCRATCH_ROOT` (set it), `WORKER_COUNT` 1–16, `TASK_COUNT` (the tasks in your input), `READINESS_TIMEOUT` 1–300.

Run these from the workflow directory. Slurm runs a copy of the script from its own spool directory, so pass the file locations as absolute paths.

```bash
cd workflows/baseline-slurm-apptainer
(cd inputs && sha256sum -c tasks.json.sha256)
WF=$PWD
sbatch --export=ALL,BSSW_SCRATCH_ROOT=<path>,\
IMAGE_PATH=$WF/container/baseline.sif,\
INPUT_PATH=$WF/inputs/tasks.json,\
INPUT_SHA256_FILE=$WF/inputs/tasks.json.sha256,\
EXPECTED_PATH=$WF/expected/results.json \
  slurm/baseline.sbatch
```

Done means the last log line begins `BSSW workflow completed` and `result.json` holds `"status": "success"`.

## If it fails

**Tested:** `BSSW-READY-TIMEOUT` (75).

**Shim-tested (off-cluster only):** `BSSW-PREQ-INPUT` (73), `BSSW-INTEGRITY-INPUT` (70), `BSSW-COORDINATOR-EXIT` (74), `BSSW-WORKER-EXIT` (76), `BSSW-VERIFY-RESULT` (77), `BSSW-CLEANUP-CHILD` (79).

**Designed, not run:** `BSSW-PREQ-SLURM` (64), `BSSW-PREQ-APPTAINER` (65), `BSSW-PREQ-COMMAND` (66), `BSSW-PREQ-VALUE` (67), `BSSW-PREQ-IMAGE` (68), `BSSW-PREQ-INPUT` (69), `BSSW-INTEGRITY-IMAGE` (71), `BSSW-PREQ-STORAGE` (72), `BSSW-CLEANUP-SIGNAL` (78). Find your ID on the [Troubleshooting](/diagnostics/) page.

## Do not

- Use a bare `wait` after starting a background service.
- Use a `sleep` or a bare port check as the gate.
- Assume `$SLURM_SCRATCH` exists.
- Treat loopback as private from other users on the same node.
- Keep anything you need in scratch after the job ends.

</div>
