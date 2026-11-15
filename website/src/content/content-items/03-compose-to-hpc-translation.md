---
id: module-3-compose-to-hpc-translation
stable_slug: compose-to-hpc-translation
title: "Translate a Compose file"
description: "A step-by-step guide to moving a multi-service Docker Compose file onto a scheduler-managed cluster allocation: inventory, construct map, template edits, run and verify."
summary: "See what each part of your Compose file becomes on a cluster, then edit the example job to run your own services."
module_number: 3
topics: [compose-to-hpc-translation, scheduler-as-orchestrator, rootless-containers]
keywords: [Compose, HPC, orchestration, scheduler, Apptainer, readiness, translation]
audiences: [HPC learners, scientific software practitioners]
milestone: 2
status: published
publication_date: "2026-10-20"
last_updated: "2026-10-20"
last_reviewed: "2026-10-15"
applicable_release: v0.1.0
artifact_type: learning-module
module_type: conceptual
learning_outcomes:
  - "Decide whether your stack suits a one-allocation pattern, and list what each service needs."
  - "Map each Compose construct to its cluster form, and tell the Tested rows from the Designed, not run rows."
  - "Know which files of the example job you keep and which you replace to run your own services."
prerequisites:
  - { id: module-1-scheduler-orchestrator, check: "Read Module 1: Scheduler as Orchestrator, or take the five-minute tour" }
section_kinds: [concept, limitations, next-steps]
estimated_minutes: 25
completion_check:
  kind: decision-exercise
  text: "Pick one Compose stack you use. Fill in the Step 1 worksheet, write the cluster form of each construct from the Step 2 table, and mark each row Tested or Designed, not run."
schedulers: [slurm]
container_runtimes: [apptainer]
related: [module-1-scheduler-orchestrator, module-2-baseline, start-guide, adoption-evaluate]
learning_stage: baseline
authority:
  - { kind: sow, citation: "Fellowship SOW, Milestone 2", scope: "Expand portability patterns across schedulers, runtimes, and workflow shapes." }
  - { kind: project-decision, citation: "Milestone 2 scope", scope: "Publish a cross-cutting translation guide before releasing scheduler-specific templates." }
sow_deliverable_id: M2-MODULE-3-SUPPORTING
deliverable_status: draft
---
You have a Docker Compose file and a shared cluster. This page takes you from one to the other in six steps, numbered 0 to 5. You can read it without a cluster account. If "allocation" or "job step" is new to you, take the [five-minute tour](/guide/tour/) first.

