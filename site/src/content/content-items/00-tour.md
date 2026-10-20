---
id: module-0-orientation
stable_slug: tour
title: "The five-minute tour"
description: "A plain-language tour of the Laptop-to-Cluster guide: why Docker Compose stops working on a shared cluster, the six steps of the cluster approach, who this guide is for and what you need."
summary: "Why docker compose up stops working on a shared cluster, what you do instead in six steps, and whether this guide is for you."
module_number: 0
topics: [orientation, prerequisites]
keywords: [orientation, tour, prerequisites, readiness, HPC, Compose]
audiences: [HPC learners, scientific software practitioners, HPC center staff]
milestone: 2
status: published
publication_date: "2026-09-26"
last_updated: "2026-10-20"
applicable_release: v0.1.0
artifact_type: learning-module
module_type: conceptual
learning_outcomes:
  - "Explain in two sentences why docker compose up does not work on a shared cluster."
  - "Name the six steps of the cluster approach and the four ideas that change meaning."
  - "Decide whether this guide fits your role, and what you need before you run the example."
prerequisites: []
section_kinds: [concept, limitations, next-steps]
estimated_minutes: 5
completion_check:
  kind: mapping-checklist
  text: "Tick each skill and access item you already have. For any you lack, note the page you will use before you run the example."
related: [module-1-scheduler-orchestrator, start-guide, module-3-compose-to-hpc-translation, adoption-evaluate, glossary]
supporting_artifacts: []
learning_stage: baseline
authority:
  - { kind: project-decision, citation: "Milestone 1 program review, 2026-08-14", scope: "Audience, assumed skills and a suggested path, so a first-time reader knows whether and how to use the guide." }
---
## Why Compose stops working

On your laptop, `docker compose up` starts every service of your project. A shared research cluster works differently. It runs no Docker daemon, it gives you no root access (administrator rights), and a scheduler decides what runs, where and for how long. So the same stack has to start another way: from a script that runs inside a block of computer time the scheduler grants you.

## The big idea

