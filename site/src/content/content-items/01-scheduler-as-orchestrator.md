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
## Why the scheduler becomes the orchestrator

A laptop Compose stack uses one tool to start services, connect them, and manage their lifetime. On shared HPC, one scheduler allocation becomes that boundary. A launch script starts each component as a tracked step, uses a rootless runtime, keeps writable state in approved storage, and verifies results before the allocation ends.

## Map each responsibility

| Compose concept | Scheduler-managed HPC mapping | Decision to make |
|---|---|---|
| service | tracked step inside one allocation | Which process coordinates, and which processes are workers? |
| image or build | immutable image launched by a rootless runtime | Who builds and approves the image? |
| dependency or health check | bounded semantic readiness gate | What response proves the coordinator is ready? |
| volume | explicit job-scoped scratch or approved storage bind | Which state is temporary, and which must persist? |
| port | loopback or a center-approved access path | Who needs access, and what does policy permit? |
| device request | scheduler CPU, memory, wall-time, or accelerator request | Which resources must be requested before launch? |

## Make the local decisions

For one workflow, assign allocation, startup order, runtime state, access, and accelerator ownership to scheduler policy, runtime behavior, launch-script logic, or local-center configuration. The completion exercise below turns those assignments into a reviewable decision record.

## Limitations

This mapping does not make a workflow portable unchanged. Scheduler syntax, network policy, storage, security controls, runtime modules, and accelerator flags vary by center. Multi-node discovery, persistent databases, privileged ports, and production availability are outside the single-node baseline.

## Next step

Continue to [Baseline Pattern: Single-Node Service + Workers](/guide/baseline-single-node-pattern/) to run the bounded shape, or [check your center](/start/) before execution.
