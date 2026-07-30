---
id: module-2-baseline
stable_slug: baseline-single-node-pattern
title: "Baseline Pattern: Single-Node Service + Workers"
description: "A bounded single-node reference workflow with one coordinating service and one or more workers in one scheduler allocation"
module_number: 2
topics: [scheduler-as-orchestrator, service-workers]
status: published
last_updated: "2026-07-26"
summary: "Run the smallest service-and-workers pattern inside one allocation, with readiness before workers and verification before success."
artifact_type: learning-module
keywords: [Apptainer, readiness, single-node, Slurm, workers]
audiences: [HPC learners, scientific software practitioners]
milestone: 1
publication_date: "2026-07-31"
applicable_release: v0.1.0
module_type: runnable
learning_outcomes: ["Explain the coordinator-readiness-worker sequence", "Prepare local-center values before submission", "Verify success from result artifacts rather than process startup alone"]
prerequisites:
  - { id: BSSW-PREREQ-SLURM, check: "Run command -v sbatch and confirm an allocation/account is available", diagnostic_id: BSSW-PREREQ-SLURM }
  - { id: BSSW-PREREQ-APPTAINER, check: "Run command -v apptainer and record apptainer --version", diagnostic_id: BSSW-PREREQ-APPTAINER }
section_kinds: [concept, procedure, expected-result, limitations, next-steps]
required_resources: ["One Slurm compute node", "Apptainer available on compute nodes", "A center-approved writable job-scoped directory", "The immutable v0.1.0 workflow bundle"]
estimated_minutes: 30
completion_check: { kind: result, text: "Complete only when the job exits zero and the verifier reports the documented task count, unique results, and a success result artifact." }
validation_status: validated
validation_date: "2026-07-25"
applicability_records: [m1-baseline-anvil]
schedulers: [slurm]
container_runtimes: [apptainer]
related: [module-1-scheduler-orchestrator, start-guide]
learning_stage: baseline
supporting_artifacts:
  - { repository: "https://github.com/pnsinha/laptop-to-cluster", release: v0.1.0, path: workflows/baseline-slurm-apptainer/README.md, integrity: "sha256:f7586054384c3d0f6d1632da0da33d987fadb73652d9cd11890ae5b0ccec0b7c" }
authority:
  - { kind: sow, citation: "Fellowship SOW, Milestone 1", scope: "Publish a baseline Slurm and Apptainer service-plus-workers pattern." }
  - { kind: project-decision, citation: "Milestone 1 validation boundary", scope: "Limit the baseline to one node and require result-based verification." }
unvalidated_scopes: []
sow_deliverable_id: M1-MODULE-2
deliverable_status: complete
completion_evidence: { id: m1-module-2-publication, path: evidence/README.md, integrity: "sha256:2fb0fd2e84a083ee33564797f69e63d40fc225987ebe94ea41832995713aca6a" }
---
## How the baseline works

One allocation contains one coordinator and a bounded worker pool. The launcher prepares private runtime storage, binds the coordinator to loopback, waits for semantic readiness, starts workers, and verifies outputs. A running process is not yet a successful result.

### Five-step flow

1. **Storage:** create private state and output directories for the allocation.
2. **Coordinator:** start one service on loopback.
3. **Readiness:** require a bounded semantic response before continuing.
4. **Workers:** start exclusive worker steps only after readiness.
5. **Verification:** confirm result count, uniqueness, schema, and worker completion before recording success.

```bash
RUNTIME_DIR="$SCRATCH/bssw-$SLURM_JOB_ID"
mkdir -p "$RUNTIME_DIR"/{results,logs}
start_coordinator_on_loopback
wait_for_bounded_readiness
start_exclusive_workers
verify_results_before_success
```

## Safety before execution

**Warning:** Use only center-approved allocations, storage, network paths, runtime modules, and image digests. Do not expose the coordinator publicly, use privileged containers, fall back silently to shared writable storage, or publish sensitive scheduler data.

## Procedure

1. Open the workflow instructions from the repository link below.
2. Set an approved account and partition, wall time, CPU and memory, runtime module, image path and digest, scratch root, worker count, task count, and readiness timeout.
3. Run the prerequisite commands listed above.
4. Submit the baseline script. Keep account names, private hosts, and sensitive paths out of logs.
5. Wait for the scheduler to finish, then run the workflow verifier.

## Expected result

A successful run exits zero, writes a machine-readable success result, contains the expected number of unique task results, and reports that every invariant passed. Worker-start events occur only after readiness.

## Diagnose a failure

- A rejected or unavailable scheduler command: [BSSW-PREREQ-SLURM](/diagnostics/bssw-prereq-slurm/)
- A missing container runtime: [BSSW-PREREQ-APPTAINER](/diagnostics/bssw-prereq-apptainer/)
- An unusable runtime directory or bind: [BSSW-STORAGE-UNAVAILABLE](/diagnostics/bssw-storage-unavailable/)
- A coordinator readiness timeout: [BSSW-READINESS-TIMEOUT](/diagnostics/bssw-readiness-timeout/)

## Safety and scope limitations

The baseline covers one node, loopback communication, bounded inert inputs, and ephemeral allocation-scoped state. It does not establish multi-node networking, durable service operation, cross-center portability, performance scaling, or production support.

## Next step

[Record your local values](/start/), then compare scheduler, network, storage, security, and runtime policy before adapting the workflow.
