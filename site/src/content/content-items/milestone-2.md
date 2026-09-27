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
| Module 0: How to use this guide | Published | [Module 0](/guide/how-to-use-this-guide/) | Initial publication |
| Module 3: Compose-to-HPC Translation | Draft | `/guide/compose-to-hpc-translation/` (no page while draft) | In progress |
| Adaptation-seam documentation in Module 2 | Published | [Module 2](/guide/baseline-single-node-pattern/) | Revised 2026-09-26 |
| Scheduler launch templates (Slurm and PBS family) | Planned | — | Not started |
| Dissemination (I-GUIDE Forum 2026 and follow-ups) | Planned | [I-GUIDE Forum 2026](/events/iguide-forum-2026/) | I-GUIDE Forum 2026 delivered; second engagement pending |

## Scope notes

Module 0 is additive to the fellowship statement of work: it is not a SOW-listed deliverable. It was added in response to reviewer feedback and is tracked here as `M2-MODULE-0` for transparency.

Module 3 counts toward the SOW "portability modules" deliverable only after it gains a portability-boundaries section. Until then it remains a draft and does not satisfy the deliverable wording.

The adaptation-seam documentation in Module 2 names which parts of the workflow package to keep and which to replace, separating the readiness gate (an orchestration concern) from result verification (an application concern).

## Feedback traceability

Three pieces of this milestone's work originated in program administrator feedback on the Milestone 1 review (Elsa Gonsiorowski, 2026-08-14):

- **Module 0** exists because the review found the site lacked orientation for new visitors: who the guide is for, what it assumes, and how to check readiness before attempting the baseline.
- **The adaptation-seam documentation** in Module 2 exists because the review found that the workflow's dual purpose — demonstrator and template — was not explained, leaving adopters unsure which files were safe to change.
- **The readiness-versus-verification separation** recorded there reflects the review's request to distinguish the orchestration-level readiness gate from application-level result checks.
