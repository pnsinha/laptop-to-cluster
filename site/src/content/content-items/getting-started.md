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
## Before you run anything: assumptions
You need authorized access to a Slurm cluster, an allocation/account, and Apptainer on the compute nodes. You need writable job-scoped storage, loopback access within one node, and permission to request the CPU, memory, and wall time the workflow asks for. You do **not** need Docker, root access, inbound public ports, or a persistent service.

## Prerequisite checks
1. Run `command -v sbatch` and confirm your center's account/partition syntax. If it fails, see [BSSW-PREREQ-SLURM](/diagnostics/bssw-prereq-slurm/).
2. Run `command -v apptainer` and `apptainer --version` in the module environment the job will use. If it fails, see [BSSW-PREREQ-APPTAINER](/diagnostics/bssw-prereq-apptainer/).
3. Confirm a writable job-scoped location with enough quota for the image, cache, and output files. If it fails, see [BSSW-STORAGE-UNAVAILABLE](/diagnostics/bssw-storage-unavailable/).

A failed check blocks execution only. You can still read the modules, the mapping below, and every diagnostic page without satisfying a prerequisite.

## Values to adapt for your center
Write down your account/project, partition/queue, wall time, CPU and memory requests, runtime module command, image path and digest, scratch root, worker/task bounds, readiness timeout, and any tunnel or accelerator request. Do not copy example account names, paths, or module versions from this guide.

## Compose-to-HPC mapping
| Compose responsibility | HPC adaptation |
|---|---|
| services | exclusive scheduler steps inside one allocation |
| dependencies | a readiness gate that polls until the service actually answers |
| volumes | job-scoped scratch, bound explicitly into each container |
| ports | loopback by default; reached over an SSH tunnel |
| device requests | scheduler resource flags (e.g. `--gres=gpu`) |
| restart/lifecycle | scheduler state, signal traps, bounded cleanup |

## Run and verify
1. Get the immutable v0.1.0 workflow and verify its recorded digest.
2. Apply only the local values above. Keep the task, worker, and timeout bounds.
3. Submit the baseline script once. Record the submission ID privately.
4. Confirm readiness happens before any worker starts. If the readiness wait expires, see [BSSW-READINESS-TIMEOUT](/diagnostics/bssw-readiness-timeout/).
5. Accept the run as successful only when the scheduler state, exit code, result file, expected item count, uniqueness, and verifier output all agree. [Module 2](/guide/baseline-single-node-pattern/) has the exact completion check.
