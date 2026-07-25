---
id: module-1-scheduler-orchestrator
stable_slug: scheduler-as-orchestrator
title: "Scheduler as Orchestrator"
description: "Treating the batch scheduler as the orchestration boundary for multi-service Compose stacks on shared HPC"
module_number: 1
topics: [scheduler-as-orchestrator]
status: published
last_updated: "2026-07-09"
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
A local Compose stack starts services, connects them, and keeps them within one application boundary. On shared HPC, the scheduler owns resource allocation and reclamation; a rootless runtime launches containers inside that allocation. The scheduler allocation is therefore the orchestration boundary, while the launch script makes dependencies and cleanup explicit.

| Compose concept | Scheduler-managed HPC mapping |
|---|---|
| `service` | A scheduler job step inside the allocation |
| image or build | An immutable image launched with a rootless runtime |
| `depends_on` | A bounded semantic readiness check before dependent steps |
| volume | Explicit job-scoped scratch or center-approved storage bind |
| port | Loopback by default; approved tunnel or network path when needed |
| device request | Scheduler resource request, such as a GPU allocation |

### Decision exercise
For one workflow, write down the coordinating service, worker count, startup dependency, writable state, user access path, and accelerator needs. Mark each responsibility as scheduler policy, container-runtime behavior, launch-script logic, or local-center adaptation.

## Known limitations
This conceptual mapping does not make a workflow portable unchanged. Scheduler syntax, network policy, storage, security controls, runtime modules, and accelerator flags vary by center. Multi-node service discovery, persistent databases, privileged ports, and production availability are outside the single-node Milestone 1 boundary.

## Next steps
Continue to [Baseline Pattern: Single-Node Service + Workers](/guide/baseline-single-node-pattern/) for the bounded runnable shape, or review [Getting started](/start/) and its local-adaptation checklist. The immutable repository reference above provides the release context; support and mutable contribution links remain on the support page.
