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
## Scheduler and allocation

**allocation**
: Compute resources—such as cores, memory, GPUs, and wall time—that a scheduler grants temporarily to a job.

**batch scheduler**
: Software, such as Slurm or a PBS-family system, that assigns shared cluster resources and controls when jobs run.

**job**
: Submitted work that requests resources and runs inside an allocation until completion, cancellation, failure, or timeout.

**job step**
: A process the scheduler launches and tracks within an allocation; one job can contain several steps.

**orchestration boundary**
: The system responsible for starting and connecting processes. Compose fills this role on a laptop; on HPC, the scheduler allocation and launch script fill it together.

**reclamation**
: The scheduler returning allocated resources to the cluster when a job ends or reaches its wall-time limit.

**terminal state**
: The scheduler’s final classification of a job, such as `COMPLETED`, `FAILED`, `TIMEOUT`, or `CANCELLED`.

**wall time**
: The maximum duration requested for a job. The scheduler ends a job that reaches this limit.

## Runtime and storage

**bind**
: A host filesystem path mounted at a chosen path inside a container.

**immutable image**
: A read-only container image, such as an Apptainer `.sif` file, replaced through a verified rebuild rather than edited during a run.

**job-scoped scratch**
: Temporary writable storage assigned to one job and unsuitable for durable results.

**module load**
: A command that makes center-managed software available in the current environment.

**rootless runtime**
: A container runtime, such as Apptainer or Charliecloud, that launches containers without a privileged daemon or root access.

## Workflow mechanics

**checksum (SHA-256)**
: A content fingerprint used to verify that a file matches an expected artifact.

**inert input**
: Input parsed as data rather than evaluated as code or shell commands.

**loopback**
: The local-only network interface, usually `127.0.0.1`, used to keep a service reachable only from the same machine.

**readiness check**
: A test that confirms a service can perform its required operation before dependent work starts.

**semantic readiness**
: A readiness check that verifies a correct service response rather than only an open port.

**SSH tunnel**
: An encrypted forwarding path used to reach a remote service through SSH without publishing its port broadly.

**success marker**
: A machine-readable file written only after the workflow’s documented result checks pass.

Continue with [Scheduler as Orchestrator](/guide/scheduler-as-orchestrator/), the [Baseline Pattern](/guide/baseline-single-node-pattern/), or [Getting started](/start/).
