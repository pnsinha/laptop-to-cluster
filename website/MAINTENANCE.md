# Maintenance and content review

## Ownership

Parmanand Sinha is the project maintainer and publication owner in an individual 2026 BSSw Fellowship capacity. University of Chicago affiliation does not make the institution the operator or support provider for this project.

## Review expectations

Technical content is reviewed against its documented review date, applicable environment, scheduler/runtime versions, and evidence. Editorial content is checked for authority, links, accessibility, and stable URLs. License/provenance declarations and recovery contacts are checked for every release.

## Workflow

Issues are triaged by affected artifact and severity. Pull requests receive the scope-aware review described in `.github/CONTRIBUTING.md`; CI runs the release gate (build, tests, accessibility, repository policy, acknowledgment, boundary scan). Material technical changes require updated applicability/evidence before a validated claim is published.

## Releasing

A production release is a `vX.Y.Z` tag on a commit that is already on `main`. The five checks (build, workflow and evidence integrity, links and axe, the acknowledgment on every page, the boundary scan) are the whole gate; `npm run validate` in `website/` runs them.

1. Merge to `main` and wait for `ci` to pass. Then tag that commit and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
2. The `release` workflow runs the gate once, then waits at the `production` environment. Approve it in the run. It deploys exactly the validated build and checks the live site.
3. To look at a branch first, run `release` by hand (Actions, Run workflow) on that branch with "preview" ticked. It deploys to https://preview.laptop-to-cluster.pages.dev with no tag and no approval.
4. After a release, download the `release-record` artifact and commit its `recovery-index.json` over `website/releases/recovery-index.json`; keep the artifacts as described in `RECOVERY.md`.

## Response expectations

This is a fellowship resource, not a staffed service desk. Reports are acknowledged and prioritized when maintainer availability permits; security and site-wide accessibility blockers take precedence. No fixed response or resolution time is guaranteed.

## Post-fellowship path

Before active maintenance ends, the site will publish a final maintenance date, archive status, v1.0 reconstruction instructions, and reuse path. Open licenses continue to permit adaptation. Current status and alternative contact behavior are maintained in `.github/SUPPORT.md` and `RECOVERY.md`.
