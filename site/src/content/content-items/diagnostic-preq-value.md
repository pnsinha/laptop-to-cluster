---
id: BSSW-PREQ-VALUE
stable_slug: bssw-preq-value
title: "An adapter value is out of bounds"
summary: "Correct a worker, task, or timeout value that the launcher rejected."
artifact_type: diagnostic
topics: [diagnostics, prerequisites]
keywords: [bounds, WORKER_COUNT, TASK_COUNT, timeout]
audiences: [HPC learners]
milestone: 2
status: published
publication_date: "2026-10-20"
schedulers: [slurm]
related: [start-guide, module-2-baseline]
---
## Signal
The job prints `BSSW-PREQ-VALUE` and exits with code 67. The message names the value: `WORKER_COUNT` must be a whole number from 1 to 16, `TASK_COUNT` from 1 to 256, `READINESS_TIMEOUT` from 1 to 300, and `CLEANUP_TIMEOUT` from 1 to 60.

## Likely causes
The value passed through `--export` is not a whole number, is empty, or is outside its range.

## Recovery steps
1. Read which value the message names.
2. Correct it in your `sbatch --export=...` list.
3. Submit again.

**Warning:** Do not edit the bounds in the script. They keep a run small enough for a shared node.

## Verify the recovery
The next submission gets past the prerequisite checks.

## Escalate
If you need larger values, ask your center whether the node and partition allow them first.
