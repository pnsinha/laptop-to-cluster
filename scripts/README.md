# Scripts

The build, check and release tooling. Most scripts run through an npm command; the release scripts run only inside the GitHub workflows. The `.d.mts` files are type declarations for the `.mjs` modules, so the TypeScript scripts and tests can import them.

## Checks you run while working

| Script | npm command | What it does |
|---|---|---|
| `scan-accessibility.ts` | `npm run test:accessibility:browser` | Opens every built page in Chromium: axe, keyboard order and focus, reflow, zoom, forced colours, print, theme, fonts blocked, no JavaScript |
| `publication.mjs` | `npm run validate:built`, `npm run validate:policy`, `npm run validate:boundary` | The publication validator: built HTML, links, canonical metadata and footer; dependency, motion, font and deployment policy; the boundary scan for terms that must never be published |
| `validate-evidence.ts` | `npm run validate:evidence` | Checks every evidence bundle a test record cites: files, checksums, versions and review dates |
| `validate-repository.ts` | `npm run validate:repository` | Checks the required project files exist and every tracked file has a licence category |
| `validate-release.ts` | `npm run validate:release` | Checks the release workflows and the built output against the current release record |
| `validate-accessibility-review.ts` | `npm run validate:accessibility-review` | Checks the current release's signed accessibility review covers every required page and check |

`npm run publication:validate` runs every check above except the browser scan, and adds the boundary scan. The boundary scan needs the `L2C_BOUNDARY_PATTERN` secret, which only CI has, so it fails locally; see [`CONTRIBUTING.md`](../CONTRIBUTING.md).

## Evidence

| Script | npm command | What it does |
|---|---|---|
| `record-run.ts` | `npm run record-run` | Turns a cluster run into a redacted, checksummed evidence bundle under `evidence/`; see [`evidence/README.md`](../evidence/README.md) |
| `evidence.ts` | (library) | The bundle format and checks that `record-run.ts`, `validate-evidence.ts` and `validate-repository.ts` share |

## Release and recovery (run by the workflows)

| Script | Run by | What it does |
|---|---|---|
| `release-version.mjs` | `ci.yml` | Resolves the release version from `releases/*/release-candidate.json` |
| `release-plan.mjs` | `release.yml` | Decides what a release run may do: preview, candidate or production |
| `prepare-publication.mjs` | `npm run publication:prepare` in `ci.yml`, `release.yml` and `publication.yml` | Packs the validated `site/dist/` and its manifest for deployment |
| `generate-release-record.mjs` | `release.yml`, `publication.yml` | Writes the release record that names the commit, artifact checksum and deployment |
| `verify-live-release.mjs` | `release.yml` | Confirms the deployed site serves the same URL manifest as the build |
| `check-public-release.mjs` | `release.yml`, `publication.yml` | Checks what a release must show publicly once deployed |
| `update-recovery-index.mjs` | `release.yml`, `publication.yml` | Moves the previous deployment to `previous` and records the new one in the recovery index |
| `rollback.mjs` | `rollback.yml` | Verifies a retained build against its checksums before it is redeployed; see [`RECOVERY.md`](../RECOVERY.md) |

## Libraries

| Script | Used by |
|---|---|
| `boundary.mjs` | `publication.mjs`: reads the boundary terms from the secret or a local untracked file, and never prints a match |
| `license-provenance.ts` | `validate-repository.ts`: the licence inventory in `artifact-inventory.yml` |
