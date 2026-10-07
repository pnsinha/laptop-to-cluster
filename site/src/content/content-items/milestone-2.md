---
id: milestone-2
stable_slug: milestone-2
title: "Milestone 2: Portability and Dissemination"
summary: "What is planned and in progress for the December 15, 2026 portability milestone, and where to find it."
artifact_type: milestone
topics: [milestone-2]
keywords: [deliverables, Milestone 2, status]
audiences: [fellowship reviewers, project adopters]
milestone: 2
status: published
applicability_records: [m2-baseline-anvil-2026-10]
publication_date: "2026-09-26"
related: [module-0-orientation, module-2-baseline, module-3-compose-to-hpc-translation]
---
Milestone 2 extends the Milestone 1 baseline toward portability across schedulers and runtimes, adds an orientation tour, documents the adaptation seams that let adopters reuse the reference workflow for their own applications, and publishes the guide through talks and posters.

| Deliverable | Status | Public URL | Revision |
|---|---|---|---|
| The five-minute tour (Module 0) | Published | [The tour](/guide/tour/) | Initial publication |
| Module 3: Compose-to-HPC translation | Published | [Translate a Compose file](/guide/compose-to-hpc-translation/) | Initial publication |
| Module 4: Slurm and PBS-family launch templates | Planned | n/a | SOW topic 2 |
| Module 5: Reuse one CPU software layer across GPU variants | Planned | n/a | SOW topic 3; draft due 2026-11-13 |
| Adaptation-seam documentation in Module 2 | Published | [Module 2](/guide/baseline-single-node-pattern/) | Revised for v0.2.0 |
| I-GUIDE Forum 2026 poster | Delivered | [I-GUIDE Forum 2026](/events/iguide-forum-2026/) | Delivered 2026-08-05 |
| US-RSE '26 talk | Accepted | [Talks and papers](/about/talks-and-papers/) | Tuesday 2026-10-20 |
| SC26 research poster | Accepted | [Talks and papers](/about/talks-and-papers/) | November 2026 |

## Scope notes

The tour is additive to the fellowship statement of work: it is not a SOW-listed deliverable. It is tracked here as `M2-MODULE-0` for transparency, and it answers the first Milestone 1 program-review question below.

Modules 4 and 5 are the SOW "portability modules" deliverable (SOW topics 2 and 3). Module 3 is supporting material for that deliverable, not a SOW-listed deliverable itself.

Talks and posters are linked from [Talks and papers](/about/talks-and-papers/). This site links to them where they are hosted and hosts none of their files, except the I-GUIDE Forum 2026 poster, which has its own [event page](/events/iguide-forum-2026/).

## Planned

- **Module 5: reuse one CPU software layer across GPU variants** (SOW topic 3, runtime portability). Draft due 2026-11-13.
- **Module 4: Slurm and PBS-family launch templates** (SOW topic 2). Scope to be determined.

## Feedback traceability

The Milestone 1 program review (2026-08-14) made one suggestion and asked four questions. They are quoted exactly.

> I think the site could use a site-map or a “module 0” that gives users a baseline of who the audience is and how they should progress through the modules/site as a whole. It would be helpful to know what assumptions and pre-existing skills a learner should have.

> What does the “workflow source” do? How would a user modify it to run their own application? It seems that the workflow includes results verification, is this something the user would expect to see for their own application? Are the various json files (such as results.json) intended for humans or for other tools to parse?

Source: Milestone 1 program review, 2026-08-14. Where each part is answered:

| Topic | Where it is answered |
|---|---|
| Audience, assumed skills and progression | [The five-minute tour](/guide/tour/) |
| What the workflow source does | [Module 2: the same stack in one allocation](/guide/baseline-single-node-pattern/#the-same-stack-in-one-allocation) |
| Modifying it for your own application | [Module 2: adapt it](/guide/baseline-single-node-pattern/#adapt-it) |
| Result verification in your own application | [Module 2: adapt it](/guide/baseline-single-node-pattern/#adapt-it), and the tour |
| Whether the JSON files are for people or tools | [Module 2: files the workflow reads and writes](/guide/baseline-single-node-pattern/#files-the-workflow-reads-and-writes) |