You ask the scheduler (the program, usually Slurm, that shares out the cluster; see [batch scheduler](/about/glossary/#batch-scheduler)) for a fixed share of one machine for a fixed time. That share is your [allocation](/about/glossary/#allocation). When it is granted, one script starts each service inside it, checks that they work, runs the job and cleans up. Everything stops when the allocation ends.

The figure shows the script's six steps, in order.

<!-- l2c:timeline -->

## The six steps in detail

The steps below describe the example script, in plain terms with the technical term in parentheses.

### 1. Get an allocation

Before the script runs, you submit it to the scheduler and wait your turn. Once it starts, it first checks that the container image and the input file match their recorded checksums. Then it makes a private folder for this job: temporary job storage ([job-scoped scratch](/about/glossary/#job-scoped-scratch)). The script refuses to reuse a folder that already exists.

### 2. Start coordinator

The coordinator is the one service that hands out tasks and collects results. The script starts it as a program the scheduler launches and tracks inside your allocation (a [job step](/about/glossary/#job-step)). The coordinator listens only on local-only access ([loopback](/about/glossary/#loopback)), on a free port it picks, and writes its address to a file in the job folder.

### 3. Readiness gate

Before any worker starts, the script waits, for up to 30 seconds by default, for the coordinator to give the exact answer a healthy coordinator gives. An open port is not enough. If the answer never comes, the job stops with a named error and no worker ever starts. This check is the [readiness gate](/about/glossary/#readiness-gate); [Troubleshooting](/diagnostics/) lists the named errors.

### 4. Run workers

Now the script starts the workers, each as its own job step. A [worker](/about/glossary/#worker) asks the coordinator for a task, does it and sends back the result. The script waits for the workers to finish, not for the coordinator, which keeps running.

### 5. Verify results

With the coordinator still running, a separate check compares every result with what was expected. Only if all of them pass does the script write the success file, `result.json`, containing `"status": "success"`. A zero exit code alone is not success. This check is [verification](/about/glossary/#verification).

### 6. Clean up

At the very start, the script registers a cleanup step that runs last, however the job ends: a normal finish, a failure or the scheduler's time limit. It asks every program still running to stop, and then forces any that do not after a short grace period (the time-limit path and the forced stop are Designed, not run). The job folder is not deleted. When your center clears it depends on the center, so copy out what you want to keep.

## Four ideas that change meaning

Four Compose ideas change meaning on a cluster. Each keeps the same color and shape across this site.

| On your laptop (Compose) | On the cluster | Plain-language name |
|---|---|---|
| a service | a program the scheduler launches and tracks inside your allocation | <a class="c-step" href="/about/glossary/#job-step">job step</a> |
| `healthcheck` and `depends_on` | a check that the coordinator can really serve before any worker starts | <a class="c-gate" href="/about/glossary/#readiness-gate">readiness gate</a> |
| a named volume | temporary job storage | <a class="c-scratch" href="/about/glossary/#job-scoped-scratch">job-scoped scratch</a> |
| a published port | local-only access, which services use by default | <a class="c-net" href="/about/glossary/#loopback">loopback</a> |

Reaching a service from beyond its node needs access your center approves, such as an [SSH tunnel](/about/glossary/#ssh-tunnel) where it allows one.

## The gate is not the verifier

- **The readiness gate asks: can the coordinator serve?** It proves the service is up and answering correctly, so workers do not start too early. It belongs to the pattern. Keep it, and change only what "ready" means for your service.
- **Verification asks: are the results right?** Only your science can say. It belongs to your application. Replace the example check with your own, and remove it only if a clean exit truly means success for you, which is rarely true.

A job can pass the gate and still produce wrong answers. Only verification catches that.

## Did this really run?

Pages on this site use three labels, and each means one thing.

- **Tested**: it ran on a named cluster. The test record says which cluster and when.
- **Shim-tested**: it ran off-cluster, against test fixtures or local Docker, never on a cluster.
- **Designed, not run**: it follows the same pattern, but nobody has run it yet.

The example workflow is Tested. The badge on [Module 2](/guide/baseline-single-node-pattern/) opens its test record. Anything this guide describes beyond that, such as other centers, other schedulers or GPUs, is Shim-tested or Designed, not run. [What was tested where](/adoption/evaluate/#not-tested) lists all three.

## Who this guide is for

- **Researchers** with a multi-service Docker Compose project who need to run it on a shared cluster.
- **Research software engineers** who support several groups and want a reusable translation model.
- **Center staff** deciding whether a pattern like this fits their cluster. The [evaluation guide](/adoption/evaluate/) is written for you.

### What you should already know

- Docker Compose basics: what a service, an image and a volume are.
- A Unix shell: moving around, editing a file and running a command.
- To run the example, you should also have submitted at least one batch job on a cluster.

### What you need access to

To read: nothing. To run the example: an account on a cluster that uses Slurm and lets you request one node, Apptainer on its compute nodes, and a private folder you can write to for job scratch. [Run the example](/start/) shows how to check each.

### How to progress

Read this tour first. Then follow the path in order, or jump to the page that matches your goal.

- [Module 1](/guide/scheduler-as-orchestrator/) explains the model in depth.
- [Run the example](/start/) checks your cluster and submits the job.
- [Module 2](/guide/baseline-single-node-pattern/) walks through the baseline workflow.
- [Translate a Compose file](/guide/compose-to-hpc-translation/) adapts it to your stack.
- [Evaluate and adopt](/adoption/evaluate/) helps you decide whether the pattern fits your center.

## Key points

- A cluster scheduler, not Docker, decides what runs. You ask for an allocation, and a script starts your services inside it.
- The script has six steps: allocation, coordinator, readiness gate, workers, verification and clean up.
- The readiness gate proves the coordinator can serve. Verification decides whether the results are right.
- Services use local-only access (loopback) by default. Reaching them from beyond the node needs access your center approves. Your center may clear the job folder, so copy results out promptly.

## Next step

Pick the destination that matches where you are.

- [Translate a Compose file](/guide/compose-to-hpc-translation/): see what each part of your Compose file becomes, then edit the example job to run your own services.
- [Evaluate and adopt](/adoption/evaluate/): what the pattern assumes, where it was tested, and when a service your center already runs is the better choice.
- [Run the example](/start/): check your cluster and submit the baseline job.
- [The one-page cheat sheet](/about/cheat-sheet/), to print and keep beside your terminal
