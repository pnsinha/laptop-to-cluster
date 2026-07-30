---
id: BSSW-PREREQ-APPTAINER
stable_slug: bssw-prereq-apptainer
title: "Container runtime is unavailable"
summary: "Resolve an unavailable or unsupported Apptainer runtime before baseline execution."
artifact_type: diagnostic
topics: [Apptainer, diagnostics]
keywords: [Apptainer, module, runtime, version]
audiences: [HPC learners]
milestone: 1
status: published
publication_date: "2026-07-31"
container_runtimes: [apptainer]
related: [start-guide, module-2-baseline]
diagnostic_applicability: { record_id: m1-baseline-anvil, discriminator: runtime }
---
## Signal
`command -v apptainer` fails, `apptainer --version` fails, or the runtime is absent on compute nodes.

## Likely causes
The runtime module is not loaded, login and compute environments differ, or the center supports another rootless runtime.

## Recovery steps
1. Find the center-documented runtime module or path.
2. Verify it inside a compute allocation.
3. Record the runtime version and rerun the prerequisite check.

**Warning:** Do not install a privileged daemon or bypass center policy.

## Verify the recovery
Both `command -v apptainer` and `apptainer --version` succeed in the job environment.

## Escalate
Ask center support which rootless runtime is approved. This release does not claim another runtime is validated.
