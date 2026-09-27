---
id: module-0-orientation
stable_slug: how-to-use-this-guide
title: "How to use this guide"
description: "Orientation for the Laptop-to-Cluster guide: who it is for, what it assumes, how to check readiness, and how to navigate by goal."
module_number: 0
topics: [orientation, prerequisites]
status: published
publication_date: "2026-09-26"
last_updated: "2026-09-26"
summary: "Find out whether this guide is for you, what it assumes you already have, how to check readiness, and where to start for your goal."
artifact_type: learning-module
keywords: [orientation, prerequisites, readiness, HPC, Compose]
audiences: [first-time HPC learners, HPC learners, scientific software practitioners, HPC center staff]
milestone: 2
applicable_release: v0.1.0
module_type: conceptual
learning_outcomes:
  - "Decide whether this guide matches your role and goal."
  - "Check that you have the access, skills, and center resources the baseline assumes."
  - "Choose the right entry point for your goal instead of reading linearly."
prerequisites: []
section_kinds: [concept, limitations, next-steps]
estimated_minutes: 10
completion_check:
  kind: mapping-checklist
  text: "Tick each assumed skill you already have; for any you lack, note the linked reference you will use before Module 1."
related: [module-1-scheduler-orchestrator, start-guide, glossary]
supporting_artifacts: []
learning_stage: baseline
authority:
  - { kind: project-decision, citation: "Milestone 1 review feedback, 2026-08-14", scope: "Orientation module added in response to program-administrator review." }
---
## Who this guide is for

This guide serves three tiers of reader:

- **A researcher adapting their own Compose stack** gets a bounded, tested pattern for moving a multi-service stack onto a shared cluster, plus the places where they must substitute their own values.
- **A research software engineer supporting several groups** gets a reusable translation model and a reference workflow they can hand to teams without re-deriving the readiness and verification mechanics each time.
- **Center staff evaluating a deployment pattern** get an explicit statement of what the pattern assumes about scheduler, runtime, storage, and network policy, and a record of where it was validated.

## Three questions this guide answers

Everything on this site answers one of three problems you will hit moving a stack from a laptop to a shared cluster.

### Why does `docker compose up` not work here?

Shared clusters run no Docker daemon, give you no root access, and let a scheduler own every resource. The [allocation](/about/glossary/) plus a launch script become the orchestrator instead: services start as tracked steps, [semantic readiness](/about/glossary/) is proven before workers start, and results are verified before anyone calls the run a success. Modules 1–3 teach this reframe. A cross-site dispatch approach using Globus Compute is an alternative answer on the roadmap — see the [Milestone 2 record](/milestones/2/).

### Why does my script break on the next cluster?

Account names, partitions, scratch paths, and module names differ at every center, so the launch template is the thing that changes — the pattern does not. Runtimes differ too (Apptainer versus Charliecloud), but your install trees do not have to. Module 4 (launch templates, planned) and Module 5's runtime section (planned) cover this; see the [Milestone 2 roadmap](/milestones/2/).

### Why am I rebuilding the same stack for every GPU type?

Building one monolithic image per GPU architecture duplicates the whole CPU stack every time. Splitting a shared CPU provider tree from a thin GPU layer means only the GPU package rebuilds — 95.0% of packages reused (19 of 20) — and each extra target adds 1,412 files instead of 10,772 (7.6×), with +5 files of arrangement overhead at one target and 1.77× fewer files at two. Module 5 (planned) walks through this; see the [Milestone 2 roadmap](/milestones/2/).

## What we assume you already know

This guide does not teach these prerequisites; each links to an authoritative reference you can use to fill the gap:

- **Docker Compose basics:** what a service, image, volume, port, and `depends_on` mean — see the [Docker Compose overview](https://docs.docker.com/compose/).
- **A Unix shell:** navigating directories and running commands in a terminal — see the [Software Carpentry shell lesson](https://swcarpentry.github.io/shell-novice/).
- **Submitting a batch job:** you have submitted at least one job on a shared cluster — see the [Slurm quickstart](https://slurm.schedmd.com/quickstart.html).

## What you need access to

- **An [allocation](/about/glossary/):** authorized access to a shared cluster with an account that can request CPU, memory, and wall time.
- **A Slurm cluster:** the baseline targets Slurm; PBS-family launch templates arrive as a Milestone 2 deliverable. If `sbatch` is missing, see [PREREQ-SLURM](/diagnostics/#bssw-prereq-slurm).
- **A container runtime your center allows:** the baseline uses Apptainer. If it is missing, see [PREREQ-APPTAINER](/diagnostics/#bssw-prereq-apptainer). If your writable-storage situation differs, see [STORAGE-UNAVAILABLE](/diagnostics/#bssw-storage-unavailable).

## Check your readiness

| Command | Passing looks like | If it fails |
|---|---|---|
| `sinfo` (or `command -v sbatch`) | Partition and node listings print | [PREREQ-SLURM](/diagnostics/#bssw-prereq-slurm) |
| `apptainer --version` (after any `module load`) | A version string prints | [PREREQ-APPTAINER](/diagnostics/#bssw-prereq-apptainer) |
| Write-and-remove test in your [job-scoped scratch](/about/glossary/) | File created and removed without error | [STORAGE-UNAVAILABLE](/diagnostics/#bssw-storage-unavailable) |

If all three pass, you can run the baseline. The [Getting started guide](/start/) owns the full run procedure, including recording your center's local values.

## Find your path by goal

The guide is not a single linear read. Pick the row that matches your goal:

| Goal | Path |
|---|---|
| Understand the model | [Module 1: Scheduler as Orchestrator](/guide/scheduler-as-orchestrator/) |
| Run the baseline and verify it | [Getting started](/start/), then [Module 2](/guide/baseline-single-node-pattern/) |
| Adapt the workflow to my own application | Module 2's [adaptation section](/guide/baseline-single-node-pattern/#adapt-it-to-your-own-application) |
| Move between schedulers and runtimes | Modules 3–5 (portability tier, in progress; see the [Milestone 2 roadmap](/milestones/2/)) |
| Evaluate for my center | Module 1, Module 2's limitations, and the [applicability record](/applicability/m1-baseline-anvil/) |

The modules sit on three tiers: **baseline** (the entry path: Modules 0–2 and Getting started), **portability** (the middle tier: Modules 3–5 and the launch templates), and **advanced layered builds** (for center staff assembling multi-service stacks).

## How the site is organized

- **`/guide/`** — the learning modules, numbered in sequence.
- **`/start/`** — the run-focused getting-started path and prerequisite checks.
- **`/diagnostics/`** — stable failure IDs (`BSSW-*`) that error messages and modules link to.
- **`/applicability/`** — records of where the workflow was validated and under what assumptions.
- **`/about/`** — the [glossary](/about/glossary/), [project scope](/about/project/), [attribution](/about/attribution/), and [accessibility](/about/accessibility/) pages.

## What this guide does not cover

This guide does not teach container runtimes, scheduler usage, or center onboarding; it does not cover production operations, multi-node networking, or performance tuning. For those, use the [Apptainer documentation](https://apptainer.org/docs/), the [Software Carpentry lessons](https://software-carpentry.org/lessons/), and your own center's documentation.

## Next step

Continue to [Module 1: Scheduler as Orchestrator](/guide/scheduler-as-orchestrator/).
