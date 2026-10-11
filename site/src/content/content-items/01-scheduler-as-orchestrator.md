---
id: module-1-scheduler-orchestrator
stable_slug: scheduler-as-orchestrator
title: "Scheduler as Orchestrator"
description: "How the scheduler allocation, not Compose, starts, orders, and ends the services in a multi-service stack on shared HPC"
module_number: 1
topics: [scheduler-as-orchestrator]
status: published
last_updated: "2026-10-15"
summary: "The core reframe: on a shared cluster, a scheduler allocation and one launch script do what Compose does on your laptop."
artifact_type: learning-module
keywords: [Compose, HPC, orchestration, scheduler]
audiences: [HPC learners, scientific software practitioners]
milestone: 1
publication_date: "2026-07-31"
applicable_release: v0.1.0
module_type: conceptual
learning_outcomes: ["Map each Compose responsibility to its scheduler-managed form", "Tell the readiness gate apart from result verification", "Identify where readiness, storage, networking, and privilege assumptions vary by center"]
prerequisites:
  - { id: module-0-orientation, check: "Take the five-minute tour" }
estimated_minutes: 20
section_kinds: [concept, limitations, next-steps]
completion_check: { kind: decision-exercise, text: "Choose one local Compose stack and record who should own allocation, startup order, runtime state, access, and accelerators on your center." }
schedulers: [slurm]
container_runtimes: [apptainer]
related: [module-2-baseline, start-guide]
learning_stage: baseline
supporting_artifacts:
  - { repository: "https://github.com/pnsinha/laptop-to-cluster", release: v0.1.0, path: README.md, integrity: "sha256:a94e0087582c95865ba4e875ec8938ed109b9c1cfae615980d6b10258343a3d1" }
authority:
  - { kind: sow, citation: "Fellowship SOW, Milestone 1", scope: "Publish the scheduler-as-orchestrator learning module." }
  - { kind: project-decision, citation: "Milestone 1 architecture", scope: "Use one allocation as the bounded baseline orchestration boundary." }
sow_deliverable_id: M1-MODULE-1
deliverable_status: complete
completion_evidence: { id: m1-module-1-publication, path: evidence/README.md, integrity: "sha256:2fb0fd2e84a083ee33564797f69e63d40fc225987ebe94ea41832995713aca6a" }
---
## Your Compose stack, before

On a laptop, one Compose file describes the whole stack. This simplified sketch has a coordinator that must be answering before the workers start, two workers, a one-shot check of the results, and a named volume for the files they share. Commands for the workers and the check are left out. It is a design sketch: **Designed, not run**.

```yaml
# docker-compose.yml (simplified)
services:
  coordinator:
    build: .
    command: python3 /opt/bssw/bin/coordinator.py --input /in/tasks.json --results /work/results.json --endpoint-file /work/endpoint.json
    healthcheck:
      test: ["CMD", "python3", "-c", "import json, urllib.request as u; e = json.load(open('/work/endpoint.json'))['endpoint']; assert json.load(u.urlopen(e + '/health', timeout=1)) == {'status': 'ready', 'schemaVersion': 1, 'taskCount': 4}"]
      retries: 30
    volumes: [work:/work, ./inputs:/in:ro]
  worker:
    build: .
    deploy: { replicas: 2 }
    depends_on: { coordinator: { condition: service_healthy } }
    volumes: [work:/work]
  verify:
    build: .
    depends_on: { worker: { condition: service_completed_successfully } }
    volumes: [work:/work, ./inputs:/in:ro, ./expected:/expected:ro]
volumes:
  work: {}
```

## The same stack on a cluster

A shared cluster runs no Docker daemon and gives you no administrator rights, so `docker compose up` does not work there. Instead you ask a [batch scheduler](/about/glossary/#batch-scheduler) for an [allocation](/about/glossary/#allocation): a share of one machine for a fixed time. One launch script then does inside it what Compose did on your laptop. The script moves through six steps: get the allocation, start the coordinator, pass the readiness gate, run the workers, verify the results, and clean up.

Four ideas change meaning along the way:

- A Compose service becomes <a class="c-step" href="/about/glossary/#job-step">a program the scheduler launches and tracks inside your allocation (job step)</a>.
- `depends_on` plus a health check becomes <a class="c-gate" href="/about/glossary/#readiness-gate">a check that the coordinator can really serve before any worker starts (readiness gate)</a>.
- A named volume becomes <a class="c-scratch" href="/about/glossary/#job-scoped-scratch">temporary job storage (job-scoped scratch)</a>.
- A published port becomes <a class="c-net" href="/about/glossary/#loopback">local-only access (loopback)</a>. Reaching the service from outside the node needs a path your center approves, such as an [SSH tunnel](/about/glossary/#ssh-tunnel).

Two checks guard the run, and they answer different questions. The readiness gate asks whether the coordinator can serve. It belongs to the pattern, so you keep it and change only what "ready" means for your service. Verification asks whether the application's results are correct. Only your application can say, so you replace it with your own check.

<!-- l2c:diagram-readiness-sequence -->

## Map each responsibility

<!-- l2c:timeline -->

| Compose concept | On the cluster | Decision to make |
|---|---|---|
| service | <span class="c-step">job step</span>: a tracked program inside one allocation | Which process coordinates, and which processes are workers? |
| image or build | an immutable image launched by a [rootless runtime](/about/glossary/#rootless-runtime) | Who builds and approves the image? |
| dependency or health check | <span class="c-gate">readiness gate</span>: a bounded check for the exact right answer ([semantic readiness](/about/glossary/#semantic-readiness)) | What response proves the coordinator is ready? |
| volume | <span class="c-scratch">job-scoped scratch</span> or an approved storage bind | Which state is temporary, and which must persist? |
| port | <span class="c-net">loopback</span> or a center-approved access path | Who needs access, and what does policy permit? |
| device request | a scheduler request for CPU, memory, wall time, or accelerators. For this workflow: **Designed, not run** | Which resources must be requested before launch? |

<!-- l2c:diagram-compose-to-hpc -->

## What varies by center

This mapping does not make a workflow portable unchanged. Check each of these with your center before you adapt anything:

- **Scheduler syntax.** Account, partition, and time-limit options differ. Read your center's job-script guide.
- **Network policy.** Whether job steps on one node may reach each other over loopback, and what, if anything, can reach a node from outside.
- **Storage.** Which path is private and job-scoped, how much quota it has, and when it is cleared.
- **Runtime modules.** How your center provides Apptainer or Charliecloud, and which version.
- **Accelerators.** The flags and runtime options that expose GPUs.

Multi-node discovery, persistent databases, privileged ports, and production availability are outside the single-node pattern this guide teaches. For what has been run and what has not, see [what hasn't been tested yet](/adoption/evaluate/#not-tested).

## Adapt it

Pick one Compose stack of your own and decide who owns each of five things: the allocation, the startup order, the runtime state, access to the service, and any accelerators. Each owner is one of scheduler policy, runtime behavior, your launch script, or your center's local configuration. Write the answers down; the completion exercise on this page turns them into a reviewable decision record.

Next, [run the baseline example](/start/), or read how it is built in [Baseline Pattern: Single-Node Service + Workers](/guide/baseline-single-node-pattern/).

## Key points

- A scheduler allocation and one launch script, not Compose, start, order, and end your services.
- Four ideas change meaning: a service becomes a job step, a health check becomes the readiness gate, a volume becomes job-scoped scratch, and a published port becomes loopback.
- The readiness gate checks that the coordinator can serve. Verification checks that the results are correct. They are different checks.
- Scheduler syntax, network policy, storage, and runtime modules vary by center.
