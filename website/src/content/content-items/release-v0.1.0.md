---
id: release-v0-1-0
stable_slug: v0-1-0
title: Release v0.1.0
summary: "The published Milestone 1 changes and immutable repository citation."
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
This record does not render its own page. Because exactly one release maps to exactly
one milestone at v0.1.0, its release notes and immutable citation render as a section of
[Milestone 1](/milestones/1/) instead. See design.md's "Pre-deployment route consolidation"
amendment. The `MilestoneFields` and `ReleaseRecord` data remain distinct so a milestone that
spans multiple releases (Milestone 2 onward) can render `/releases/{version}/` on its own.
