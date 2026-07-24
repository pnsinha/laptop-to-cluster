---
id: start-guide
stable_slug: getting-started
route_namespace: start
title: Getting started
summary: "A bounded path from system prerequisites and local adaptation through baseline result verification."
artifact_type: guidance-note
topics: [adaptation, baseline-workflow]
keywords: [allocation, Apptainer, prerequisites, Slurm, verification]
audiences: [first-time HPC learners, scientific software practitioners]
milestone: 1
status: published
publication_date: "2026-07-31"
schedulers: [slurm]
container_runtimes: [apptainer]
related: [module-1-scheduler-orchestrator, module-2-baseline, BSSW-PREREQ-SLURM, BSSW-PREREQ-APPTAINER, BSSW-READINESS-TIMEOUT]
learning_stage: baseline
authority: [{ kind: project-decision, citation: "Milestone 1 bounded workflow", scope: "Prerequisite and adaptation sequence for the single-node baseline." }]
---
## Before execution: assumptions
The baseline assumes authorized access to a Slurm center, an allocation/account, Apptainer on compute nodes, an immutable image and workflow release, center-approved writable storage, loopback communication inside one node, and permission to submit the requested CPU, memory, and wall-time shape. It does not require Docker, root access, inbound public ports, or persistent services.

## Prerequisite checks
1. Run `command -v sbatch` and identify the center’s account/partition submission syntax. On failure, use [BSSW-PREREQ-SLURM](/diagnostics/bssw-prereq-slurm/).
2. Run `command -v apptainer` and `apptainer --version` in the same module environment intended for the job. On failure, use [BSSW-PREREQ-APPTAINER](/diagnostics/bssw-prereq-apptainer/).
3. Confirm a writable job-scoped location and enough quota for image/cache/output files. On failure, use [BSSW-STORAGE-UNAVAILABLE](/diagnostics/bssw-storage-unavailable/).

A failed check blocks execution only. The conceptual modules, mapping below, and all diagnostics remain public and useful without satisfying a prerequisite.

## Values to adapt locally
Record your account/project, partition/queue, wall time, CPU and memory requests, runtime module command, immutable image path and digest, scratch root, worker/task bounds, readiness timeout, and any approved tunnel or accelerator request. Do not copy example account names, paths, or module versions blindly.

## Compose-to-HPC mapping
| Compose responsibility | HPC adaptation |
|---|---|
| services | exclusive scheduler steps inside one allocation |
| dependencies | bounded semantic readiness gate |
| volumes | explicit job-scoped scratch/storage binds |
| ports | loopback by default; center-approved access path |
| device requests | scheduler resource flags |
| restart/lifecycle | scheduler state, traps, bounded cleanup, explicit retry policy |

## Bounded execution and verification
1. Acquire the immutable v0.1.0 workflow and verify the documented digest.
2. Apply only the local values listed above; retain task, worker, and timeout bounds.
3. Submit the baseline script once and record the submission ID privately.
4. Confirm readiness precedes every worker-start event. Use [BSSW-READINESS-TIMEOUT](/diagnostics/bssw-readiness-timeout/) if the bounded wait expires.
5. Accept completion only when scheduler state, exit code, machine result, expected item count, uniqueness, and verifier output all agree. Continue to [Module 2](/guide/baseline-single-node-pattern/) for the exact completion check.
