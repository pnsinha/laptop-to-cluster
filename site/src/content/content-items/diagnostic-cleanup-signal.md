---
id: BSSW-CLEANUP-SIGNAL
stable_slug: bssw-cleanup-signal
title: "The job was stopped by a signal"
summary: "Work out why the scheduler or a user ended the job early."
artifact_type: diagnostic
topics: [diagnostics, cleanup]
keywords: [cancel, signal, timeout, wall time]
audiences: [HPC learners]
milestone: 2
status: published
publication_date: "2026-10-15"
schedulers: [slurm]
related: [start-guide, module-2-baseline]
---
## Signal
The job prints `BSSW-CLEANUP-SIGNAL` and exits with code 78. The job received a termination signal (terminate, interrupt, or hang-up) before it finished. No success file is left behind.

## Likely causes
Someone ran `scancel`, or the job reached its wall-time limit. The wall-time signal path is **Designed, not run**: it has not been exercised on a cluster.

## Recovery steps
1. Run `sacct -j <job id> --format=JobID,State,Elapsed,Timelimit`.
2. If the state is `TIMEOUT`, raise `#SBATCH --time` and submit again.
3. If the state is `CANCELLED`, find out who cancelled it before you submit again.

**Warning:** Do not count partial files in the run folder as results.

## Verify the recovery
A new run finishes before its time limit and writes `result.json`.

## Escalate
If the scheduler ended the job without a request from you, ask center support for the reason.
