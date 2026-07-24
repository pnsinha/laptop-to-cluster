---
id: BSSW-READINESS-TIMEOUT
stable_slug: bssw-readiness-timeout
title: "BSSW-READINESS-TIMEOUT: coordinator did not become ready"
summary: "Diagnose a bounded readiness timeout without starting dependent workers."
artifact_type: diagnostic
topics: [diagnostics, readiness]
keywords: [coordinator, health, timeout, workers]
audiences: [HPC learners, workflow maintainers]
milestone: 1
status: published
publication_date: "2026-07-31"
schedulers: [slurm]
container_runtimes: [apptainer]
related: [start-guide, module-2-baseline]
---
## Failure signal
The semantic health check does not succeed before the documented monotonic timeout. The launcher must exit nonzero and no worker-start event may occur.
## Recovery
Inspect the coordinator’s separate log, image digest, loopback endpoint, job-scoped write permissions, and allocated resources. Correct one cause, clean invalid success artifacts, and resubmit within the documented timeout bounds. Do not replace semantic health with a fixed sleep or an unbounded loop.
## Verification
Confirm the failed run contains this diagnostic ID, a nonzero result, cleanup evidence, and no worker-start event.
