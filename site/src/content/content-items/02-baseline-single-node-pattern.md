---
id: module-2-baseline
stable_slug: baseline-single-node-pattern
title: "Baseline Pattern: Single-Node Service + Workers"
description: "A bounded single-node reference workflow with one coordinating service and one or more workers in one scheduler allocation"
module_number: 2
topics: [scheduler-as-orchestrator, service-workers]
status: published
last_updated: "2026-09-26"
summary: "Run the smallest service-and-workers pattern inside one allocation, with readiness before workers and verification before success."
artifact_type: learning-module
keywords: [Apptainer, readiness, single-node, Slurm, workers]
audiences: [HPC learners, scientific software practitioners]
milestone: 1
publication_date: "2026-07-31"
applicable_release: v0.1.0
module_type: runnable
learning_outcomes: ["Explain the coordinator-readiness-worker sequence", "Prepare local-center values before submission", "Verify success from result artifacts rather than process startup alone", "Identify which parts of the workflow package to keep and which to replace for your own application"]
prerequisites:
  - { id: BSSW-PREREQ-SLURM, check: "Run command -v sbatch and confirm an allocation/account is available", diagnostic_id: BSSW-PREREQ-SLURM }
  - { id: BSSW-PREREQ-APPTAINER, check: "Run command -v apptainer and record apptainer --version", diagnostic_id: BSSW-PREREQ-APPTAINER }
section_kinds: [concept, procedure, expected-result, limitations, next-steps]
required_resources: ["One Slurm compute node", "Apptainer available on compute nodes", "A center-approved writable job-scoped directory", "The immutable v0.1.0 workflow bundle"]
estimated_minutes: 30
completion_check: { kind: result, text: "Complete only when the job exits zero and the verifier reports the documented task count, unique results, and a success result artifact." }
validation_status: validated
validation_date: "2026-07-25"
applicability_records: [m1-baseline-anvil]
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
## How the baseline works

One allocation contains one coordinator and a bounded worker pool. The launcher prepares private runtime storage, binds the coordinator to [loopback](/about/glossary/), waits for [semantic readiness](/about/glossary/), starts workers, and verifies outputs. A running process is not yet a successful result.

### Five-step flow

This is the conceptual sequence, not an executable submission script. The [release-pinned](/about/glossary/) implementation and annotated source excerpts appear below before the procedure.

1. **Storage:** create private state and output directories for the allocation.
2. **Coordinator:** start one service on loopback.
3. **Readiness:** require a bounded semantic response before continuing.
4. **Workers:** start exclusive worker steps only after readiness.
5. **Verification:** confirm result count, uniqueness, schema, and worker completion before recording success.

```text
allocation → coordinator → semantic readiness → workers → result verification
```

## What the reference workflow is (and is not)

The **workflow package** is the complete, release-pinned code at `workflows/baseline-slurm-apptainer` in tag `v0.1.0` — the thing you download and submit. This page shows only **teaching excerpts**: annotated fragments chosen for explanation, not the runnable source.

The package serves two purposes, and it helps to keep them separate:

- It is a **demonstrator**: it proves the pattern runs end to end under a real scheduler, and its run produced the evidence bundle behind the applicability record above.
- It is a **template**: you edit it to run your own application, using the seams documented below.

Inside the package, `coordinator.py` and `worker.py` process inert JSON tasks on purpose. They are placeholders that exercise the orchestration mechanics; they are not an application.

## Files the workflow reads and writes

| File | Written by | Read by | Purpose | Needed by the pattern, or evidence-only? |
|---|---|---|---|---|
| `inputs/tasks.json` | you | coordinator | application inputs (inert JSON) | pattern |
| `expected/results.json` | you | verifier | expected outputs the demo verifier compares against | demonstrator/evidence only |
| `endpoint.json` | coordinator | launcher | loopback endpoint hand-off | pattern |
| `results.json` | coordinator | verifier | intermediate worker results; NOT a success claim | pattern (renamed `worker-results.json` in v0.2.0) |
| `result.json` | verifier | you / CI | the only success marker (`status: "success"`) | pattern |
| `events.jsonl` | launcher | audit tooling | ordered events proving readiness preceded every worker start | evidence |
| `diagnostics.json` | package | site + humans | stable failure IDs (`BSSW-*`) | pattern |
| `container/image-lock.json` | package | `acquire.sh` + humans | pinned base-image provenance | pattern |

