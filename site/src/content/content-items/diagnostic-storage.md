---
id: BSSW-STORAGE-UNAVAILABLE
stable_slug: bssw-storage-unavailable
title: "Job-scoped storage check failed"
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
## Signal
The selected scratch root is missing or unwritable, quota is insufficient, or the container bind is denied.

## Likely causes
The path is not allocated to the job, quota is exhausted, permissions are wrong, or runtime bind policy rejects it.

## Recovery steps
1. Select the center-approved job-scoped path.
2. Verify ownership and free quota.
3. Create a private directory for the submitted job.
4. Test the bind with a non-sensitive file.

**Warning:** Never fall back silently to shared persistent storage or a world-writable path.

## Verify the recovery
The job can create, read, and remove a private test file through the same container bind.

## Escalate
Ask center support to confirm the approved scratch and bind policy.
