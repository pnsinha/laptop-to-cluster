---
id: release-v0-2-0
stable_slug: v0-2-0
title: "Release v0.2.0: included changes"
summary: "The published Milestone 2 changes and immutable repository citation."
artifact_type: release
topics: [release, milestone-2]
keywords: [release notes, v0.2.0]
audiences: [adopters, fellowship reviewers]
milestone: 2
status: published
publication_date: "2026-10-20"
applicability_records: [m2-baseline-anvil-2026-10]
related: [module-0-orientation, module-2-baseline, milestone-2]
---
### Added
- A home page written for newcomers: a two-environment figure, three doors (understand the model, translate a Compose file, evaluate and adopt), the four concepts of the big idea, and a Compose-to-sbatch crosswalk.
- A six-step timeline of one allocation from start to finish, on the five-minute tour and in Modules 1–2.
- A five-minute tour of the model, a Compose-to-Slurm translation module, and an evaluation guide for research software engineers and center staff, including what has not been tested.
- A Talks and papers page that links to each presentation where it is hosted.
- An evidence badge and panel on pages that rely on a test, each linking to the dated test record. Material not run on a cluster is labelled “Shim-tested” (run off-cluster against test fixtures) or “Designed, not run”.
- A new visual system: self-hosted fonts, and light and dark themes that follow your system setting. One toggle switches the theme and remembers your choice.

### Changed
- Module 2 explains which parts of the workflow package to keep, which to replace, and how its result files are meant to be read.
- The getting-started path, the glossary and the navigation follow the same plain-language-first order as the home page.
- Each test record opens with a plain-language summary of what was tested.
- Module 2 was re-tested in October 2026. The image was reused, not rebuilt: it has the same digest as the July build, because this release’s script cannot rebuild it without privileges on the newer Apptainer there. The [dated test record](/applicability/m2-baseline-anvil-2026-10/) gives the date, the system and the versions, and the July record is kept.

### Deprecated
None in this release.

### Corrected
- The v0.2.0 workflow README now points to the dated validation record instead of describing the workflow as not run.
- Diagnostic identifiers are consistent between the diagnostics page and the workflow.
- The test record now lists the deliberate failure run next to the successful run.
- The README fingerprints shown on the July test record and on the scheduler-as-orchestrator page now match the files at the v0.1.0 tag they link to.

### Immutable citation
Cite [repository release v0.2.0](https://github.com/pnsinha/laptop-to-cluster/releases/tag/v0.2.0).
