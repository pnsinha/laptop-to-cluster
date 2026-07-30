---
id: BSSW-PREREQ-SLURM
stable_slug: bssw-prereq-slurm
title: "Scheduler prerequisite is unavailable"
summary: "Resolve a missing Slurm command, allocation, account, or submission policy before baseline execution."
artifact_type: diagnostic
topics: [diagnostics, Slurm]
keywords: [account, allocation, sbatch, Slurm]
audiences: [HPC learners]
milestone: 1
status: published
publication_date: "2026-07-31"
schedulers: [slurm]
related: [start-guide, module-2-baseline]
---
## Signal
`sbatch` is unavailable, submission authorization is unknown, or a minimal submission is rejected before the job starts.

## Likely causes
The scheduler client is not loaded, the account or partition is unauthorized, or the center requires a site-specific submission option.

## Recovery steps
1. Read the center user guide.
2. Load only the documented scheduler client environment.
3. Select an authorized account and partition.
4. Rerun `command -v sbatch` and the center's non-submitting account check.

**Warning:** Do not guess account names.

## Verify the recovery
The scheduler command is available and the center confirms an authorized submission target.

## Escalate
Contact center support when authorization remains unclear.
