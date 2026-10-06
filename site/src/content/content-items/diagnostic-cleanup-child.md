---
id: BSSW-CLEANUP-CHILD
stable_slug: bssw-cleanup-child
title: "A job step did not stop during cleanup"
summary: "Diagnose a cleanup that could not stop every job step in time."
artifact_type: diagnostic
topics: [diagnostics, cleanup]
keywords: [cleanup, timeout, job step, KILL]
audiences: [HPC learners]
milestone: 2
status: published
publication_date: "2026-10-15"
schedulers: [slurm]
related: [start-guide, module-2-baseline]
---
## Signal
The job prints `BSSW-CLEANUP-CHILD` and exits with code 79. When the job ended, at least one job step did not stop within the cleanup time limit. The script removes any success file.

## Likely causes
A step ignored the polite stop and the forced stop, or the cleanup time limit is shorter than the step needs. The forced-stop path is **Designed, not run**: it has not been exercised on a cluster.

## Recovery steps
1. Check for leftover steps with `squeue -u $USER` and `sacct -j <job id>`.
2. If steps need longer to stop, raise `CLEANUP_TIMEOUT` (1 to 60 seconds).
3. Read the coordinator and worker logs in the run folder for a step that hangs on exit.

**Warning:** Do not treat a run that ended with this code as a success, even if `results.json` exists.

## Verify the recovery
A new run ends with exit code 0 and no leftover steps.

## Escalate
Report the sanitized logs through [support](/about/support/).
