---
id: release-v0-1-0
stable_slug: v0-1-0
title: Release v0.1.0
summary: "Milestone 1 publication-candidate scope, status, immutable repository target, and known validation boundary."
artifact_type: release
topics: [release, milestone-1]
keywords: [release notes, v0.1.0]
audiences: [adopters, fellowship reviewers]
milestone: 1
status: published
publication_date: "2026-07-31"
applicability_records: [m1-baseline-anvil]
related: [module-1-scheduler-orchestrator, module-2-baseline, milestone-1]
---
## Added
- Accessible static Astro shell, resource index, apex-only discovery metadata, and stable public routes.
- Scheduler-as-orchestrator and bounded single-node service-plus-workers modules.
- Getting-started, durable diagnostics, attribution, licensing, accessibility, support, and Milestone 1 collection pages.

## Status and validation boundary
This page describes the v0.1.0 publication candidate. Module 2’s representative-environment status is **unvalidated** until immutable Anvil evidence, or explicitly labeled Expanse fallback evidence, is published. Mock or documentation checks do not broaden that claim.

The matching immutable companion target is [repository tag v0.1.0](https://github.com/pnsinha/laptop-to-cluster/releases/tag/v0.1.0). The checked-in [release candidate](https://github.com/pnsinha/laptop-to-cluster/blob/v0.1.0/releases/v0.1.0/release-candidate.json) identifies both modules, the workflow, start and diagnostic guidance, licenses, attribution, accessibility evidence, and apex-only public URLs.

## Checksum and deployment record
Publication CI builds `site/dist/` once, validates it, and records a SHA-256 for every file, the complete normalized artifact, and `url-manifest.json`. The Direct Upload job verifies the retained artifact before upload, then binds those checksums to the source commit, immutable repository tag, Cloudflare deployment ID, and assigned noncanonical `*.pages.dev` recovery URL. These provider-issued values are generated at deployment time and are never guessed in source content.

## Classified changes
This release adds the two Milestone 1 modules, the Slurm + Apptainer workflow package, getting-started and diagnostic guidance, repository/license/attribution/accessibility material, publication gates, and recovery automation. There are no deprecated or corrected items in the initial release.

The original completion evidence remains append-only in the [Milestone 1 record](/milestones/1/); later corrections add dated revisions instead of replacing that evidence.
