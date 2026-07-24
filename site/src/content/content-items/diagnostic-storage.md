---
id: BSSW-STORAGE-UNAVAILABLE
stable_slug: bssw-storage-unavailable
title: "BSSW-STORAGE-UNAVAILABLE: job-scoped storage check failed"
summary: "Resolve missing, unwritable, over-quota, or policy-inappropriate runtime storage."
artifact_type: diagnostic
topics: [diagnostics, storage]
keywords: [bind, quota, scratch, storage]
audiences: [HPC learners]
milestone: 1
status: published
publication_date: "2026-07-31"
related: [start-guide, module-2-baseline]
---
## Failure signal
The selected scratch root is missing or unwritable, quota is insufficient, or the container bind is denied.
## Recovery
Select the center-approved job-scoped path, verify ownership and free quota, create a private directory for the submitted job, and test the bind with a non-sensitive file. Never fall back silently to a shared persistent directory or world-writable path.
## Continue without execution
Use the [Compose-to-HPC mapping](/start/) to plan storage lifetimes while access is repaired.
