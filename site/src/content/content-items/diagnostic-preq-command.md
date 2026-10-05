---
id: BSSW-PREQ-COMMAND
stable_slug: bssw-preq-command
title: "A required helper command is missing"
summary: "Resolve a missing SHA-256 or Python command before the workflow can check its files."
artifact_type: diagnostic
topics: [diagnostics, prerequisites]
keywords: [checksum, python3, sha256sum, prerequisite]
audiences: [HPC learners]
milestone: 2
status: published
publication_date: "2026-10-15"
schedulers: [slurm]
related: [start-guide, module-2-baseline]
---
## Signal
The job, or `container/acquire.sh`, prints `BSSW-PREQ-COMMAND` and exits with code 66. The SHA-256 command the workflow uses (`sha256sum` by default) is not available, or `python3` is missing when you run `acquire.sh`.

## Likely causes
The command is not on the compute node's path, or your center provides it under another name or module.

## Recovery steps
1. Run `command -v sha256sum` inside a job on the compute node.
2. If your center uses another command, set `BSSW_SHA256_CMD` to it. It must print the digest first, then the file name.
3. For `acquire.sh`, load a module that provides `python3`, then run it again.

**Warning:** Do not skip the checksum steps to get past this error.

## Verify the recovery
The command is found inside a job, and the next submission passes the prerequisite checks.

## Escalate
Ask center support which checksum tool is supported on compute nodes.
