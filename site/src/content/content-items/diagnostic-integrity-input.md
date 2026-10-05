---
id: BSSW-INTEGRITY-INPUT
stable_slug: bssw-integrity-input
title: "The input checksum does not match"
summary: "Find out why the input file no longer matches its recorded checksum."
artifact_type: diagnostic
topics: [diagnostics, integrity]
keywords: [checksum, input, integrity, sha256]
audiences: [HPC learners]
milestone: 2
status: published
publication_date: "2026-10-15"
schedulers: [slurm]
related: [start-guide, module-2-baseline]
---
## Signal
The job prints `BSSW-INTEGRITY-INPUT` and exits with code 70. The input's SHA-256 could not be calculated, does not match the recorded value, or the job's private copy of the input failed the same check.

## Likely causes
The input file was edited without updating its checksum record, or it was changed or truncated in transit.

## Recovery steps
1. From the workflow directory, run `(cd inputs && sha256sum -c tasks.json.sha256)`.
2. If you edited the input on purpose, create a new checksum record with your SHA-256 tool and keep the `tasks.json` file name in it.
3. If you did not edit it, restore the file from the release.

**Warning:** Do not edit the checksum record just to make the check pass.

## Verify the recovery
`sha256sum -c` prints `tasks.json: OK`, and the next submission gets past the integrity checks.

## Escalate
Report the problem through [support](/about/support/) if a restored file still fails.
