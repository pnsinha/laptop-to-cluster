---
id: BSSW-PREQ-IMAGE
stable_slug: bssw-preq-image
title: "The container image is missing or unsafe"
summary: "Fix a missing, linked, or unchecksummed image before submitting."
artifact_type: diagnostic
topics: [diagnostics, prerequisites]
keywords: [acquire.sh, image, SIF, checksum]
audiences: [HPC learners]
milestone: 2
status: published
publication_date: "2026-10-15"
schedulers: [slurm]
container_runtimes: [apptainer]
related: [start-guide, module-2-baseline]
---
## Signal
The job prints `BSSW-PREQ-IMAGE` and exits with code 68. The image file is missing, is not a regular file, or its checksum record is missing, unreadable, or invalid. `container/acquire.sh` prints the same code when its acquisition metadata is invalid.

## Likely causes
The image has not been built yet, `IMAGE_PATH` is a relative path that Slurm's copy of the script cannot resolve, the path is a symbolic link, or the `.sha256` file next to the image is absent.

## Recovery steps
1. Run `workflows/baseline-slurm-apptainer/container/acquire.sh` where your center allows image builds.
2. Pass `IMAGE_PATH` as an absolute path in `--export`.
3. Confirm the image is a regular file, not a link, and that `<image>.sha256` holds one 64-character digest.

**Warning:** Do not point `IMAGE_PATH` at an image you did not build or obtain through your center.

## Verify the recovery
The next submission gets past the image checks and starts the coordinator.

## Escalate
Ask center support whether image builds are allowed on login nodes or need a build node.
