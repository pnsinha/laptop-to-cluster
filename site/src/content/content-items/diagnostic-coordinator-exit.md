---
id: BSSW-COORDINATOR-EXIT
stable_slug: bssw-coordinator-exit
title: "The coordinator stopped early"
summary: "Diagnose a coordinator that exited before it was ready or before results were checked."
artifact_type: diagnostic
topics: [diagnostics, coordinator]
keywords: [coordinator, exit, logs, startup]
audiences: [HPC learners]
milestone: 2
status: published
publication_date: "2026-10-15"
schedulers: [slurm]
container_runtimes: [apptainer]
related: [start-guide, module-2-baseline]
---
## Signal
The job prints `BSSW-COORDINATOR-EXIT` and exits with code 74. The coordinator exited before it published its address, published an invalid address, exited right after becoming ready, or exited before the results were checked.

## Likely causes
The image or input is wrong, the coordinator could not write its files in the run folder, or the job ran out of time or resources.

## Recovery steps
1. Open `logs/coordinator.log` in the run folder (`<scratch root>/bssw-<job id>/logs/`).
2. Fix the cause the log shows: image, input, or a scratch path that is not writable.
3. If the coordinator stopped mid-run, compare the job's elapsed time with its time limit.

**Warning:** Do not restart only the workers. A run needs the whole sequence from the start.

## Verify the recovery
A new run passes the readiness gate and keeps the coordinator running until the results are checked.

## Escalate
Report sanitized coordinator logs through [support](/about/support/).
