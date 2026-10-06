---
id: BSSW-WORKER-EXIT
stable_slug: bssw-worker-exit
title: "A worker step failed"
summary: "Diagnose a worker job step that exited with an error."
artifact_type: diagnostic
topics: [diagnostics, workers]
keywords: [worker, srun, job step, exclusive]
audiences: [HPC learners]
milestone: 2
status: published
publication_date: "2026-10-15"
schedulers: [slurm]
related: [start-guide, module-2-baseline]
---
## Signal
The job prints `BSSW-WORKER-EXIT` and exits with code 76. At least one worker job step ended with an error.

## Likely causes
The job does not have enough CPUs for the number of workers, your center restricts exclusive single-task job steps, or the worker could not reach the coordinator.

## Recovery steps
1. Open the worker logs in the run folder's `logs/` directory. Each worker has its own log.
2. Each worker step uses one CPU. Compare `WORKER_COUNT` with the job's `--cpus-per-task`, and lower the count or raise the CPUs.
3. If `srun` rejects the step, ask your center whether exclusive single-task steps are allowed.

**Warning:** Do not remove the exclusive option from the step launcher to make it run.

## Verify the recovery
Every worker exits cleanly and the run reaches the verification step.

## Escalate
Report sanitized worker logs and your center's step policy through [support](/about/support/).
