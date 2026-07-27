---
id: milestone-1
stable_slug: milestone-1
title: "Milestone 1: Foundation and Baseline Model"
summary: "What shipped for the July 31, 2026 foundation milestone, and where to find it."
artifact_type: milestone
topics: [milestone-1]
keywords: [deliverables, Milestone 1, status]
audiences: [fellowship reviewers, project adopters]
milestone: 1
status: published
publication_date: "2026-07-31"
---
Milestone 1 establishes the public site, the two foundational modules, and a validated single-node Slurm + Apptainer reference workflow. Here is what shipped and where to read it.

| Deliverable | Status | Where |
|---|---|---|
| Project site | Live | [Home](/) |
| Public repository and open licenses | Public | [Repository](https://github.com/pnsinha/laptop-to-cluster), [licenses](/about/licenses/) |
| Module 1: Scheduler as Orchestrator | Published | [Module 1](/guide/scheduler-as-orchestrator/) |
| Module 2: Baseline Pattern | Published; workflow validated on Purdue Anvil | [Module 2](/guide/baseline-single-node-pattern/) |
| Getting started and diagnostics | Published | [Getting started](/start/), [diagnostics](/diagnostics/) |
| Baseline Slurm + Apptainer workflow | Validated (Slurm 25.11.1, Apptainer 1.4.3) | [Workflow source](https://github.com/pnsinha/laptop-to-cluster/tree/v0.1.0/workflows/baseline-slurm-apptainer) |
| Attribution, accessibility, support | Published | [Attribution](/about/attribution/), [accessibility](/about/accessibility/), [support](/about/support/) |
| v0.1.0 release record | Publication candidate | [v0.1.0](/releases/v0-1-0/) |

The workflow ran successfully on Purdue Anvil (job 19500029, `COMPLETED` exit 0) and the readiness-timeout failure path ran as well (job 19500688). Both evidence bundles are recorded under `evidence/anvil-v0-1-0-*` in the repository. See the [release record](/releases/v0-1-0/) for the checksum-bound publication details.
