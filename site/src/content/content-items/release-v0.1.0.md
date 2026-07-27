---
id: release-v0-1-0
stable_slug: v0-1-0
title: Release v0.1.0
summary: "Milestone 1 scope, validation status, and the immutable repository target."
artifact_type: release
topics: [release, milestone-1]
keywords: [release notes, v0.1.0]
audiences: [adopters, fellowship reviewers]
milestone: 1
status: published
publication_date: "2026-07-31"
applicability_records: [m1-baseline-anvil]
related: [module-1-scheduler-orchestrator, module-2-baseline, milestone-1]
---
## What's in this release
- The two foundational modules: [Scheduler as Orchestrator](/guide/scheduler-as-orchestrator/) and [Baseline Pattern: Single-Node Service + Workers](/guide/baseline-single-node-pattern/).
- A validated single-node Slurm + Apptainer reference workflow.
- Getting-started guidance, a diagnostic registry, attribution, licensing, accessibility, and support pages.

## Validation status
The baseline workflow is validated on Purdue Anvil (Slurm 25.11.1, Apptainer 1.4.3). A successful run (job 19500029, `COMPLETED` exit 0) and a controlled readiness-timeout run (job 19500688, `FAILED` exit 75) are recorded under `evidence/anvil-v0-1-0-*`. The validation covers single-node execution with the v0.1.0 image only; a rebuilt image or a different scheduler/runtime version requires revalidation. Local and fake-runtime tests remain distinct from this representative-environment claim.

## Repository target
The immutable companion target is [repository tag v0.1.0](https://github.com/pnsinha/laptop-to-cluster/releases/tag/v0.1.0). The [release candidate](https://github.com/pnsinha/laptop-to-cluster/blob/v0.1.0/releases/v0.1.0/release-candidate.json) lists every included item and its public URL.

## Changes
This is the initial release. There are no deprecated or corrected items. Completion evidence is append-only in the [Milestone 1 record](/milestones/1/); later corrections add dated revisions rather than overwriting it.
