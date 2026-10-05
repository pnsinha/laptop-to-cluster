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
applicability_records: [m1-baseline-anvil]
publication_date: "2026-09-26"
related: [module-0-orientation, module-2-baseline]
---
Milestone 2 extends the Milestone 1 baseline toward portability across schedulers and runtimes, adds an orientation module, and documents the adaptation seams that let adopters reuse the reference workflow for their own applications.

| Deliverable | Status | Public URL | Revision |
|---|---|---|---|
| The five-minute tour (Module 0) | Published | [The tour](/guide/tour/) | Initial publication |
| Module 3: Compose-to-HPC Translation | Draft | `/guide/compose-to-hpc-translation/` (no page while draft) | In progress |
| Module 4: Slurm and PBS-family launch templates | Planned | — | SOW topic 2 |
| Module 5: Layered install trees | Planned | — | SOW topic 3; draft due 2026-11-13 |
| Adaptation-seam documentation in Module 2 | Published | [Module 2](/guide/baseline-single-node-pattern/) | Revised 2026-09-26 |
| Dissemination (I-GUIDE Forum 2026, SC26, and follow-ups) | Planned | [I-GUIDE Forum 2026](/events/iguide-forum-2026/) | I-GUIDE Forum 2026 delivered; SC26 page due before 2026-11-15 |

## Scope notes

Module 0 is additive to the fellowship statement of work: it is not a SOW-listed deliverable. It was added in response to reviewer feedback and is tracked here as `M2-MODULE-0` for transparency.

Modules 4 and 5 are the SOW "portability modules" deliverable (SOW topics 2 and 3). Module 3 is supporting material for that deliverable, not a SOW-listed deliverable itself; it still needs a portability-boundaries section before it can publish.

The adaptation-seam documentation in Module 2 names which parts of the workflow package to keep and which to replace, separating the readiness gate (an orchestration concern) from result verification (an application concern).

## Planned

- **Module 5: Layered install trees** (SOW topic 3, runtime portability) — draft due 2026-11-13. Applicability record `m2-layered-trees-anvil`, recorded on Anvil only.
- **Module 4: Slurm and PBS-family launch templates** (SOW topic 2) — planned; scope to be determined.
- **SC26 event page** (dissemination) — before 2026-11-15.

## Feedback traceability

Three pieces of this milestone's work originated in program administrator feedback on the Milestone 1 review (Elsa Gonsiorowski, 2026-08-14):

- **Module 0** exists because the review found the site lacked orientation for new visitors: who the guide is for, what it assumes, and how to check readiness before attempting the baseline.
- **The adaptation-seam documentation** in Module 2 exists because the review found that the workflow's dual purpose — demonstrator and template — was not explained, leaving adopters unsure which files were safe to change.
- **The readiness-versus-verification separation** recorded there reflects the review's request to distinguish the orchestration-level readiness gate from application-level result checks.
