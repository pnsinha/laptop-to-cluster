---
id: BSSW-INTEGRITY-IMAGE
stable_slug: bssw-integrity-image
title: "The image checksum does not match"
summary: "Rebuild or restore a container image that no longer matches its recorded checksum."
artifact_type: diagnostic
topics: [diagnostics, integrity]
keywords: [checksum, image, integrity, SIF]
audiences: [HPC learners]
milestone: 2
status: published
publication_date: "2026-10-15"
schedulers: [slurm]
container_runtimes: [apptainer]
related: [start-guide, module-2-baseline]
---
## Signal
The job prints `BSSW-INTEGRITY-IMAGE` and exits with code 71. The image's SHA-256 could not be calculated or does not match the recorded value. `container/acquire.sh` prints the same code if its definition and registry record are not tied to the same digest.

## Likely causes
The image was rebuilt or replaced after its checksum was recorded, or the file was damaged.

## Recovery steps
1. Run `container/acquire.sh` again to build a fresh image and a fresh checksum record.
2. If `acquire.sh` itself prints this code, restore `container/Apptainer.def` and `container/image-lock.json` from the release.

**Warning:** Do not edit the checksum record to match a different image.

## Verify the recovery
The next submission gets past the image checks.

## Escalate
If a fresh build keeps failing, report the sanitized output through [support](/about/support/).
