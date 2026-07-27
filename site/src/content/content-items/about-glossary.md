---
id: glossary
stable_slug: glossary
title: Glossary
summary: "Definitions for the HPC and container terms used across the Laptop-to-Cluster guide."
artifact_type: report
route_namespace: about
topics: [glossary]
keywords: [glossary, HPC, definitions, terminology]
audiences: [HPC learners, scientific software practitioners, general public]
milestone: 1
status: published
publication_date: "2026-07-27"
---
This glossary defines the terms that appear in the [Scheduler as Orchestrator](/guide/scheduler-as-orchestrator/) and [Baseline Pattern](/guide/baseline-single-node-pattern/) modules. Each term is also defined inline the first time it is used in a module; this page is the reusable reference.

## The core reframe

**allocation**
: A lease on compute resources (cores, memory, GPUs, wall time) that a batch scheduler grants to a job. The allocation is the HPC equivalent of "the machine your Compose stack runs on," except it is temporary, requested at submission time, and reclaimed when the job ends. The scheduler allocation replaces Compose as the orchestration boundary.

**orchestration boundary**
: The system responsible for starting services, wiring them together, and keeping them running. With Docker Compose, Compose itself is the boundary; on HPC, the scheduler allocation is the boundary, and a launch script does the wiring inside it.

**reclamation**
: The scheduler taking resources back when a job ends or hits its wall time. There is no "leave it running." The moment the job exits or times out, the scheduler reclaims the node for the next job in the queue.

## Scheduler concepts

**batch scheduler**
: The software that owns all compute resources on a shared cluster and decides which jobs run where and when (Slurm, PBS family). Nothing runs on a compute node unless the scheduler assigned it there.

**job**
: A unit of work submitted to the scheduler. A job requests resources (nodes, cores, GPUs, time) and, once those are granted, runs inside an allocation until it completes or is killed.

**job step**
: A process the scheduler launches and tracks *within* an allocation. A single job can run multiple steps (e.g. one step for the coordinator, one per worker). A job step is the scheduler-side analog of a Compose `service`.

**wall time**
: The maximum run time a job requests from the scheduler. When the wall time elapses, the scheduler kills the job regardless of whether it finished. Underestimating wall time gets jobs killed; overestimating lengthens queue wait.

**terminal state**
: The final state the scheduler records for a job: `COMPLETED` (finished, exit 0), `FAILED` (exited nonzero), `TIMEOUT` (hit its wall time), or `CANCELLED`. The terminal state is what evidence records, distinct from the application's own exit code.

**module load**
: A command (via the Lmod or environment-modules system) that makes a specific software version available on the compute node, e.g. `module load apptainer`. HPC centers use this instead of per-user installs to avoid filesystem sprawl.

## Container runtime concepts

**rootless runtime**
: A container runtime that launches containers without a privileged daemon and without root access (Apptainer/Singularity, Charliecloud). This is what HPC centers run, because no unprivileged user can run the Docker daemon.

**immutable image**
: A read-only container image (a `.sif` file) that cannot be modified at runtime. You cannot `exec` in and edit files the way you can with Docker; rebuilding requires re-creating the image and re-verifying its checksum.

**bind**
: Mounting a host filesystem path into a container at a target path (Apptainer's `--bind $SCRATCH:/work`). This is the rootless-runtime equivalent of a Docker volume mount. It is how writable state reaches a container that otherwise sees a read-only image.

**scratch**
: Fast, temporary filesystem storage a center provides for running jobs. Scratch is typically per-job or purged on a schedule. It is *not* durable. "Job-scoped scratch" means a directory the scheduler creates for one job and reclaims when it ends; this is where Compose-style writable state has to live on HPC.

**loopback**
: The network address `127.0.0.1` (localhost), reachable only from the same machine. On a shared compute node, services bind loopback so they are not exposed to other users' jobs; a user reaches a loopback service over an SSH tunnel rather than a published port.

**SSH tunnel**
: A way to reach a port on a compute node (typically bound to loopback) by forwarding it through the login node over SSH. This is how a dashboard running on a compute node is viewed from a laptop, since compute nodes are usually not directly addressable.

## Workflow mechanics

**readiness check**
: A test that a service is actually ready to serve, not just that its process has started. Compose's `depends_on` with a `healthcheck` is the laptop analog; on HPC the launch script polls a health endpoint or sentinel file because the scheduler has no "is the database up" concept.

**semantic readiness**
: A readiness check that verifies the service *answers correctly* (e.g. an HTTP `/health` endpoint returns the expected status) rather than merely that a TCP port is open. "Semantic" distinguishes "it responds" from "it works."

**inert input**
: Data passed to a workflow as plain values (JSON), never evaluated as code or shell. Inert inputs are a security property: they cannot inject commands even if malformed, because the workflow reads them as data, not as instructions.

**checksum (SHA-256)**
: A short fingerprint of a file's contents that changes if even one byte differs. The workflow verifies image and input checksums before launching so that the evidence can prove *which exact* image and input ran, not just "an image."

**success marker**
: A file the workflow writes *only* after every invariant (result count, schema, ordering) passes. Its presence is the machine-readable success signal; its absence after a nonzero exit is the failure signal. This replaces "the container reported healthy" as the definition of success.

## Where to go next
Return to [Scheduler as Orchestrator](/guide/scheduler-as-orchestrator/) or continue to the [Baseline Pattern](/guide/baseline-single-node-pattern/). For the values that differ at every center, see [Getting started](/start/).
