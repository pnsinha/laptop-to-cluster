---
id: BSSW-PREREQ-SLURM
stable_slug: bssw-prereq-slurm
title: "BSSW-PREREQ-SLURM: scheduler prerequisite unavailable"
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
## Failure signal
`sbatch` is unavailable, submission authorization is unknown, or a minimal submission is rejected before the job starts.
## Recovery
Check the center’s user guide; load only the documented scheduler client environment; request or select an authorized account and partition; then rerun `command -v sbatch` and the center’s non-submitting account check. Do not guess account names. Contact center support when authorization remains unclear.
## Continue without execution
Read [Scheduler as Orchestrator](/guide/scheduler-as-orchestrator/) and the [adaptation mapping](/start/) while access is resolved.
