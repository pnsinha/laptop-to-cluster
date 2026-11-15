# Scripts

The build, check and release tooling. Most scripts run through an npm command; the release scripts run only inside the GitHub workflows. The `.d.mts` files are type declarations for the `.mjs` modules, so the TypeScript scripts and tests can import them.

## Checks you run while working

| Script | npm command | What it does |
|---|---|---|
| `scan-accessibility.ts` | `npm run test:accessibility:browser` | Opens every built page in Chromium: axe, keyboard order and focus, reflow, zoom, forced colours, print, theme, fonts blocked, no JavaScript |
| `publication.mjs` | `npm run validate:built`, `npm run validate:policy`, `npm run validate:boundary` | The publication validator: built HTML, links, canonical metadata and footer; dependency, motion, font and deployment policy; the boundary scan for terms that must never be published |
| `validate-evidence.ts` | `npm run validate:evidence` | Checks every evidence bundle a test record cites: files, checksums, versions and review dates |
| `validate-repository.ts` | `npm run validate:repository` | Checks the required project files exist and the evidence records are valid |
| `validate-release.ts` | `npm run validate:release` | Checks the release workflows and the built output |

`npm run publication:validate` runs every check above except the browser scan, and adds the boundary scan; `npm run validate` is the whole release gate. The boundary scan needs the `L2C_BOUNDARY_PATTERN` secret (CI) or the maintainer’s untracked pattern file, so it fails for other contributors; see [`CONTRIBUTING.md`](../../.github/CONTRIBUTING.md).

## Evidence

| Script | npm command | What it does |
|---|---|---|
| `record-run.ts` | `npm run record-run` | Turns a cluster run into a redacted, checksummed evidence bundle under `evidence/`; see [`evidence/README.md`](../../evidence/README.md) |
| `evidence.ts` | (library) | The bundle format and checks that `record-run.ts`, `validate-evidence.ts` and `validate-repository.ts` share |

## Release and recovery (run by the workflows)

| Script | Run by | What it does |
|---|---|---|
| `release-version.mjs` | `release.yml`, the site build | The release version: `RELEASE_VERSION` (the tag), else `package.json` |
| `release-plan.mjs` | `release.yml` | Decides what a release run may do: production (a `vX.Y.Z` tag) or preview |
| `prepare-publication.mjs` | `npm run publication:prepare` in `release.yml` | Packs the validated `website/dist/` and its manifest for deployment |
| `generate-release-record.mjs` | `release.yml` | Writes the release record that names the commit, artifact checksum and deployment |
| `verify-live-release.mjs` | `release.yml` | Confirms the deployed site serves the same URL manifest as the build |
| `check-public-release.mjs` | `release.yml` | Checks that every built page, the redirects and the fallback answer once deployed |
| `update-recovery-index.mjs` | `release.yml` | Moves the previous deployment to `previous` and records the new one in the recovery index |
| `rollback.mjs` | `rollback.yml` | Verifies a retained build against its checksums before it is redeployed; see [`RECOVERY.md`](../RECOVERY.md) |

`publication.yml` is frozen: it checks out the `v0.1.0` tag and runs that tag’s own copies of these scripts.

## Libraries

| Script | Used by |
|---|---|
| `boundary.mjs` | `publication.mjs`: reads the boundary terms from the secret or a local untracked file, and never prints a match |
