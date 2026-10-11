# BSSw Fellowship Learning Modules

Portable learning modules for **Bridging the Laptop-to-Cluster Gap: HPC-Native Translation Patterns for Multi-Service AI Stacks** (2026 BSSw Fellowship).

These modules formalize how multi-service Docker Compose stacks map onto shared HPC: scheduler allocation as the orchestration boundary, rootless container runtimes, and center-portable launch patterns.

Read the guide at [laptop-to-cluster.org](https://laptop-to-cluster.org). The [release notes for v0.2.0](https://laptop-to-cluster.org/milestones/2/#release-v0-2-0) say what changed.

## Modules

| # | Title | Topics | Status |
|---|---|---|---|
| 0 | [The five-minute tour](site/src/content/content-items/00-tour.md) | `orientation`, `prerequisites` | published |
| 1 | [Scheduler as Orchestrator](site/src/content/content-items/01-scheduler-as-orchestrator.md) | `scheduler-as-orchestrator` | published |
| 2 | [Baseline Pattern: Single-Node Service + Workers](site/src/content/content-items/02-baseline-single-node-pattern.md) | `scheduler-as-orchestrator`, `service-workers` | published; tested on Purdue Anvil, Oct 2026 |
| 3 | [Translate a Compose file](site/src/content/content-items/03-compose-to-hpc-translation.md) | `compose-to-hpc-translation`, `scheduler-as-orchestrator`, `rootless-containers` | published; each row is labelled Tested or Designed, not run |

## Front matter

Each module uses YAML front matter compatible with the project site:

```yaml
title: ""
description: ""
module_number:
topics: [scheduler-as-orchestrator | slurm-pbs | apptainer-charliecloud | globus-compute | container-first]
status: draft | published
last_updated: YYYY-MM-DD
summary: "1-2 sentence summary for the module index"
```

## Acknowledgment

This work was supported by the Better Scientific Software Fellowship Program, a collaborative effort of the U.S. Department of Energy (DOE), Office of Advanced Scientific Research via ANL under Contract DE-AC02-06CH11357 and the National Nuclear Security Administration Advanced Simulation and Computing Program via LLNL under Contract DE-AC52-07NA27344; and by the National Science Foundation (NSF) via SHI under Grant No. 2435328.

Any opinions, findings, and conclusions or recommendations expressed in this material are those of the author(s) and do not necessarily reflect the views of the DOE or NSF.

## Author

Parmanand Sinha, PhD — Computational Scientist, University of Chicago Research Computing Center  
2026 BSSw Fellow (individual capacity)
