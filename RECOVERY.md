# Public artifact recovery

## Scope and ownership

This plan covers the canonical site, companion repository, immutable release assets, and the noncanonical Cloudflare Pages recovery deployment. Recovery is coordinated by project maintainer Parmanand Sinha at `parmanandsinha@gmail.com`.

## Unavailable-artifact notice

A notice must name the unavailable artifact, affected pages/workflows/releases, detection time, channel status, available archived or fallback location, and recovery contact. A fallback URL is temporary and must never replace the canonical origin in site metadata.

## Site outage

Block promotion when apex checks fail. Restore the current checksum-verified artifact or the previous known-good prebuilt artifact without rebuilding. If only custom-domain routing is impaired, publish the recorded `*.pages.dev` deployment as a temporary noncanonical endpoint while repairing routing.

## Repository or issue outage

Identify which source, workflow, release, or reporting functions are affected and link an archived immutable release when available. Reports move to the alternative email in `SUPPORT.md`; security details remain private.

## Recovery evidence

Record artifact checksum, source commit/release, deployment identifier, outage scope, actions, validation probes, and resolution time. Recheck the canonical apex, representative deep route, repository visibility, issue channel, and fallback availability before closing the incident.

## Automated checksum-verified recovery

Run the manual `checksum-verified-recovery` workflow with the prior successful workflow run ID, full source commit, and confirmation phrase. Content recovery downloads the retained `site/dist/`, artifact manifest, deployment record, and current/previous recovery index; `scripts/rollback.mjs` rejects any checksum or identity mismatch before the same directory is sent through Pages Direct Upload. The recovery job contains no dependency installation, Astro command, build, output mutation, or tag rewrite.

Hostname recovery is a separate workflow mode. It validates `infrastructure/cloudflare/hostname-redirects.v1.json` and restores only the exact three permanent path/query-preserving Bulk Redirect entries under a production-recovery approval environment. It does not download or alter site content.

The deployment record’s direct `*.pages.dev` URL is the temporary noncanonical recovery endpoint while apex routing is repaired. It must remain available, retain apex canonical metadata, and remain absent from sitemap, feed, Open Graph, and public URL inventory output.

## Recovery horizon and the v0.1.0 identity

Retained release records and validated artifacts expire after 90 days, which is the repository cap; the workflows declare 90 so that they say what happens. Recovery from an artifact is therefore possible only inside that window.

| Release | Run | Commit | Recovery artifacts expire |
|---|---|---|---|
| v0.1.0 | publication.yml run 31160844556 | `ea4c7c275ae3187fff227b0524351d4cbbce0485` | expired; the run lists no artifacts as of 2026-11-05 |
| v0.2.0 | release.yml run 39504561028 (tag `v0.2.0`) | `826c29fdbd9ada2ef9c0de1d06eee610d4b06045` | 2027-01-18 |

The v0.1.0 artifacts were not copied before they expired, so restoring v0.1.0 now means rebuilding it from the `v0.1.0` tag. The frozen `publication.yml` does not guard that rebuild, and the rebuilt output may not match the checksum recorded in `releases/recovery-index.json`.

Before 2027-01-18, download the two v0.2.0 artifacts (`validated-site-v0.2.0-…` and `release-record-v0.2.0-…`) and attach them to a GitHub Release for `v0.2.0`, so they outlive the 90-day window:

```sh
gh run download 39504561028 --dir v0.2.0-artifacts
(cd v0.2.0-artifacts && for d in */; do zip -qr "${d%/}.zip" "$d"; done)
gh release create v0.2.0 --verify-tag --title v0.2.0 --notes-file releases/v0.2.0/RELEASE_NOTES.md v0.2.0-artifacts/*.zip
```

Do the same for every later release on the day it deploys.

Settings the workflows cannot enforce: the `production` environment needs a required reviewer, and `production-recovery` must be created with one before its first use.
