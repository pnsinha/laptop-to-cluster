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
