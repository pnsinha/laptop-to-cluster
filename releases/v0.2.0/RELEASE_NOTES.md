# v0.2.0 — Milestone 2 showcase release

## Added
- A home page written for newcomers: a two-environment figure, three doors (understand the model, translate a Compose file, evaluate and adopt), the four concepts of the big idea, and a Compose-to-sbatch crosswalk.
- A six-step timeline of one allocation from start to finish, on the five-minute tour and in Modules 1–2.
- A five-minute tour of the model, a Compose-to-Slurm translation module, and an evaluation guide for research software engineers and center staff, including what has not been tested.
- A Talks and papers page that links to each presentation where it is hosted.
- An evidence badge and panel on pages that rely on a test: what was tested, what you need, and what depends on your center. Each one links to the dated test record. Material not run on a cluster is labelled “Shim-tested” (run off-cluster against test fixtures) or “Designed, not run”.
- A new visual system: self-hosted fonts, and light and dark themes that follow your system setting. One toggle switches the theme and remembers your choice. The site works without JavaScript; the toggle is then hidden and the theme follows your system.

## Changed
- Module 2 explains which parts of the workflow package to keep, which to replace, and how its result files are meant to be read.
- The getting-started path, the glossary and the navigation follow the same plain-language-first order as the home page.
- Each test record opens with a plain-language summary of what was tested.
- Module 2 was re-tested on Purdue Anvil on October 7, 2026 (Slurm 26.05.4, Apptainer 1.5.3). The image was reused, not rebuilt: it has the same digest as the July build, because this release’s script cannot rebuild it without privileges on that Apptainer. The [dated test record](https://laptop-to-cluster.org/applicability/m2-baseline-anvil-2026-10/) has the details, and the July record is kept.

## Corrected
- The v0.2.0 workflow README now points to the dated validation record instead of describing the workflow as not run.
- Diagnostic identifiers are consistent between the diagnostics page and the workflow.
- The test record now lists the deliberate failure run next to the successful run.
- The README fingerprints shown on the July test record and on the scheduler-as-orchestrator page now match the files at the v0.1.0 tag they link to.

## Validation boundary
Every tested claim on the site links to the dated applicability record it comes from. Statements that are designed but not yet run on a cluster say so.

## Publication binding
`npm run publication:prepare` binds the source commit, the immutable `v0.2.0` repository tag, the URL-manifest checksum, the complete-artifact checksum and the per-file-manifest checksum. The Direct Upload job adds the Cloudflare deployment ID and the assigned noncanonical `*.pages.dev` recovery URL; production publication is blocked if either is absent or inconsistent. Preview deployments never produce a release record.
