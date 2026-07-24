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
