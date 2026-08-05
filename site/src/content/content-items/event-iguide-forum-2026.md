---
id: event-iguide-forum-2026
stable_slug: iguide-forum-2026
title: "I-GUIDE Forum 2026: Geospatial AI on HPC"
summary: "Poster #23 and companion material for Geospatial AI on HPC: Infrastructure Contracts for Reproducible Containerized Workflows."
description: "Conference poster, the three infrastructure contracts behind it, and links into the modules that cover the same ground with the mechanics filled in."
artifact_type: event-assets
topics: [scheduler-as-orchestrator, rootless-containers]
keywords: [I-GUIDE, poster, geospatial AI, STAC, COG, Apptainer, Singularity, Slurm, Globus Compute, reproducibility]
audiences: [HPC learners, scientific software practitioners, facility staff]
milestone: 2
status: published
publication_date: "2026-08-05"
last_updated: "2026-08-05"
related: [module-1-scheduler-orchestrator, module-2-baseline, start-guide]
learning_stage: portability
---

If you scanned this from the poster board: the board argues that moving geospatial AI from a
laptop to a shared cluster is a contract design problem. This site is that argument with the
mechanics filled in.

[Download the poster (PDF, 36 x 42 in)](/iguide-forum-2026-poster.pdf)

## The argument in one paragraph

Geospatial AI workflows often break when teams move from cloud development to HPC production.
Containers package dependencies, but execution assumptions change across schedulers, GPU
allocation models, and storage layouts. Geospatial outputs add a second source of drift,
because they are spatial assets that have to stay discoverable, tileable, and traceable back
to their inputs and run settings. Standardize three contracts and heterogeneous backends can
sit behind them.

## Three contracts

**Runtime contract.** One job schema across local and HPC execution. Local workers run
containerized inference directly. HPC workers execute equivalent jobs under scheduler
allocation with a rootless runtime. The API contract, input bindings, output paths, and status
schema do not change; only the runtime layer beneath them does.

This is the same boundary [Module 1](/guide/scheduler-as-orchestrator/) calls the scheduler as
orchestrator.

**Data contract.** Outputs are catalog objects, not loose files. Register them as STAC items
with asset metadata and store rasters in COG-compatible form so tile services can stream them
directly.

**Execution contract.** Queue-backed GPU dispatch with explicit lifecycle state and persisted
run metadata. Status transitions, errors, and artifact URIs belong to the contract, not to
optional logs.

## Where the poster and this site differ

Worth stating plainly, because you can see both claims within a minute of each other.

The baseline workflow published here was validated on **Anvil**, with Slurm and
Apptainer. The geospatial production deployment described on the poster runs at the
**University of Chicago**. Those are two different artifacts.

What has not happened in either case is running the geospatial pipeline itself across multiple
institutional scheduler policies. That is what the poster's limitations panel refers to, and it
is the next piece of work. If you operate a facility and want to be the second site, that is
the conversation to have.

## Read further

- [Module 1: Scheduler as Orchestrator](/guide/scheduler-as-orchestrator/) is where the runtime
  contract comes from. The scheduler, not a container daemon, owns the orchestration boundary.
- [Module 2: Baseline Single-Node Pattern](/guide/baseline-single-node-pattern/) is the pattern
  the poster's local-worker path generalizes.
- [Get started](/start/) runs the baseline single-node workflow end to end.
- [Troubleshooting](/diagnostics/) covers the failures that show up first: readiness timeouts,
  Apptainer, Slurm, and storage.

The poster's central move, mapping Compose services to scheduler jobs, `depends_on` to
readiness checks, `volumes` to job-scoped scratch, and `ports` to loopback plus a tunnel, is
summarized on the [home page](/).

## Citation and contact

Sinha, P. (2026). *Geospatial AI on HPC: Infrastructure Contracts for Reproducible
Containerized Workflows.* Poster #23, I-GUIDE Forum 2026, co-located with the NSF HDR
Ecosystem Conference, University of Illinois Chicago, August 2026.

Parmanand Sinha, Computational Scientist, Research Computing Center, University of Chicago.
2026 Better Scientific Software Fellow. `pnsinha@uchicago.edu`

## Acknowledgment

Supported in part by a 2026 Better Scientific Software (BSSw) Fellowship. The BSSw Fellowship
Program is supported by the U.S. Department of Energy, Office of Advanced Scientific Computing
Research via ANL under Contract DE-AC02-06CH11357 and the National Nuclear Security
Administration Advanced Simulation and Computing Program via LLNL under Contract
DE-AC52-07NA27344, and by the National Science Foundation via SHI under Grant No. 2435328.