The method: keep the example job's orchestration (the allocation, the readiness gate and the cleanup), and replace its placeholder services and its result check with yours. The example job is the baseline workflow in this project's repository, [pinned to a release on GitHub](https://github.com/pnsinha/laptop-to-cluster/tree/@release/workflows/baseline-slurm-apptainer).

## Step 0: Is this the right pattern?

This pattern runs your stack once, for a bounded time, inside a single allocation, and then stops. Two questions decide whether that fits.

1. Does your stack produce **results**, or is **staying up** the product?
2. If one service dies, is restarting the whole stack acceptable?

Results plus an acceptable restart means continue. A stable public endpoint, a service that must outlive a wall-time limit, or a component that has to recover by itself points elsewhere: read [when not to use this pattern](/adoption/evaluate/#when-not) first.

## Step 1: Inventory your Compose file

Make a copy of this worksheet and add one row for each service.

| Service | Role | Waits for | Writes | Listens on | Needs a GPU? |
|---|---|---|---|---|---|
| (name) | coordinator, worker, one-shot job, data store or interface | the service it depends on, and what proves that service is ready | the paths it writes | the port it serves | yes or no |

Then flag anything that has no direct cluster equivalent.

- **`restart:` policies.** Nothing restarts a service that dies. The allocation ends instead, so decide how a failure should show up.
- **Service DNS names.** Services on one node reach each other on loopback (127.0.0.1), at a port the coordinator picks and writes to a file. A name like `db` becomes an address read from that file.
- **State you need next time.** Job storage is temporary. Copy out what you keep before the job ends.
- **Root entrypoints.** Rootless runtimes cannot change file ownership, bind privileged ports or switch users. An image that assumes root needs a different entrypoint.
- **Ports meant for other people.** Nothing outside the node reaches your services unless your center approves a path.
- **GPUs.** A GPU is a scheduler request plus a runtime flag. The example job has no GPU step, so treat that part as Designed, not run.

## Step 2: Map each construct

For each construct in your Compose file, find its cluster form. The terms [job step](/about/glossary/#job-step), [readiness gate](/about/glossary/#readiness-gate), [job-scoped scratch](/about/glossary/#job-scoped-scratch) and [loopback](/about/glossary/#loopback) are defined in the glossary.

| Compose construct | Cluster form | Status |
|---|---|---|
| `docker compose up` and `down` | One `sbatch` submission. The script is the composition. | [Tested](/adoption/evaluate/#not-tested) |
| a `service` | An `srun --exclusive` job step | [Tested](/adoption/evaluate/#not-tested) |
| `deploy.replicas` | A loop that starts each worker, then waits on each one | [Tested](/adoption/evaluate/#not-tested) |
| `healthcheck` with `depends_on: service_healthy` | A two-stage readiness gate: wait for the coordinator's address file, then require its exact answer within a time limit | [Tested](/adoption/evaluate/#not-tested) |
| `depends_on: service_completed_successfully` | Plain sequential flow in the script | [Tested](/adoption/evaluate/#not-tested) |
| a named volume | A private job folder with owner-only permissions, bound into the container | [Tested](/adoption/evaluate/#not-tested) |
| `ports`, for services that talk to each other | Loopback on a port the coordinator picks, with its address written to a file | [Tested](/adoption/evaluate/#not-tested) |
| `ports`, to reach a service from your laptop | An SSH tunnel, where your center allows one | Designed, not run |
| `build:` | A prebuilt image, checked against a recorded checksum before use | [Tested](/adoption/evaluate/#not-tested) |
| cleanup on `down` | A cleanup step, registered at the start, that runs on any exit and stops every job step | [Tested](/adoption/evaluate/#not-tested) |
| stopping a stuck service by force, and the scheduler's time-limit signal | A short grace period, then a forced stop | Designed, not run |
| a GPU device request | A scheduler GPU request plus the runtime's GPU flag | Designed, not run |
| the same pattern on PBS-family schedulers or with Charliecloud | The same structure with different commands | Designed, not run |

**Tested** rows ran in the example job on a cluster. [What was tested where](/adoption/evaluate/#not-tested) names the cluster and links the full test record. Rows marked Designed, not run follow the same pattern, but nobody has run them yet.

## Step 3: Fill in the template

Open the [example job](https://github.com/pnsinha/laptop-to-cluster/tree/@release/workflows/baseline-slurm-apptainer). To run your own application you change the files below and a small set of settings.

**Keep**

- The allocation request structure and the private job folder setup.
- The readiness gate: the bounded wait, the exact-answer check and the stop-with-a-named-error behavior.
- The cleanup step that runs on any exit.

**Replace or edit**

| File | What to do |
|---|---|
| `slurm/baseline.sbatch` | Set your account, partition, wall time and CPUs, and swap the coordinator and worker launch lines for your services. |
| `bin/coordinator.py` | Replace with your coordinating service. The health answer it gives is at [lines 27–28](https://github.com/pnsinha/laptop-to-cluster/blob/@release/workflows/baseline-slurm-apptainer/bin/coordinator.py#L27-L28). |
| `bin/readiness.py` | Keep the script and its bounds, but change what "ready" means. The exact answer it waits for is at [lines 29–31](https://github.com/pnsinha/laptop-to-cluster/blob/@release/workflows/baseline-slurm-apptainer/bin/readiness.py#L29-L31) and must match what your service returns. |
| `bin/worker.py` | Replace with your workers. |
| `bin/common.py` | Edit it if your tasks differ. It checks the example's task format (an id and a payload with a message and a repeat count), so another shape is rejected as invalid input. |
| `bin/verify.py` | Replace with your own definition of correct. Checking that every result is right belongs to your application, not to the pattern. |
| `bin/validate_input.py` and `inputs/` | Replace with your inputs and their checksum record. |
| `expected/` | Replace or delete. Only the example's verifier reads it. |
| `container/Apptainer.def` and `container/image-lock.json` | Replace with your image and its pinned base. |
| `container/acquire.sh`, `diagnostics.json` and `README.md` | Leave unchanged. |

**Settings.** The job takes 14 adapter variables, set with `sbatch --export` or a wrapper your center owns. The [package README](https://github.com/pnsinha/laptop-to-cluster/blob/@release/workflows/baseline-slurm-apptainer/README.md) lists the defaults and limits: `WORKER_COUNT`, `TASK_COUNT`, `READINESS_TIMEOUT`, `CLEANUP_TIMEOUT`, `IMAGE_PATH`, `IMAGE_SHA256_FILE`, `INPUT_PATH`, `INPUT_SHA256_FILE`, `EXPECTED_PATH`, `BSSW_SCRATCH_ROOT`, `BSSW_APPTAINER_CMD`, `BSSW_SRUN_CMD`, `BSSW_SLURM_VERSION_CMD` and `BSSW_SHA256_CMD`.

Set `BSSW_SCRATCH_ROOT` explicitly, to a private job-scoped path your center names. Without it the script falls back to the scheduler's temporary directory and then to `/tmp`, and on a shared node that fallback is not private. Check that the allocation has enough CPUs for the workers you ask for: the example gives each step one CPU, so raise the CPU request along with `WORKER_COUNT`.

## Step 4: Run it

[Run the example](/start/) walks through checking your center, fetching the image and submitting the job. In short, check the input against its checksum record, then submit with absolute paths. Run both from the root of the repository you cloned in [Get the code](/start/#get-the-code). The checksum record names a bare `tasks.json`, so the check runs inside the `inputs` folder. Slurm runs a copy of the batch script from its own spool folder, so the script cannot find the workflow folder by itself; the `--export` list gives it absolute paths. Replace `<path>` with the private scratch path you chose in Step 3.

```bash
(cd workflows/baseline-slurm-apptainer/inputs && sha256sum -c tasks.json.sha256)
W="$PWD/workflows/baseline-slurm-apptainer"
sbatch --export=ALL,BSSW_SCRATCH_ROOT=<path>,INPUT_PATH="$W/inputs/tasks.json",EXPECTED_PATH="$W/expected/results.json",IMAGE_PATH="$W/container/baseline.sif",INPUT_SHA256_FILE="$W/inputs/tasks.json.sha256" "$W/slurm/baseline.sbatch"
```

When the job finishes, it reports that the workflow completed; it does not print a path. The result is in the job’s private folder, `<path>/bssw-<job ID>`, under the scratch root you set. If you leave `BSSW_SCRATCH_ROOT` out, the script falls back to `${SLURM_TMPDIR}/bssw-<job ID>` when `SLURM_TMPDIR` exists, otherwise to `${TMPDIR:-/tmp}/bssw-<job ID>`, as the package README states.

## Step 5: Verify the result

A zero exit code is not success. Success has two parts, both in the job's private folder.

- `result.json` exists and contains `"status": "success"`. Only a full pass of your verification check writes it. (`results.json`, with an s, holds intermediate worker output and is not a success claim.)
- `events.jsonl` shows the readiness gate passing before any worker started.

If either is missing, start with [Troubleshooting](/diagnostics/). Each failure the script reports has a named ID there.

## Common mistakes

- **Waiting on the coordinator.** The coordinator runs in the background for the whole job. If the script waits for it, the job runs until the wall-time limit. Wait for the workers instead.
- **Checking a port instead of an answer.** An open port, or a fixed `sleep`, does not show that the service can serve. Require the exact response your service gives when it is healthy, and bound the wait.
- **Assuming your center sets a scratch variable.** Names differ between centers. Set `BSSW_SCRATCH_ROOT` explicitly.
- **Accepting the temporary-directory fallback.** On a shared node it is not private to your job.
- **Treating a clean exit as a correct result.** Only your verification check can say the results are right.

## What varies by center

The structure stays the same. These values change from center to center.

- Account, partition and wall-time limits, and the scheduler's command names.
- How the container runtime is loaded, and whether single-task job steps are allowed.
- Which path is private, job-scoped scratch, and how long it lasts.
- Whether compute-node loopback is allowed, and what access beyond the node your center approves.
- GPU request syntax and driver locations.

Record your local values before you adapt anything. [Run the example](/start/) lists them.

## Key points

- Translate by construct: a service becomes a job step, `depends_on` becomes a readiness gate, a named volume becomes job-scoped scratch, and a published port becomes loopback.
- Keep the gate and the cleanup. Replace the services and the verification check with yours.
- Success is `result.json` with `"status": "success"`, written by your verifier, plus readiness before any worker.
- Rows marked Designed, not run follow the pattern but have not been run.

## Next step

Run the unmodified example first with [Run the example](/start/), then change one service at a time. To judge whether the pattern fits your center, read [Evaluate and adopt](/adoption/evaluate/).
