---
id: start-guide
stable_slug: getting-started
route_namespace: start
title: Getting started
summary: "Prerequisites, assumptions, and the values that differ at every HPC facility."
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
## Can I run this?

Confirm these assumptions before execution:

- **Allocation:** you have authorized Slurm access, an account, and permission to request the needed CPU, memory, and wall time.
- **Security and network:** the coordinator can use loopback within one node; no root access, privileged daemon, or inbound public port is required.
- **Storage:** a center-approved job-scoped path has enough quota for the image, cache, runtime state, and outputs.
- **Runtime and image:** Apptainer is available on compute nodes, and you have an approved image path and digest.
- **Readiness:** a bounded semantic probe can reach the coordinator before any worker starts.

## Check the prerequisites

1. Run `command -v sbatch` and confirm your center's account and partition syntax. If either fails, use [BSSW-PREREQ-SLURM](/diagnostics/bssw-prereq-slurm/).
2. Run `command -v apptainer` and `apptainer --version` in the compute-node module environment. If either fails, use [BSSW-PREREQ-APPTAINER](/diagnostics/bssw-prereq-apptainer/).
3. Create and remove a private test file through the intended container bind. If that fails, use [BSSW-STORAGE-UNAVAILABLE](/diagnostics/bssw-storage-unavailable/).

## Record your local values

Write down the account or project, partition or queue, wall time, CPU and memory, runtime module, image path and digest, scratch root, worker and task bounds, readiness timeout, and any approved tunnel or accelerator request.

## Run

1. Obtain the workflow from the repository link in [Module 2](/guide/baseline-single-node-pattern/).
2. Apply the local values without exceeding the documented worker, task, or timeout bounds.
3. Submit the baseline script once.
4. Confirm the readiness gate passes before workers start. If it expires, use [BSSW-READINESS-TIMEOUT](/diagnostics/bssw-readiness-timeout/).

## Verify

Accept success only when the scheduler state, exit status, result file, expected item count, uniqueness, and verifier output agree. [Module 2](/guide/baseline-single-node-pattern/) states the complete result-based completion check.

## If execution still fails

Use the [diagnostic registry](/diagnostics/) to match the visible symptom. If no entry matches, [report a workflow defect](/about/support/) with sanitized commands, expected behavior, and observed behavior.
