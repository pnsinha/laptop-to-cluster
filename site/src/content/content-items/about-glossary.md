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
## Ten core terms

Each entry starts in plain language. The "Compose" notes show what the idea replaces if you already know Docker Compose.

<dl>
<dt id="batch-scheduler"><strong>scheduler (batch scheduler)</strong></dt>
<dd>The program that decides who gets which part of a shared cluster, and when. Slurm and PBS are examples. On a laptop, you are the scheduler.</dd>
<dt id="allocation"><strong>allocation</strong></dt>
<dd>The share of the cluster, for a fixed amount of time, that the scheduler grants to your job. Everything you run happens inside it, and it ends when the time is up. <em>Compose:</em> the stretch between <code>docker compose up</code> and <code>down</code>.</dd>
<dt id="job-step"><strong class="c-step">job step</strong></dt>
<dd>A program the scheduler launches and tracks inside your allocation. In Slurm, each <code>srun</code> command starts one. <em>Compose:</em> a service.</dd>
<dt id="coordinator"><strong>coordinator</strong></dt>
<dd>The one service that hands out work and collects results. It starts first, and no worker starts until the readiness gate has passed.</dd>
<dt id="worker"><strong>worker</strong></dt>
<dd>A program that asks the coordinator for tasks and sends back results. Workers start only after the readiness gate passes.</dd>
<dt id="readiness-gate"><strong class="c-gate">readiness gate</strong></dt>
<dd>A time-limited check that the coordinator gives the exact right answer before any worker starts. It proves the coordinator can serve. It does not prove that any result is right; that is verification. <em>Compose:</em> <code>healthcheck</code> plus <code>depends_on</code>.</dd>
<dt id="verification"><strong>verification</strong></dt>
<dd>Your check that every result is correct. Only a full pass writes the success marker (<code>result.json</code>). A job can pass the readiness gate and still produce wrong results; only verification catches that. It belongs to your application, so you replace it with your own definition of correct. <em>Compose:</em> nothing. See also <a href="#verifier">verifier</a> and <a href="#success-marker">success marker</a>.</dd>
<dt id="job-scoped-scratch"><strong class="c-scratch">job-scoped scratch</strong></dt>
<dd>Temporary job storage: a private folder made for one job. Do not keep anything there that you need later. Whether and when it is cleared depends on your center. <em>Compose:</em> a named volume.</dd>
<dt id="loopback"><strong class="c-net">loopback</strong></dt>
<dd>Local-only access: the address (usually <code>127.0.0.1</code>) a machine uses to talk to itself. It keeps a service off the network, but other jobs on the same node can still reach it. <em>Compose:</em> replaces a published <code>ports</code> entry.</dd>
<dt id="ssh-tunnel"><strong class="c-net">SSH tunnel</strong></dt>
<dd>An approved, encrypted path from your own computer to a service on a compute node, if your center allows one. <em>Compose:</em> replaces a published port.</dd>
</dl>

## Evidence words

<dl>
<dt id="evidence-vocabulary"><strong>Tested, shim-tested, designed not run</strong></dt>
<dd>Pages on this site use three words for how much proof stands behind a claim.
<ul>
<li><strong>Tested:</strong> it ran on a named cluster. The badge or the test record says which cluster and when.</li>
<li><strong>Shim-tested:</strong> it ran only off-cluster, against test fixtures or local Docker, and never on a cluster.</li>
<li><strong>Designed, not run:</strong> it is a design that has not been run. Pages label it exactly that.</li>
</ul></dd>
</dl>

## More terms

### Scheduler and allocation

<dl>
<dt id="job"><strong>job</strong></dt>
<dd>Submitted work that requests resources and runs inside an allocation until completion, cancellation, failure, or timeout.</dd>
<dt id="orchestration-boundary"><strong>orchestration boundary</strong></dt>
<dd>The system responsible for starting and connecting processes. Compose fills this role on a laptop; on HPC, the scheduler allocation and launch script fill it together.</dd>
<dt id="reclamation"><strong>reclamation</strong></dt>
<dd>The scheduler returning allocated resources to the cluster when a job ends or reaches its wall-time limit.</dd>
<dt id="terminal-state"><strong>terminal state</strong></dt>
<dd>The scheduler’s final classification of a job, such as <code>COMPLETED</code>, <code>FAILED</code>, <code>TIMEOUT</code>, or <code>CANCELLED</code>.</dd>
<dt id="wall-time"><strong>wall time</strong></dt>
<dd>The maximum duration requested for a job. The scheduler ends a job that reaches this limit.</dd>
</dl>

### Runtime and storage

<dl>
<dt id="bind"><strong>bind</strong></dt>
<dd>A host filesystem path mounted at a chosen path inside a container.</dd>
<dt id="immutable-image"><strong>immutable image</strong></dt>
<dd>A read-only container image, such as an Apptainer <code>.sif</code> file, replaced through a verified rebuild rather than edited during a run.</dd>
<dt id="module-load"><strong>module load</strong></dt>
<dd>A command that makes center-managed software available in the current environment.</dd>
<dt id="rootless-runtime"><strong>rootless runtime</strong></dt>
<dd>A container runtime, such as Apptainer or Charliecloud, that launches containers without a privileged daemon or root access.</dd>
</dl>

### Workflow mechanics

<dl>
<dt id="checksum-sha-256"><strong>checksum (SHA-256)</strong></dt>
<dd>A content fingerprint used to verify that a file matches an expected artifact.</dd>
<dt id="inert-input"><strong>inert input</strong></dt>
<dd>Input parsed as data rather than evaluated as code or shell commands.</dd>
<dt id="readiness-check"><strong>readiness check</strong></dt>
<dd>A test that confirms a service can perform its required operation before dependent work starts.</dd>
<dt id="semantic-readiness"><strong>semantic readiness</strong></dt>
<dd>A readiness check that verifies a correct service response rather than only an open port.</dd>
<dt id="success-marker"><strong>success marker</strong></dt>
<dd>A machine-readable file written only after the workflow’s documented result checks pass.</dd>
<dt id="readiness-contract"><strong>readiness contract</strong></dt>
<dd>The specific response a service must produce before dependent work starts: the agreed meaning of “ready” that a readiness check enforces.</dd>
<dt id="verifier"><strong>verifier</strong></dt>
<dd>A program that compares workflow outputs against documented success criteria and writes the success marker only when they pass.</dd>
<dt id="workflow-package"><strong>workflow package</strong></dt>
<dd>The complete, release-pinned code that you download and submit, as opposed to the excerpts shown on the site for teaching.</dd>
<dt id="teaching-excerpt"><strong>teaching excerpt</strong></dt>
<dd>An annotated fragment of the workflow package shown on a page for explanation; it is not a replacement for the runnable source.</dd>
<dt id="applicability-record"><strong>applicability record</strong></dt>
<dd>A published record of where the workflow was tested: environment, scheduler, runtime, result, assumptions, and portability boundaries.</dd>
<dt id="release-pinned"><strong>release-pinned</strong></dt>
<dd>Referring to an immutable tagged release of the repository (such as <code>v0.1.0</code>) rather than a moving branch, so the cited code cannot drift.</dd>
<dt id="demonstrator-vs-template"><strong>demonstrator vs. template</strong></dt>
<dd>The two purposes of the reference workflow package: it demonstrates that the pattern runs (producing the test record), and it is a template you edit for your own application.</dd>
</dl>

Continue with [the five-minute tour](/guide/tour/), [Scheduler as Orchestrator](/guide/scheduler-as-orchestrator/), the [Baseline Pattern](/guide/baseline-single-node-pattern/), or [Run the example](/start/).
