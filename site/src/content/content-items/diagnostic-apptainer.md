---
id: BSSW-PREREQ-APPTAINER
stable_slug: bssw-prereq-apptainer
title: "BSSW-PREREQ-APPTAINER: container runtime unavailable"
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
---
## Failure signal
`command -v apptainer` fails, `apptainer --version` fails, or the runtime is absent on compute nodes.
## Recovery
Use the center-documented module or runtime path and verify it in a compute allocation. Record the version. Do not install a privileged daemon or bypass center policy. If Apptainer is unsupported, keep the conceptual mapping and ask center support which rootless runtime is approved; this release does not claim an alternative runtime is validated.
## Continue without execution
All [modules](/resources/) and local adaptation guidance remain accessible.
