---
title: "Baseline Pattern: Single-Node Service + Workers"
description: "A minimal, runnable single-node reference workflow: one coordinating service and N workers under a single scheduler allocation"
module_number: 2
topics: [scheduler-as-orchestrator]
status: draft
last_updated: 2026-07-09
summary: "The simplest shape of a multi-service Compose stack translated to HPC: one allocation, one coordinating service (e.g., a queue or database), and a pool of worker processes — the baseline this fellowship's reference workflow is built around."
---

# Baseline Pattern: Single-Node Service + Workers

## What this covers

The simplest multi-service shape worth translating first: one coordinating service (a queue, a database, or both) plus a pool of workers that consume from it — all inside a **single scheduler allocation on a single node**. This is the baseline the fellowship's Milestone 1 reference workflow is built around, and the pattern most other translations (multi-node, cross-site) extend from.

*This reference workflow is being built and tested on Anvil (Slurm + Apptainer, via an ACCESS Explore allocation). Details below will be filled in as validation completes — nothing here should be read as validated beyond what's explicitly marked done.*

## Shape of the job

```bash
#!/bin/bash
#SBATCH --job-name=svc-workers-baseline
#SBATCH --nodes=1
#SBATCH --ntasks=5
#SBATCH --time=00:30:00

SCRATCH_DIR=$SLURM_SCRATCH/svc-workers-baseline
mkdir -p "$SCRATCH_DIR"

# 1. Start the coordinating service in the background
srun --exclusive -n1 apptainer exec \
  --bind "$SCRATCH_DIR:/data" \
  service.sif /start-service.sh &

# 2. Readiness check -- no depends_on, so we wait explicitly
while ! nc -z localhost 6379; do sleep 1; done

# 3. Start N workers once the service is confirmed up
srun --exclusive -n4 apptainer exec \
  --bind "$SCRATCH_DIR:/data" \
  worker.sif /start-worker.sh

wait
```

## Why this shape, specifically

- **One allocation, one node** — no cross-node networking to reason about yet. That's deliberately deferred to a later module.
- **The service starts first, workers wait** — using the readiness-check pattern from *Scheduler as Orchestrator*.
- **State lives on job-scoped scratch** (`$SLURM_SCRATCH`), not a Compose-style named volume — it's created fresh per job and bound explicitly into each container.

## Getting started

1. Build or pull `service.sif` and `worker.sif` (Apptainer images for your coordinating service and worker process).
2. Adjust the readiness-check port and `--ntasks` for your own service/worker counts.
3. Submit with `sbatch baseline.sbatch` and check `squeue` — workers should not report as running until the service passes its readiness check.

*(Scripts referenced above will live in the companion repo — link to be added once the repo is public.)*

## Open question

> What's the smallest multi-service pattern in your own work that broke when it left Compose? We want to make sure this baseline generalizes past our own use case.