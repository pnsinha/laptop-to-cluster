# Releases

One folder per tagged release, plus the recovery index. Files in a release folder are records of what shipped: do not edit them after the release is tagged.

| File | What it is | Who reads it |
|---|---|---|
| `vX.Y.Z/release-candidate.json` | The candidate record: version, source commit and what the release contains | the release workflow and `scripts/validate-release.ts` |
| `vX.Y.Z/RELEASE_NOTES.md` | The plain-text changelog for the tag | people reading the repository; `scripts/validate-repository.ts` checks it exists |
| `vX.Y.Z/accessibility-review.yml` | The signed accessibility review for that release | `scripts/validate-accessibility-review.ts` |
| `v0.1.0/milestone-1-completion.json` | The Milestone 1 publication-candidate record, kept with the release it accompanied | nothing reads it; it is a historical record |
| `recovery-index.json` | The current and previous known-good deployments, by checksum | the release workflow, which copies it and updates the copy with `scripts/update-recovery-index.mjs`; see [`RECOVERY.md`](../RECOVERY.md) |

## The other places called "release"

- **The release notes page on the site.** `site/src/content/content-items/release-vX.Y.Z.md` is what readers see, on the milestone page for that release. It says the same things as `RELEASE_NOTES.md`, written for the site, with links to the test records. Change both together.
- **The release workflow.** [`.github/workflows/release.yml`](../.github/workflows/release.yml) builds a tag once, validates it and deploys it. Its artifacts expire after 90 days; [`RECOVERY.md`](../RECOVERY.md) says how to keep them.
- **GitHub Releases.** None exists yet. `RECOVERY.md` gives the commands to create one for a tag and attach its artifacts.

The evidence a release relies on lives in [`evidence/`](../evidence/), not here.
