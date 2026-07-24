---
title: "Scheduler as Orchestrator"
description: "Treating the batch scheduler as the orchestration boundary for multi-service Compose stacks on shared HPC"
module_number: 1
topics: [scheduler-as-orchestrator]
status: draft
last_updated: 2026-07-09
summary: "The core reframe for running a Docker Compose stack on HPC: the scheduler allocation replaces Compose as the orchestration boundary, and each piece of Compose's dependency model maps onto something the scheduler already understands."
---

# Scheduler as Orchestrator

## The gap

A multi-service stack — a UI, a database, a queue, GPU-backed workers — is trivial to stand up locally with Docker Compose. Ship the same stack to a shared HPC cluster and it stops working, for three reasons that all show up at once:

1. **No Docker.** Rootless, daemonless runtimes only (Apptainer, Singularity, Charliecloud).
2. **The scheduler owns everything.** Nothing "just stays up" — the batch system allocates and reclaims every resource.
3. **No sudo, no daemon.** Anything that assumed root at build or run time has to be rethought.

This module covers the first of those: how to stop fighting the scheduler and start treating it as the orchestrator Compose never had.

## The reframe

Docker Compose's job is to start services, wire them together, and keep them running as a set. On HPC, that job belongs to the scheduler instead. A Slurm or PBS allocation is the new orchestration boundary — everything Compose used to handle in `docker-compose.yml` has a scheduler-side equivalent:

| Compose concept | HPC equivalent |
|---|---|
| `service` | Scheduler job or job step (`sbatch`, `qsub`) |
| `image` / `build` | Container launched via Apptainer / Singularity / Charliecloud |
| `depends_on` | Explicit readiness check before the dependent step starts |
| `volumes` | Job-scoped scratch, bound explicitly at launch |
| `ports` | SSH tunneling for interactive access, where needed |
| `device_requests` (GPU) | Scheduler GPU flags (e.g., `--gres=gpu`) |

```bash
# Slurm + Apptainer
sbatch --gres=gpu:1 wrap.sh apptainer exec img.sif python svc.py

# PBS Pro + Apptainer
qsub -l select=1:ngpus=4 -- apptainer exec img.sif python svc.py
```

## Where this actually bites

Three friction points show up almost every time:

### Startup ordering

Compose's `depends_on` has no scheduler equivalent — there's no "wait for the database container to report healthy." The workaround is a manual readiness check in the launch script:

```bash
while ! nc -z localhost 5432; do sleep 1; done
```

Crude, but deterministic, and it composes cleanly with job steps.

### Job-scoped scratch, not bind volumes

Apptainer images are typically read-only. Anything a service writes at runtime — logs, PIDs, working state — needs an explicit bind to scratch that's scoped to the job, not a Compose-style named volume that persists on its own.

### Services that assume root

This is large enough to be its own module (see *Rootless Services and Databases*, forthcoming) — the short version is that many container images, especially databases, want to `chown` their data directory or bind privileged ports as root at startup, and none of that is available under a rootless runtime.

## Open question

How is your center handling startup ordering for multi-service jobs today — hand-rolled readiness checks, a workflow manager, something else entirely? We're collecting patterns from other centers as we build this out.

*(Repo/issue link to be added once the project repo is public.)*
