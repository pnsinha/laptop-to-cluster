---
id: adoption-evaluate
stable_slug: evaluate
route_namespace: adoption
title: "Evaluate and adopt"
description: "What the Laptop-to-Cluster pattern assumes about your center, what was tested and what was not, and when a service your center already runs is the better choice."
summary: "What the pattern assumes, where it was tested, and when a service your center already runs is the better choice."
artifact_type: checklist
topics: [adoption, evaluation]
keywords: [adoption, evaluation, assumptions, limits, HPC centers, checklist]
audiences: [research software engineers, HPC center staff]
milestone: 2
status: published
publication_date: "2026-10-15"
last_updated: "2026-10-15"
last_reviewed: "2026-10-15"
applicable_release: v0.1.0
schedulers: [slurm]
container_runtimes: [apptainer]
related: [module-3-compose-to-hpc-translation, module-2-baseline]
learning_stage: adoption
authority:
  - { kind: project-decision, citation: "Milestone 2 scope", scope: "A draft adoption guide for research software engineers and center staff; the v1.0 checklist arrives with the final release." }
---
This page is for research software engineers and center staff who want to know whether the pattern fits their cluster before anyone invests time in it. It states what the pattern assumes, what has and has not been run, and when to choose something else.

## What it is

A single-node, single-allocation pattern. One coordinator and one to sixteen worker steps run under Slurm with a rootless container runtime, behind a readiness gate that checks for an exact answer, followed by a result check that belongs to the application. When the allocation ends, everything stops. It is a learning guide with a reference workflow, not a platform or a service.

## Assumptions about your center

| Assumption | Why the example needs it | How to check |
|---|---|---|
| Slurm job context and `srun` | The script runs inside an allocation and starts every service as a job step with `srun`. | Run `command -v sbatch srun` on a login node. The script also stops with a named error if it is not inside a Slurm job. |
| Exclusive single-task job steps are allowed | Each service gets its own `srun --exclusive` step. | Ask your center, or submit a short two-step test job and read the scheduler's reply. |
| Apptainer on the compute nodes | The services run in an Apptainer image. | In a short job on a compute node, run `apptainer --version`. |
| Loopback connections work on a compute node | The coordinator listens on 127.0.0.1, and the workers connect to it there. | Ask your center whether compute-node loopback connections are permitted on your partition. |
| A private, writable, job-scoped scratch path | The script keeps all job state in one owner-only folder. | Ask your center which path is job-scoped, then set `BSSW_SCRATCH_ROOT` to it. |
| `sha256sum` on the compute nodes | The script checks the image and the input against recorded checksums. | Run `command -v sha256sum` in a job on a compute node. |
| The image and input are regular files with recorded SHA-256 values | The script refuses to run when a checksum does not match. | Run `sha256sum -c` on the input's record, as [Run the example](/start/) shows. |

<h2 id="not-tested">What was tested where</h2>

Three labels describe every claim on this site. Tested means it ran on a named cluster. Shim-tested means it ran off-cluster, against test fixtures or local Docker, and never on a cluster. Designed, not run means it follows the same pattern, but nobody has run it.

**Tested.** The summary below is generated from the test record, so it always names the cluster, versions and date of the current record.

<!-- l2c:record-summary -->

**Shim-tested (off-cluster only).** The workflow's logic runs against fake scheduler, runtime, clock and file-system boundaries, in eight scenarios: success, invalid input, early coordinator exit, worker failure, checksum mismatch, verification failure, cleanup failure and readiness timeout. These runs never start a container, so they are not cluster evidence.

**Designed, not run.** None of the following has been run:

- Other centers.
- PBS-family schedulers.
- Charliecloud for this workflow.
- GPUs.
- More than one node.
- More than two workers or four tasks. The script accepts up to sixteen workers, but only the smaller shape was run.
- An SSH tunnel from your laptop to the coordinator.
- The wall-time signal and the forced stop after a grace period.
- The Compose file shown on the home page, which is simplified for display.

## Limits

- One node, loopback only, inert and bounded inputs, nothing kept beyond the allocation, and no production support.
- Nothing supervises or restarts a service that dies.
- Readiness is bounded at 300 seconds, so a service that loads slowly needs a new bound.
- The coordinator has no authentication. On a node shared with other jobs, loopback is not private: request whole nodes, or add authentication, for anything sensitive.
- Never put credentials in the inputs.

<h2 id="when-not">When not to use this pattern</h2>

Choose something else when any of this is true.

- **You need a stable public endpoint**, or a service that must stay up longer than a wall-time limit.
- **You are running a multi-tenant service**, with a shared entry point and per-tenant routing.
- **Live data must persist beyond the allocation.** Job-scoped scratch is unsuitable for durable results.
- **You need operations**: monitoring, backups, high availability or rolling upgrades.
- **Single components must recover on their own**, as in multi-day pipelines. A tool built for recovering components, such as a workflow engine, Ray on Slurm or SkyPilot, is a better fit.
- **Your stack needs multi-node coupling.** The pattern covers one node.
- **Your center already offers a platform for this**, such as a managed service, Kubernetes or an Open OnDemand app. Use it.

## Decision grid: results or uptime

A guide, not a rule. Find the row that matches what your stack is for, and the column that matches how you would handle a failure.

| | A whole-stack restart is acceptable | A whole-stack restart is not acceptable |
|---|---|---|
| **Results are the product** | This pattern fits. Start with [Translate a Compose file](/guide/compose-to-hpc-translation/). | Use a tool that recovers individual components rather than restarting everything. |
| **Staying up is the product** | Use a service your center already runs, or a VM. | Use a platform built for services, such as Kubernetes or a managed service. |

## Draft adoption checklist

This is a draft: v1.0 arrives with the final release, and the full checklist with it. Until then, confirm each of these before you commit time.

- Your stack produces results, and a whole-stack restart is acceptable.
- Your scheduler allows exclusive single-task job steps.
- Apptainer is available on the compute nodes.
- Compute-node loopback connections are permitted.
- A private, job-scoped scratch path exists, and you know how long it lasts.
- Users have a way to copy results out before the job ends.
- Someone owns building and approving the image.
- For anything sensitive, you have chosen between whole-node requests and added authentication.

## Key points

- The pattern assumes Slurm, exclusive single-task job steps, Apptainer, compute-node loopback and private scratch. Each assumption has a way to check it.
- The test record states what was run, where and when. Everything else is Shim-tested or Designed, not run.
- It is the wrong tool for public endpoints, multi-tenant services, durable data, operations needs, self-recovering components and multi-node coupling.
- If your center already offers a platform for your case, use it.
