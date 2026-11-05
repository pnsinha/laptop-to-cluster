# Laptop-to-Cluster Guide

A free, open-source learning guide for Docker Compose users who need to run the same services on a shared HPC cluster. It shows how a scheduler allocation takes the place of `docker compose up`, with a batch-script pattern that has been run on a real cluster.

Read the guide at [laptop-to-cluster.org](https://laptop-to-cluster.org). The [release notes for v0.2.0](https://laptop-to-cluster.org/milestones/2/#release-v0-2-0) say what changed.

This repository holds the guide's source, the example workflows, the evidence behind every "tested" claim, and the tooling that builds and checks the site. It is a 2026 Better Scientific Software (BSSw) Fellowship project: **Bridging the Laptop-to-Cluster Gap: HPC-Native Translation Patterns for Multi-Service AI Stacks**.

## Where things are

| You want to | Go to |
|---|---|
| Read the guide | [laptop-to-cluster.org](https://laptop-to-cluster.org) |
| Read or edit the text of a page | [`site/src/content/content-items/`](site/src/content/content-items/), one Markdown file per page |
| Run the example on a cluster | [`workflows/baseline-slurm-apptainer/`](workflows/baseline-slurm-apptainer/) |
| See the layered install trees work behind the planned Module 5 | [`workflows/layered-install-trees/`](workflows/layered-install-trees/) |
| Check what was tested, where and when | [`evidence/`](evidence/) for the run bundles, [`site/src/content/applicability/`](site/src/content/applicability/) for the test records |
| Find release notes and signed release records | [`releases/`](releases/) |
| Report a problem or ask for help | [`SUPPORT.md`](SUPPORT.md), then [GitHub Issues](https://github.com/pnsinha/laptop-to-cluster/issues) |
| Contribute a change | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Change how the site looks | [`DESIGN.md`](DESIGN.md) |
| Find the build, check and release tooling | [`scripts/`](scripts/) and its [README](scripts/README.md) |
| Find the tests | [`tests/`](tests/): `unit`, `property`, `integration` (built pages), `accessibility` |
| Check licences and third-party terms | [`LICENSE`](LICENSE), [`licenses/`](licenses/), [`artifact-inventory.yml`](artifact-inventory.yml), [`THIRD_PARTY.yml`](THIRD_PARTY.yml) |
| Report a security issue | [`SECURITY.md`](SECURITY.md) |
| Restore the site after an outage | [`RECOVERY.md`](RECOVERY.md) |
| Know who maintains this and for how long | [`MAINTENANCE.md`](MAINTENANCE.md) |

`templates/` and `training/` are reserved for later milestones; each folder's README says what will go there and when.

## The learning path

| Page | On the site | Source | Status |
|---|---|---|---|
| The five-minute tour | [/guide/tour/](https://laptop-to-cluster.org/guide/tour/) | [`00-tour.md`](site/src/content/content-items/00-tour.md) | Published |
| Module 1: Scheduler as Orchestrator | [/guide/scheduler-as-orchestrator/](https://laptop-to-cluster.org/guide/scheduler-as-orchestrator/) | [`01-scheduler-as-orchestrator.md`](site/src/content/content-items/01-scheduler-as-orchestrator.md) | Published |
| Run the example | [/start/](https://laptop-to-cluster.org/start/) | [`start-run-the-example.md`](site/src/content/content-items/start-run-the-example.md) | Published |
| Module 2: Baseline Pattern, Single-Node Service + Workers | [/guide/baseline-single-node-pattern/](https://laptop-to-cluster.org/guide/baseline-single-node-pattern/) | [`02-baseline-single-node-pattern.md`](site/src/content/content-items/02-baseline-single-node-pattern.md) | Published; tested on Purdue Anvil, Oct 2026 |
| Module 3: Translate a Compose file | [/guide/compose-to-hpc-translation/](https://laptop-to-cluster.org/guide/compose-to-hpc-translation/) | [`03-compose-to-hpc-translation.md`](site/src/content/content-items/03-compose-to-hpc-translation.md) | Published; each row is labelled Tested or Designed, not run |
| Evaluate and adopt | [/adoption/evaluate/](https://laptop-to-cluster.org/adoption/evaluate/) | [`adoption-evaluate.md`](site/src/content/content-items/adoption-evaluate.md) | Published |
| Module 4: Slurm and PBS launch templates | | | Planned, Milestone 2 |
| Module 5: Reuse one CPU software layer across GPU variants | | | Planned, Milestone 2 |

Other pages follow a prefix: `about-*` for the project pages, `diagnostic-*` for troubleshooting entries, `milestone-*` and `release-*` for the project records, `event-*` for talks and posters.

## Work on the site

You need Node.js 22.15 or later.

```sh
npm ci
npm run build
npx astro preview --root site
```

Before committing, run the fast checks:

```sh
npm run check && npm run test:unit
```

For a change that affects rendered pages, also run:

```sh
npm run build && npm run test:integration:built && npm run test:accessibility:built
```

CI runs the full set, including a browser accessibility scan and the publication validators. [`CONTRIBUTING.md`](CONTRIBUTING.md) says which of those you can run locally.

## Page front matter

Each page starts with YAML front matter that [`site/src/content/schema.ts`](site/src/content/schema.ts) validates at build time. The fields most edits touch are `title`, `summary`, `description`, `status` and `last_updated`. Never change `id` or `stable_slug` on a published page: other records refer to the `id`, and most addresses end in the `stable_slug` (see `canonicalPath` in [`registry.ts`](site/src/content/registry.ts)). The file name is free to change. [`00-tour.md`](site/src/content/content-items/00-tour.md) is a complete example of a learning module.

## Acknowledgment

This work was supported by the Better Scientific Software Fellowship Program, a collaborative effort of the U.S. Department of Energy (DOE), Office of Advanced Scientific Research via ANL under Contract DE-AC02-06CH11357 and the National Nuclear Security Administration Advanced Simulation and Computing Program via LLNL under Contract DE-AC52-07NA27344; and by the National Science Foundation (NSF) via SHI under Grant No. 2435328.

Any opinions, findings, and conclusions or recommendations expressed in this material are those of the author(s) and do not necessarily reflect the views of the DOE or NSF.

## Author

Parmanand Sinha, PhD — Computational Scientist, University of Chicago Research Computing Center  
2026 BSSw Fellow (individual capacity)
