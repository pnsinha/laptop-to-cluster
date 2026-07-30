---
id: BSSW-READINESS-TIMEOUT
stable_slug: bssw-readiness-timeout
title: "Coordinator did not become ready"
summary: "Diagnose a readiness timeout without starting dependent workers."
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
## Signal
The semantic health check expires. The launcher exits nonzero and no worker-start event occurs.

## Likely causes
The coordinator failed, the image is wrong, loopback communication is blocked, job-scoped storage is unwritable, or requested resources are insufficient.

## Recovery steps
1. Inspect the coordinator log and image digest.
2. Check loopback communication and job-scoped write permissions.
3. Correct one cause, remove invalid success artifacts, and resubmit within the documented timeout bounds.

**Warning:** Do not replace semantic health with a fixed sleep or an unbounded loop.

## Verify the recovery
Confirm the failed run has this diagnostic code, a nonzero result, cleanup evidence, and no worker-start event. A repaired run must pass readiness before workers.

## Escalate
Report sanitized coordinator and readiness logs through [support](/about/support/).
