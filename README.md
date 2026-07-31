# BSSw Fellowship Learning Modules

Portable learning modules for **Bridging the Laptop-to-Cluster Gap: HPC-Native Translation Patterns for Multi-Service AI Stacks** (2026 BSSw Fellowship).

These modules formalize how multi-service Docker Compose stacks map onto shared HPC: scheduler allocation as the orchestration boundary, rootless container runtimes, and center-portable launch patterns.

## Modules

| # | Title | Topics | Status |
|---|---|---|---|
| 1 | [Scheduler as Orchestrator](site/src/content/content-items/01-scheduler-as-orchestrator.md) | `scheduler-as-orchestrator` | published |
| 2 | [Baseline Pattern: Single-Node Service + Workers](site/src/content/content-items/02-baseline-single-node-pattern.md) | `scheduler-as-orchestrator`, `service-workers` | published; validated |

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

## Author

Parmanand Sinha, PhD — Computational Scientist, University of Chicago Research Computing Center  
2026 BSSw Fellow (individual capacity)
