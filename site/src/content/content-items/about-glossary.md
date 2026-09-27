---
id: glossary
stable_slug: glossary
title: Glossary
summary: "Definitions for the HPC and container terms used across the Laptop-to-Cluster guide."
artifact_type: report
route_namespace: about
topics: [glossary]
keywords: [glossary, HPC, definitions, terminology]
audiences: [HPC learners, scientific software practitioners, general public]
milestone: 1
status: published
publication_date: "2026-07-27"
---
## Scheduler and allocation

<dl>
<dt id="allocation"><strong>allocation</strong></dt>
<dd>Compute resources (cores, memory, GPUs, wall time) that a scheduler grants temporarily to a job.</dd>
<dt id="batch-scheduler"><strong>batch scheduler</strong></dt>
<dd>Software, such as Slurm or a PBS-family system, that assigns shared cluster resources and controls when jobs run.</dd>
<dt id="job"><strong>job</strong></dt>
<dd>Submitted work that requests resources and runs inside an allocation until completion, cancellation, failure, or timeout.</dd>
<dt id="job-step"><strong>job step</strong></dt>
<dd>A process the scheduler launches and tracks within an allocation; one job can contain several steps.</dd>
<dt id="coordinator"><strong>coordinator</strong></dt>
<dd>The single service process in the service-plus-workers pattern that accepts tasks and hands out work; it must reach readiness before any worker starts.</dd>
<dt id="worker"><strong>worker</strong></dt>
<dd>A process in the service-plus-workers pattern that takes tasks from the coordinator and produces results; workers start only after the coordinator is ready.</dd>
<dt id="orchestration-boundary"><strong>orchestration boundary</strong></dt>
<dd>The system responsible for starting and connecting processes. Compose fills this role on a laptop; on HPC, the scheduler allocation and launch script fill it together.</dd>
<dt id="reclamation"><strong>reclamation</strong></dt>
<dd>The scheduler returning allocated resources to the cluster when a job ends or reaches its wall-time limit.</dd>
<dt id="terminal-state"><strong>terminal state</strong></dt>
<dd>The scheduler’s final classification of a job, such as <code>COMPLETED</code>, <code>FAILED</code>, <code>TIMEOUT</code>, or <code>CANCELLED</code>.</dd>
<dt id="wall-time"><strong>wall time</strong></dt>
<dd>The maximum duration requested for a job. The scheduler ends a job that reaches this limit.</dd>
</dl>

## Runtime and storage

<dl>
<dt id="bind"><strong>bind</strong></dt>
<dd>A host filesystem path mounted at a chosen path inside a container.</dd>
<dt id="immutable-image"><strong>immutable image</strong></dt>
<dd>A read-only container image, such as an Apptainer <code>.sif</code> file, replaced through a verified rebuild rather than edited during a run.</dd>
<dt id="job-scoped-scratch"><strong>job-scoped scratch</strong></dt>
<dd>Temporary writable storage assigned to one job and unsuitable for durable results.</dd>
<dt id="module-load"><strong>module load</strong></dt>
<dd>A command that makes center-managed software available in the current environment.</dd>
<dt id="rootless-runtime"><strong>rootless runtime</strong></dt>
<dd>A container runtime, such as Apptainer or Charliecloud, that launches containers without a privileged daemon or root access.</dd>
</dl>

## Workflow mechanics

<dl>
<dt id="checksum-sha-256"><strong>checksum (SHA-256)</strong></dt>
<dd>A content fingerprint used to verify that a file matches an expected artifact.</dd>
<dt id="inert-input"><strong>inert input</strong></dt>
<dd>Input parsed as data rather than evaluated as code or shell commands.</dd>
<dt id="loopback"><strong>loopback</strong></dt>
<dd>The local-only network interface, usually <code>127.0.0.1</code>, used to keep a service reachable only from the same machine.</dd>
<dt id="readiness-check"><strong>readiness check</strong></dt>
<dd>A test that confirms a service can perform its required operation before dependent work starts.</dd>
<dt id="semantic-readiness"><strong>semantic readiness</strong></dt>
<dd>A readiness check that verifies a correct service response rather than only an open port.</dd>
<dt id="ssh-tunnel"><strong>SSH tunnel</strong></dt>
<dd>An encrypted forwarding path used to reach a remote service through SSH without publishing its port broadly.</dd>
<dt id="success-marker"><strong>success marker</strong></dt>
<dd>A machine-readable file written only after the workflow’s documented result checks pass.</dd>
<dt id="readiness-contract"><strong>readiness contract</strong></dt>
<dd>The specific response a service must produce before dependent work starts — the agreed meaning of "ready" that a readiness check enforces.</dd>
<dt id="verifier"><strong>verifier</strong></dt>
<dd>A program that compares workflow outputs against documented success criteria and writes the success marker only when they pass.</dd>
<dt id="workflow-package"><strong>workflow package</strong></dt>
<dd>The complete, release-pinned code that you download and submit, as opposed to the excerpts shown on the site for teaching.</dd>
<dt id="teaching-excerpt"><strong>teaching excerpt</strong></dt>
<dd>An annotated fragment of the workflow package shown on a page for explanation; it is not a replacement for the runnable source.</dd>
<dt id="applicability-record"><strong>applicability record</strong></dt>
<dd>A published record of where the workflow was validated — environment, scheduler, runtime, result, assumptions, and portability boundaries.</dd>
<dt id="release-pinned"><strong>release-pinned</strong></dt>
<dd>Referring to an immutable tagged release of the repository (such as <code>v0.1.0</code>) rather than a moving branch, so the cited code cannot drift.</dd>
<dt id="demonstrator-vs-template"><strong>demonstrator vs. template</strong></dt>
<dd>The two purposes of the reference workflow package: it demonstrates that the pattern runs (producing the evidence bundle), and it is a template you edit for your own application.</dd>
</dl>

Continue with [Scheduler as Orchestrator](/guide/scheduler-as-orchestrator/), the [Baseline Pattern](/guide/baseline-single-node-pattern/), or [Getting started](/start/).
