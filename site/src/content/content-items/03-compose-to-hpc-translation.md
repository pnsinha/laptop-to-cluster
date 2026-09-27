---
id: module-3-compose-to-hpc-translation
stable_slug: compose-to-hpc-translation
title: "Compose-to-HPC Translation: Basic Concepts"
description: "A primer on moving Docker Compose stacks to scheduler-managed, rootless-container workflows on shared HPC clusters."
module_number: 3
topics: [compose-to-hpc-translation, scheduler-as-orchestrator, rootless-containers]
status: draft
last_updated: "2026-07-31"
summary: "Learn the core mapping between Docker Compose concepts and HPC-native equivalents, and why the scheduler becomes the new orchestration boundary."
artifact_type: learning-module
keywords: [Compose, HPC, orchestration, scheduler, Apptainer, Charliecloud, readiness, portability]
audiences: [HPC learners, scientific software practitioners]
milestone: 2
publication_date: "2026-07-31"
applicable_release: v0.1.0
module_type: conceptual
learning_outcomes:
  - "Map Docker Compose services, images, volumes, ports, and dependencies to scheduler-managed HPC concepts."
  - "Explain why rootless runtimes replace Docker on shared clusters."
  - "Identify where center policy affects storage, networking, ports, and GPUs."
prerequisites:
  - { id: module-1-scheduler-orchestrator, check: "Read Module 1: Scheduler as Orchestrator" }
  - { id: module-2-baseline, check: "Read Module 2: Baseline Single-Node Pattern" }
section_kinds: [concept, limitations, next-steps]
estimated_minutes: 25
completion_check:
  kind: decision-exercise
  text: "Pick one Compose stack you use. List each Compose concept and the HPC equivalent you would need at your center, including the actual scheduler, runtime, scratch path, and GPU request syntax."
schedulers: [slurm, pbs-family]
container_runtimes: [apptainer, charliecloud]
related: [module-1-scheduler-orchestrator, module-2-baseline, start-guide]
learning_stage: baseline
authority:
  - { kind: sow, citation: "Fellowship SOW, Milestone 2", scope: "Expand portability patterns across schedulers, runtimes, and workflow shapes." }
  - { kind: project-decision, citation: "Milestone 2 scope", scope: "Publish a cross-cutting concept module before releasing scheduler-specific templates." }
sow_deliverable_id: M2-MODULE-3
deliverable_status: draft
---

## Why this translation is necessary

Research software is often a multi-service stack. A typical project has a dashboard, a database, a message queue, CPU workers, and sometimes GPU workers. On a laptop or a cloud VM, `docker compose up` starts all of these with one command.

Shared HPC clusters break that command in several ways at once:

- Docker daemons are disabled or forbidden for security reasons.
- A batch scheduler owns every resource. Services cannot "just stay up"; the scheduler allocates and reclaims them.
- Users do not have root, and privileged containers are blocked.
- Storage, networking, ports, and GPU access are controlled by center policy.

The result is that the same stack that works locally must be re-expressed in scheduler-managed, rootless-container terms.

## The central reframe

On a laptop, Docker Compose is the orchestration boundary. It starts services, connects them, and manages their lifetime. On HPC, a scheduler allocation and a launch script take over that role.

```text
allocation -> coordinator -> semantic readiness -> workers -> result verification
```

This module explains the mapping between Compose concepts and their HPC equivalents. Because the mapping is deterministic, it can be taught, reviewed, and eventually automated.

## Compose to HPC: the core dictionary

| Compose concept | HPC-native mapping | Decision to make |
|-----------------|--------------------|------------------|
| `service` | Tracked step inside one scheduler allocation | Which process coordinates, and which are workers? |
| `image` or `build` | Immutable image launched by a rootless runtime | Who builds and approves the image? |
| `depends_on` or `healthcheck` | Bounded semantic readiness gate | What response proves the coordinator is ready? |
| `volumes` | Explicit job-scoped scratch or approved storage bind | Which state is temporary, and which must persist? |
| `ports` | Loopback or a center-approved access path | Who needs access, and what does policy permit? |
| `device_requests` (GPU) | Scheduler CPU, memory, wall-time, or accelerator request | Which resources must be requested before launch? |
| `restart` policy | None; the job ends when the allocation ends | How is failure surfaced and recovered? |

The rest of this module expands each row.

## Rootless container runtimes

HPC sites reject Docker because it requires a privileged daemon. The project focuses on runtimes that work without root.

Apptainer runs through user namespaces or setuid and uses `.sif` images. It is common on ACCESS and NAIRR systems. Singularity is the predecessor to Apptainer and is largely compatible, though module names vary by center. Charliecloud is fully unprivileged through user namespaces and appears at centers that enable user namespaces.

