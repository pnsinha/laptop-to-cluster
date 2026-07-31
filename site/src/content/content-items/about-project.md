---
id: about-project
stable_slug: project
title: About the Laptop-to-Cluster Guide
summary: "What this project is, who it serves, and what each milestone covers."
artifact_type: report
route_namespace: about
topics: [project]
keywords: [BSSw, fellowship, HPC, scope, milestones]
audiences: [general public, fellowship reviewers, scientific software practitioners]
milestone: 1
status: published
publication_date: "2026-07-31"
---
## What this is

A public guide that helps scientific software practitioners translate multi-service Docker Compose stacks into scheduler-managed, rootless-container workflows on shared HPC. It is the output of the 2026 BSSw Fellowship, running April 2026 through April 2027.

## Who it is for

Practitioners adapting their own stack, educators teaching the model, and fellowship reviewers examining the published work. All content is public and requires no account.

## Milestone roadmap

| Milestone | Due | Focus | Status |
|---|---|---|---|
| [1](/milestones/1/) | Jul 2026 | Foundation: project site and public repo, first two modules, baseline single-node workflow on Slurm + Apptainer | Delivered |
| 2 | Dec 2026 | Portability: Slurm and PBS launch templates, Apptainer/Charliecloud patterns, container union (one shared dependency tree reused across several containers), community dissemination | In progress |
| 3 | Mar 2027 | Training: reusable training packages, container-first Python guidance | Planned |
| 4 | Apr 2027 | Release: adoption checklist, HPC Best Practices webinar, BSSw.io post, v1.0 tag | Planned |

Each milestone is scoped to what has actually been run, not what should work in principle. Milestone 1 is a single-node baseline validated on Anvil. It does not claim one launch script runs unchanged at every center. Where a pattern has been tested on one system and not others, the module says which.

## Authority

The fellowship Statement of Work controls deliverables and dates. Official BSSw program material provides program context. Prior-fellow examples inform project-adopted practices but do not create program obligations.
