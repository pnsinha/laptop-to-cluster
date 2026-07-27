---
id: module-1-scheduler-orchestrator
stable_slug: scheduler-as-orchestrator
title: "Scheduler as Orchestrator"
description: "Treating the batch scheduler as the orchestration boundary for multi-service Compose stacks on shared HPC"
module_number: 1
topics: [scheduler-as-orchestrator]
status: published
last_updated: "2026-07-27"
summary: "The core reframe for running a Compose stack on HPC: the scheduler allocation replaces Compose as the orchestration boundary."
artifact_type: learning-module
keywords: [Compose, HPC, orchestration, scheduler]
audiences: [HPC learners, scientific software practitioners]
milestone: 1
publication_date: "2026-07-31"
applicable_release: v0.1.0
module_type: conceptual
learning_outcomes: ["Map Compose responsibilities to scheduler-managed HPC concepts", "Identify where readiness, storage, networking, and privilege assumptions require adaptation"]
prerequisites: []
estimated_minutes: 20
section_kinds: [concept, limitations, next-steps]
completion_check: { kind: decision-exercise, text: "Choose one local Compose stack and record who should own allocation, startup order, runtime state, access, and accelerators on your center." }
schedulers: [slurm]
container_runtimes: [apptainer]
related: [module-2-baseline, start-guide]
learning_stage: baseline
supporting_artifacts:
  - { repository: "https://github.com/pnsinha/laptop-to-cluster", release: v0.1.0, path: README.md, integrity: "sha256:c54a472d6bfc51ff7023a8f1807db245a2e4aa23e81ff80bc9af1e1fa5f325dc" }
authority:
  - { kind: sow, citation: "Fellowship SOW, Milestone 1", scope: "Publish the scheduler-as-orchestrator learning module." }
  - { kind: project-decision, citation: "Milestone 1 architecture", scope: "Use one allocation as the bounded baseline orchestration boundary." }
sow_deliverable_id: M1-MODULE-1
deliverable_status: complete
completion_evidence: { id: m1-module-1-publication, path: evidence/README.md, integrity: "sha256:2fb0fd2e84a083ee33564797f69e63d40fc225987ebe94ea41832995713aca6a" }
---
## Concepts

A multi-service stack (a UI, a database, a queue, GPU-backed workers) is trivial to stand up on a laptop with Docker Compose: one file declares every service, Compose starts them, wires them together, and keeps them running. Ship the same stack to a shared HPC cluster and that mental model breaks in three places at once. There is no Docker daemon, because centers run **rootless** runtimes like Apptainer that launch containers without the privileged daemon Docker relies on. Nothing stays up on its own, because a **batch scheduler** (Slurm, PBS) owns every compute resource and reclaims it the moment a job ends (**reclamation**). And nothing assumes root, so anything that expected to `chown` a directory or bind a privileged port at startup has to be rethought.

The reframe: on HPC, the scheduler **allocation** (the leased compute a job holds for its wall time) replaces Compose as the orchestration boundary. Compose's job was to start services, wire them, and keep them alive. On HPC that job belongs to the launch script running *inside* the allocation. Each piece of Compose's dependency model maps onto something the scheduler already understands.

| Compose concept | Scheduler-managed HPC mapping | Why it shifts |
|---|---|---|
| `service` | A scheduler **job step** inside the allocation | A job step is a process the scheduler launches and tracks within your allocation. Compose's always-on service has no scheduler equivalent, so a long-running service becomes a step you start and tear down yourself. |
| image or build | An **immutable image** launched with a rootless runtime | HPC has no Docker daemon to build or run images, so you pre-build a read-only image (a `.sif`) and launch it with Apptainer. "Immutable" means you cannot `exec` in and edit it, which is why image checksums matter. |
| `depends_on` | A bounded **semantic readiness check** before dependent steps | Compose waits for a container to *start*. The scheduler has no notion of "is the database ready," so the launch script polls a health endpoint or sentinel file. "Semantic" means it checks the service actually answers, not just that the process exists. |
| volume | Explicit **job-scoped scratch** or center-approved storage bind | HPC has no Docker daemon to manage named volumes, so writable state must live on a **scratch** filesystem (fast, temporary storage) the scheduler gives the job for its lifetime. It is created fresh per job and bound explicitly into each container. |
| port | **Loopback** by default; approved tunnel or network path when needed | Compute nodes are shared, so a fixed port collides with other jobs. Services bind **loopback** (`127.0.0.1`, reachable only from the same node) and are reached over an SSH tunnel rather than published to a host port. |
| device request | Scheduler resource request, such as a GPU **allocation** | In Compose you request a GPU in the YAML. On HPC the scheduler owns all accelerators, so you ask for one at submission time (e.g. `--gres=gpu:1`) and the scheduler assigns it from the allocation. |

Term definitions are consolidated in the [glossary](/about/glossary/); each is also defined inline the first time it appears above.

### Decision exercise
For one workflow, write down the coordinating service, worker count, startup dependency, writable state, user access path, and accelerator needs. Mark each responsibility as scheduler policy, container-runtime behavior, launch-script logic, or local-center adaptation. The goal is to notice *before* you submit which Compose assumptions each service carries. Those are exactly the ones that will break on the cluster.

## Known limitations
This conceptual mapping does not make a workflow portable unchanged. Scheduler syntax, network policy, storage, security controls, runtime modules, and accelerator flags vary by center. Multi-node service discovery, persistent databases, privileged ports, and production availability are outside the single-node Milestone 1 boundary.

## Next steps
Continue to [Baseline Pattern: Single-Node Service + Workers](/guide/baseline-single-node-pattern/) for the bounded runnable shape, or review [Getting started](/start/) and its local-adaptation checklist. The immutable repository reference above provides the release context; support and mutable contribution links remain on the support page.