The translation rules are the same across all three. The differences appear in bind semantics, image formats, and whether `fakeroot` is available for builds.

## Readiness checks replace `depends_on`

Compose `depends_on` waits for a container to start, not for it to be ready. On HPC, the replacement is an explicit readiness gate in the launch script. Semantic readiness means checking that the service can do its job, not just that a port is open.

Examples:

- For PostgreSQL, run `pg_isready` or connect and issue a trivial query.
- For an HTTP API, request a health endpoint and expect the correct status.
- For a queue service, confirm it accepts a test message.

A fixed `sleep` is not a substitute. It is slower and less reliable than a real check.

## Storage: job-scoped scratch and explicit binds

Container images on HPC are read-only. Anything a service writes at runtime must be bound to approved, job-scoped storage.

Use the center's job-scoped scratch path, such as `$SLURM_SCRATCH` or `$SCRATCH`. Create a private directory per job, bind it explicitly into the container, and never fall back silently to shared persistent storage or a world-writable path.

```bash
SCRATCH_DIR=$SLURM_SCRATCH/myjob-$SLURM_JOB_ID
mkdir -p "$SCRATCH_DIR"
apptainer exec --bind "$SCRATCH_DIR:/data" myapp.sif /run.sh
```

## Networking and ports

On a single-node baseline, services communicate over loopback (`127.0.0.1`). This avoids publishing ports broadly and respects center network policy. For interactive access to a dashboard or API, use SSH tunneling from your local machine to the compute node rather than exposing a public port. Multi-node service discovery is outside the single-node baseline.

## GPU access

GPU access is the hardest translation rule. Docker Compose `device_requests` becomes three things:

1. A scheduler GPU request (`--gres=gpu` in Slurm, `-l select=1:ngpus=` in PBS).
2. Binding the host CUDA driver libraries into the container.
3. Setting `CUDA_VISIBLE_DEVICES` so the application sees the right devices.

Example with Apptainer:

```bash
sbatch --gres=gpu:1 --wrap="apptainer exec --nv img.sif python gpu_worker.py"
```

On Charliecloud, GPU driver libraries are bound into the container explicitly.

> Example pending: a version validated on the project's test system will replace this.


## Services that assume root, especially databases

Many official container images run an entrypoint that calls `chown`, binds a privileged port, or drops to a system user. None of that works under a rootless runtime. The workaround is to invoke the binary directly with non-root data directories and unprivileged ports:

> Example pending: a version validated on the project's test system will replace this.


Building the image may also require `--fakeroot` so that files can be owned by root inside the image without needing root on the host.

## What varies by center

The translation rules apply everywhere; the exact values do not. Every center differs in:

- Scheduler syntax and partition or account names.
- Which container runtime is installed and how it is loaded.
- Job-scratch paths and quota.
- Network policy, including loopback restrictions and tunneling rules.
- GPU binding conventions and driver locations.
- Whether user namespaces and `fakeroot` are allowed.

Before adapting a workflow, record your local values: account, partition, wall time, CPU and memory, runtime module, image path and digest, scratch root, worker and task bounds, readiness timeout, and GPU request syntax.

## Optional cross-site remote triggering

For workflows that span centers or must be triggered without a login shell, the project optionally uses Globus Compute (and, where appropriate, Globus Flows) for cross-site triggering and transfer. This is an optional path, not the core architecture. The core model remains scheduler plus rootless containers.

## Example: a minimal service-plus-workers job

The simplest useful multi-service shape is one coordinator plus several workers inside a single allocation:

```bash
#!/bin/bash
#SBATCH --job-name=svc-workers-baseline
#SBATCH --nodes=1
#SBATCH --ntasks=5
#SBATCH --time=00:30:00

SCRATCH_DIR=$SLURM_SCRATCH/svc-workers-baseline
mkdir -p "$SCRATCH_DIR"

# 1. Start the coordinating service in the background
srun --exclusive -n1 apptainer exec --bind "$SCRATCH_DIR:/data" service.sif /start-service.sh &

# 2. Readiness check replaces Compose's depends_on
while ! nc -z localhost 6379; do sleep 1; done

# 3. Start workers only after the service is confirmed ready
srun --exclusive -n4 apptainer exec --bind "$SCRATCH_DIR:/data" worker.sif /start-worker.sh

wait
```

## Limitations

This module covers concepts, not production deployment. It does not establish multi-node networking, durable services, cross-center portability, performance scaling, or production support. Those topics are addressed in later modules.

## Next step

If you have not already done so, run the local-center checks in the [Getting started guide](/start/), then move to the [Baseline Pattern](/guide/baseline-single-node-pattern/) for a runnable single-node example.
