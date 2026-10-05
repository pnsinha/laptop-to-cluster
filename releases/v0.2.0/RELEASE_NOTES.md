# v0.2.0 — Milestone 2 showcase release

## Added
- A home page written for newcomers: a plain-language big idea, a six-step timeline of one allocation from start to finish, and three doors (understand the model, translate a Compose file, evaluate and adopt).
- A five-minute tour of the model, a Compose-to-Slurm translation module, and an evaluation guide for research software engineers and center staff, including what has not been tested.
- A Talks and papers page that links to each presentation where it is hosted.
- An evidence badge and panel on pages that rely on a test: what was tested, what you need, and what depends on your center. Each one links to the full, dated test record. Material that has not been run on a cluster is labelled "Designed, not run".
- A new visual system: self-hosted fonts and a light, dark or system theme that you can switch and that is remembered. The site works without JavaScript and follows your operating-system setting.

## Changed
- Module 2 explains which parts of the workflow package to keep, which to replace, and how its result files are meant to be read.
- The getting-started path, the glossary and the navigation follow the same plain-language-first order as the home page.

## Corrected
- The workflow README now points to the dated validation record instead of describing the workflow as not run.
- Diagnostic identifiers are consistent between the diagnostics page and the workflow.

## Validation boundary
Every tested claim on the site is rendered from a dated applicability record and links to that record. This release states no test result anywhere else. Statements that are designed but not yet run on a cluster say so.

## Publication binding
`npm run publication:prepare` binds the source commit, the immutable `v0.2.0` repository tag, the URL-manifest checksum, the complete-artifact checksum and the per-file-manifest checksum. The Direct Upload job adds the Cloudflare deployment ID and the assigned noncanonical `*.pages.dev` recovery URL; production publication is blocked if either is absent or inconsistent. Preview deployments never produce a release record.