All of these are machine-parsed JSON; `tasks.json` and `expected/results.json` are the only two a human authors.

> **Warning:** `results.json` and `result.json` differ by one letter and mean different things — the first is intermediate worker output, the second is the success marker. Release v0.2.0 renames the former to `worker-results.json` to remove the ambiguity.

## Adapt it to your own application

Two check layers exist, and they adapt differently:

- **The readiness gate is an orchestration concern.** It replaces Compose `depends_on`: workers must not start until the service can actually serve. Keep the gate; change only the `/health` contract to whatever proves your service can serve.
- **Result verification is an application concern.** It has no Compose equivalent. Replace `bin/verify.py` with your own success criteria — or remove it only if a zero exit truly means success for you, which is usually not true: a process can exit cleanly after producing wrong, partial, or stale output, and nothing else in the pattern checks that.

| Part | Keep or replace | Why |
|---|---|---|
| `#SBATCH` header + adapter variables | adapt values only | same mechanism, local account/partition/bounds |
| Storage setup (0700 job dir, binds) | keep | private job-scoped state is application-independent |
| Coordinator launch on loopback | replace with your service | your service is the point |
| Readiness probe (`bin/readiness.py`) | keep, change the contract | same bounded-gate role, different proof of ready |
| Worker launch loop (`srun` steps) | replace with your workers | your parallelism and payloads |
| `bin/verify.py` | replace | the documented replaceable seam for result checks |
| `expected/` | replace or delete | only the demo verifier consumes it |
| `container/Apptainer.def` + `image-lock.json` | replace with your image | pinned provenance for your base image |

To run your own application you change **10 files and 14 adapter variables**. The files: `slurm/baseline.sbatch` (directive values and the launch lines), `inputs/tasks.json` and `inputs/tasks.json.sha256`, `expected/results.json` (or delete it), `bin/coordinator.py`, `bin/worker.py`, `bin/verify.py`, `bin/validate_input.py`, `container/Apptainer.def`, and `container/image-lock.json`. Left unchanged: `bin/readiness.py` (change the contract, not the script), `bin/common.py`, `container/acquire.sh`, `diagnostics.json`, and `README.md`. The 14 adapter variables are the ones in the package README's adapter table: `WORKER_COUNT`, `TASK_COUNT`, `READINESS_TIMEOUT`, `CLEANUP_TIMEOUT`, `IMAGE_PATH`, `IMAGE_SHA256_FILE`, `INPUT_PATH`, `INPUT_SHA256_FILE`, `EXPECTED_PATH`, `BSSW_SCRATCH_ROOT`, `BSSW_APPTAINER_CMD`, `BSSW_SRUN_CMD`, `BSSW_SLURM_VERSION_CMD`, and `BSSW_SHA256_CMD`.

A worked example — a swapped worker payload, the demo verifier failing on it, and a replacement verifier — ships with `v0.2.0-rc.1` and will be pinned there.

## Procedure

1. Open the complete workflow package from the implementation reference above; the annotated excerpts are orientation, not a replacement for the release-pinned source.
2. Set an approved account and partition, wall time, CPU and memory, runtime module, image path and digest, scratch root, worker count, task count, and readiness timeout.
3. Run the prerequisite commands listed above.
4. Submit the baseline script. Keep account names, private hosts, and sensitive paths out of logs.
5. Wait for the scheduler to finish, then run the workflow [verifier](/about/glossary/).

## Expected result

A successful run exits zero, writes a machine-readable [success marker](/about/glossary/), contains the expected number of unique task results, and reports that every invariant passed. Worker-start events occur only after readiness.

## Diagnose a failure

- A rejected or unavailable scheduler command: [PREREQ-SLURM](/diagnostics/#bssw-prereq-slurm)
- A missing container runtime: [PREREQ-APPTAINER](/diagnostics/#bssw-prereq-apptainer)
- An unusable runtime directory or bind: [STORAGE-UNAVAILABLE](/diagnostics/#bssw-storage-unavailable)
- A coordinator readiness timeout: [READINESS-TIMEOUT](/diagnostics/#bssw-readiness-timeout)

## Safety and scope limitations

The baseline covers one node, loopback communication, bounded inert inputs, and ephemeral allocation-scoped state. It does not establish multi-node networking, durable service operation, cross-center portability, performance scaling, or production support.

## Next step

[Record your local values](/start/), then compare scheduler, network, storage, security, and runtime policy before adapting the workflow.
