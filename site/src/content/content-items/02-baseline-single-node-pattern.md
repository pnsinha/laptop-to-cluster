---
id: module-2-baseline
stable_slug: baseline-single-node-pattern
title: "Baseline Pattern: Single-Node Service + Workers"
description: "A bounded single-node reference workflow with one coordinating service and one or more workers in one scheduler allocation"
module_number: 2
topics: [scheduler-as-orchestrator, service-workers]
status: published
last_updated: "2026-10-15"
summary: "Run the smallest service-and-workers pattern inside one allocation, with readiness before workers and verification before success."
artifact_type: learning-module
keywords: [Apptainer, readiness, single-node, Slurm, workers]
audiences: [HPC learners, scientific software practitioners]
milestone: 1
publication_date: "2026-07-31"
applicable_release: v0.1.0
module_type: runnable
learning_outcomes: ["Explain the coordinator, readiness gate, workers, and verification sequence", "Prepare your center's local values and judge success from the result file, not from process startup", "Decide which parts of the workflow package to keep, edit, or replace for your own application"]
prerequisites:
  - { id: BSSW-PREREQ-SLURM, check: "Run command -v sbatch and confirm an allocation/account is available", diagnostic_id: BSSW-PREREQ-SLURM }
  - { id: BSSW-PREREQ-APPTAINER, check: "Run command -v apptainer and record apptainer --version", diagnostic_id: BSSW-PREREQ-APPTAINER }
section_kinds: [concept, procedure, expected-result, limitations, next-steps]
required_resources: ["One Slurm compute node", "Apptainer available on compute nodes", "A center-approved writable job-scoped directory", "The immutable v0.1.0 workflow bundle"]
estimated_minutes: 30
completion_check: { kind: result, text: "Complete only when the job exits zero and the verifier reports the documented task count, unique results, and a success result artifact." }
validation_status: validated
validation_date: "2026-10-07"
applicability_records: [m2-baseline-anvil-2026-10]
schedulers: [slurm]
container_runtimes: [apptainer]
related: [module-1-scheduler-orchestrator, start-guide]
learning_stage: baseline
supporting_artifacts:
  - { repository: "https://github.com/pnsinha/laptop-to-cluster", release: v0.1.0, path: workflows/baseline-slurm-apptainer/README.md, integrity: "sha256:f7586054384c3d0f6d1632da0da33d987fadb73652d9cd11890ae5b0ccec0b7c" }
authority:
  - { kind: sow, citation: "Fellowship SOW, Milestone 1", scope: "Publish a baseline Slurm and Apptainer service-plus-workers pattern." }
  - { kind: project-decision, citation: "Milestone 1 validation boundary", scope: "Limit the baseline to one node and require result-based verification." }
unvalidated_scopes: []
sow_deliverable_id: M1-MODULE-2
deliverable_status: complete
completion_evidence: { id: m1-module-2-publication, path: evidence/README.md, integrity: "sha256:2fb0fd2e84a083ee33564797f69e63d40fc225987ebe94ea41832995713aca6a" }
---
## Your Compose stack, before

The baseline is a three-part Compose stack, sketched in [Scheduler as Orchestrator](/guide/scheduler-as-orchestrator/): a coordinator that hands out work, workers that do it, and a one-shot check of the results. In Compose, each part is a service, and `depends_on` orders them.

| Compose service | What it does | On the cluster |
|---|---|---|
| coordinator | Accepts tasks and hands out work | a <span class="c-step">job step</span> that listens on <span class="c-net">loopback</span> |
| worker (two replicas) | Takes tasks and sends back results | one <span class="c-step">job step</span> per worker, started only after the <span class="c-gate">readiness gate</span> passes |
| verify | Checks every result once the workers finish | a check that runs inside the same job, last |

## The same stack in one allocation

One batch script asks the scheduler for one node. Inside that [allocation](/about/glossary/#allocation) it does what Compose did on your laptop: it makes a private [job-scoped scratch](/about/glossary/#job-scoped-scratch) folder, starts the coordinator, waits at the readiness gate, runs the workers, verifies the results, and cleans up.

The **workflow source** is the code that script and its helpers run. It is the complete, [release-pinned](/about/glossary/#release-pinned) package at `workflows/baseline-slurm-apptainer` in tag `v0.1.0`:

- `slurm/baseline.sbatch`, the launch script;
- `bin/`, the small Python programs the script starts: the coordinator, the worker, the readiness probe, the input validator, and the verifier;
- `container/`, the recipe and lock file for the image those programs run in;
- `inputs/` and `expected/`, the work to do and the answers to check it against.

It serves two purposes. It is a [demonstrator](/about/glossary/#demonstrator-vs-template): it shows the pattern running end to end under a real scheduler, and the evidence badge on this page links to the test record of that run. It is also a template: you edit it to run your own application, using the list in "Adapt it". This page shows only [teaching excerpts](/about/glossary/#teaching-excerpt), annotated fragments chosen for explanation. Read them in the [annotated implementation reference](#implementation-reference), and open the package for the runnable code. The coordinator and worker process inert JSON tasks on purpose. They are placeholders that exercise the orchestration; they are not an application.

## How the baseline works

The script moves through six steps. The table says what each step does and where it sits in `baseline.sbatch` (line numbers are from tag `v0.1.0`).

<!-- l2c:timeline -->

| Step | What the script does | Lines |
|---|---|---|
| 1. Get an allocation | Requests one node for ten minutes, checks the image and the input, and makes a private job folder that must not already exist. | 2-7, 123-198 |
| 2. Start coordinator | Launches the coordinator as its own job step. It listens on loopback and writes its address to a file. | 200-206 |
| 3. Readiness gate | Waits until `/health` gives the exact expected answer, or stops with a named error when the time limit passes. | 208-225 |
| 4. Run workers | Launches each worker as its own job step, then waits for the workers, never for the coordinator. | 227-242 |
| 5. Verify results | With the coordinator still running, checks every result. Only a full pass writes `result.json`. | 243-251 |
| 6. Clean up | On any exit, stops every step politely. A failed run leaves no success file. The forced stop after the grace period, and the time-limit path, are **Designed, not run**. | trap set at 120, cleanup at 82-114 |

The [readiness gate](/about/glossary/#readiness-gate) proves the coordinator can serve. By default it polls for up to 30 seconds and passes only on the exact expected answer. It does not prove that any result is right. That is [verification](/about/glossary/#verification), and it runs inside the job, as step 5 of the same script (`baseline.sbatch` lines 245-251), not as a separate command afterward. A running process is not yet a successful result.

<!-- l2c:diagram-single-node-architecture -->

<!-- l2c:implementation-reference -->

## Files the workflow reads and writes

Every JSON file here is machine-parsed: it is written for programs to read. People write two of them (`inputs/tasks.json`, `expected/results.json`), and you open two to confirm success (`result.json`, `events.jsonl`); nothing else needs reading.

| File | Format | Written by | Read by | Notes |
|---|---|---|---|---|
| `inputs/tasks.json` | JSON | you | the coordinator and the launcher | The work to do, as inert data. |
| `expected/results.json` | JSON | you | the verifier | The answers the demonstration verifier compares against. Replace or delete it. |
| `container/image-lock.json` | JSON | the package | `container/acquire.sh` | Pins the base image. |
| `diagnostics.json` | JSON | the package | tests and tooling | Lists the failure IDs the package's tests check, a subset of the IDs in [Troubleshooting](/diagnostics/). |
| `endpoint.json` | JSON | the coordinator | the launcher, the readiness probe, the workers | Where the coordinator is listening. |
| `results.json` | JSON | the coordinator | the verifier | Intermediate worker results. Not a success claim. |
| `result.json` | JSON | the verifier | you and CI | The only success marker: `"status": "success"`. |
| `events.jsonl` | JSON Lines | the launcher | audit tooling and you | Ordered events; proves readiness came before every worker start. |

> **Warning:** `results.json` and `result.json` differ by one letter and mean different things. The first is intermediate worker output. The second is the success marker.

The job writes its run files (`input.json`, `expected.json`, `endpoint.json`, `results.json`, `result.json`, `events.jsonl`, `versions.txt`, and a `logs/` folder) into a private `bssw-<job id>` folder under the scratch root you choose.

<h2 id="procedure">Procedure</h2>

1. Check the prerequisites listed at the start of this module, then [record your local values](/start/#record-your-local-values).
2. [Get the container image](/start/#get-the-container-image) and [check the input](/start/#check-the-input).
3. Set the adapter values that differ at your center: account, partition, and scratch root.
4. [Submit the job](/start/#submit-the-job) once, with the exact command on that page. Keep account names, private hosts, and sensitive paths out of logs.
5. [Check that it worked](/start/#check-that-it-worked).

## Expected result

A successful run:

- exits zero and prints `BSSW workflow completed: result is in the job-scoped runtime directory.`;
- leaves `result.json` in the run folder with `"status": "success"`, the only success marker;
- has an `events.jsonl` in which `coordinator-ready` comes before every `worker-start`, which is the written proof that no worker started early;
- reports that every task has exactly one result and that every invariant passed.

A zero exit alone is not success. Check `result.json`. The test record linked from this page's evidence badge shows what a real run produced.

## What varies by center

Check each of these with your center before you run or adapt the workflow:

- **Account and partition.** The `#SBATCH` header needs values your center accepts. Ask your center's support, or read its job-script guide.
- **Time, CPU, and memory limits.** The defaults are small. Raise `--cpus-per-task` before you raise `WORKER_COUNT`.
- **Apptainer.** How the compute nodes provide it, and the module name. Run `command -v apptainer` in a job.
- **Scratch root.** Set `BSSW_SCRATCH_ROOT` to a private, job-scoped path your center approves. Do not rely on a fallback to `/tmp` on a shared node.
- **`sha256sum`.** It must be on the compute node's path, or you override `BSSW_SHA256_CMD`.
- **Exclusive single-task job steps.** Some centers restrict them. A rejected `srun` step is the symptom.
- **Loopback.** The coordinator and workers talk over loopback on one node. Reaching the coordinator from outside the node needs access your center approves.

## Failure modes

Every failure prints a stable ID that begins `BSSW-` and exits nonzero. Match the ID in your job output to its entry in [Troubleshooting](/diagnostics/):

- Scheduler command or job context missing: [BSSW-PREQ-SLURM](/diagnostics/#bssw-preq-slurm)
- Apptainer missing on the compute node: [BSSW-PREQ-APPTAINER](/diagnostics/#bssw-preq-apptainer)
- Unusable scratch root or bind: [BSSW-PREQ-STORAGE](/diagnostics/#bssw-preq-storage)
- Input checksum does not match: [BSSW-INTEGRITY-INPUT](/diagnostics/#bssw-integrity-input)
- Image checksum does not match: [BSSW-INTEGRITY-IMAGE](/diagnostics/#bssw-integrity-image)
- Coordinator did not become ready in time: [BSSW-READY-TIMEOUT](/diagnostics/#bssw-ready-timeout)
- A worker step failed: [BSSW-WORKER-EXIT](/diagnostics/#bssw-worker-exit)
- Results were rejected: [BSSW-VERIFY-RESULT](/diagnostics/#bssw-verify-result)

A readiness timeout stops the job at the gate: no worker starts and no `result.json` is written. That is the gate doing its job. [Troubleshooting](/diagnostics/) lists the remaining IDs.

## Adapt it

Two checks guard a run, and they adapt differently:

- **The readiness gate is part of the pattern.** It replaces Compose `depends_on`: workers must not start until the service can really serve. Keep the gate and change only what "ready" means for your service.
- **Result verification is part of your application.** Compose has no equivalent. For your own application, expect to keep a verification step but not this one: replace `bin/verify.py` with your own definition of correct. Remove it only if a zero exit truly means success for you, which is rarely true. A process can exit cleanly after producing wrong, partial, or stale output, and nothing else in the pattern checks that.

| Part | Keep or replace | Why |
|---|---|---|
| `#SBATCH` header and adapter variables | adapt the values | same mechanism; your account, partition, and limits |
| Storage setup (private job folder, binds) | keep | private job-scoped state does not depend on the application |
| Coordinator launch on loopback | replace with your service | your service is the point |
| Readiness probe (`bin/readiness.py`) | keep the loop; edit what it waits for | the exact `/health` answer is written into `bin/readiness.py` (lines 29-31) and returned by `bin/coordinator.py` (lines 27-28) |
| Shared task format (`bin/common.py`) | edit if your tasks differ | every program loads tasks through it; it fixes the task shape (`id` plus a `payload` with `message` and `repeat`) and its limits |
| Worker launch loop (`srun` steps) | replace with your workers | your parallelism and payloads |
| `bin/verify.py` | replace | the documented seam for result checks |
| `expected/` | replace or delete | only the demonstration verifier reads it |
| `container/Apptainer.def` and `container/image-lock.json` | replace with your image | pinned provenance for your base image |

To run your own application, expect to edit **12 files** and to set up to **14 adapter variables**. The files are `slurm/baseline.sbatch` (directive values and launch lines), `inputs/tasks.json`, `inputs/tasks.json.sha256`, `expected/results.json` (or delete it), `bin/coordinator.py`, `bin/worker.py`, `bin/verify.py`, `bin/validate_input.py`, `bin/readiness.py`, `bin/common.py`, `container/Apptainer.def`, and `container/image-lock.json`. These stay as they are: `container/acquire.sh`, `diagnostics.json`, and `README.md`. The 14 adapter variables are the ones in the package README's adapter table: `WORKER_COUNT`, `TASK_COUNT`, `READINESS_TIMEOUT`, `CLEANUP_TIMEOUT`, `IMAGE_PATH`, `IMAGE_SHA256_FILE`, `INPUT_PATH`, `INPUT_SHA256_FILE`, `EXPECTED_PATH`, `BSSW_SCRATCH_ROOT`, `BSSW_APPTAINER_CMD`, `BSSW_SRUN_CMD`, `BSSW_SLURM_VERSION_CMD`, and `BSSW_SHA256_CMD`.

For a step-by-step translation of your own Compose file, use [Compose-to-HPC translation](/guide/compose-to-hpc-translation/).

## Safety and scope limitations

The baseline covers one node, loopback communication, bounded inert inputs, and ephemeral allocation-scoped state. It does not establish multi-node networking, durable service operation, cross-center portability, performance scaling, or production support. GPUs, more than one node, and PBS-family schedulers are **Designed, not run**. The full list is at [what hasn't been tested yet](/adoption/evaluate/#not-tested).

## Key points

- The workflow source is both a demonstrator (it shows the pattern running) and a template (you edit it for your own application).
- The readiness gate belongs to the pattern. Result verification belongs to your application, and it runs inside the job.
- Every JSON file here is read by a program. Only `inputs/tasks.json` and `expected/results.json` are also written by a person.
- Success means `result.json` says `"status": "success"`. A zero exit alone is not success.
- To adapt it, expect to edit 12 files and set up to 14 adapter variables.
