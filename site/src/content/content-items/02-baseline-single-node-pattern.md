---
id: module-2-baseline
stable_slug: baseline-single-node-pattern
title: "Baseline Pattern: Single-Node Service + Workers"
description: "A bounded single-node reference workflow with one coordinating service and one or more workers in one scheduler allocation"
module_number: 2
topics: [scheduler-as-orchestrator, service-workers]
status: published
last_updated: "2026-07-26"
summary: "The smallest multi-service Compose shape translated to one scheduler allocation: a coordinator, readiness gate, workers, and result verification."
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
## Concepts
One allocation contains one coordinator and a bounded worker pool. The launcher creates job-scoped storage, starts the coordinator on loopback, waits for semantic readiness, starts workers only after readiness, waits for completion, and runs a result verifier. Process startup alone is not success.

### The orchestration skeleton
The runnable `baseline.sbatch` adds integrity checks (image and input SHA-256 verification), bounded cleanup, and machine-readable diagnostics. Stripped to just the Compose-to-HPC translation, the whole pattern is five steps:

```bash
# 1. Job-scoped storage        — replaces Compose's named volume
RUNTIME_DIR="$SCRATCH/bssw-$SLURM_JOB_ID"
mkdir -p "$RUNTIME_DIR"/{results,logs}

# 2. Coordinator               — the long-running service, on loopback
srun --exclusive apptainer exec --bind "$RUNTIME_DIR:/work" baseline.sif \
  python3 /opt/bssw/bin/coordinator.py --input /work/input.json &

# 3. Readiness gate            — the depends_on + healthcheck Compose has no scheduler equivalent for
until [ -s "$RUNTIME_DIR/endpoint.json" ]; do sleep 0.05; done
apptainer exec baseline.sif python3 /opt/bssw/bin/readiness.py --endpoint "$ENDPOINT"

# 4. Workers                   — only after readiness; each is an exclusive srun step
for w in $(seq 1 "$WORKER_COUNT"); do
  srun --exclusive apptainer exec baseline.sif \
    python3 /opt/bssw/bin/worker.py --endpoint "$ENDPOINT" --worker-id "$w" &
done
wait   # workers only — the coordinator runs forever, like a Compose service

# 5. Verify + success marker   — replaces "the container reported healthy"
apptainer exec baseline.sif python3 /opt/bssw/bin/verify.py --output /work/result.json
```

Each step maps directly onto a Compose construct it replaces: `named volume` → job-scoped scratch, `service` → background `apptainer exec`, `depends_on` + `healthcheck` → explicit readiness gate, `replicas` → `srun` worker steps, and the container's own health as the success signal → a result verifier that writes a success marker only after every invariant holds. The full script wraps these five steps in checksum verification, signal traps, and stable diagnostic codes; the shape above is what to carry in your head when adapting the pattern to your own stack.

## Procedure
1. Read the immutable workflow README and verify its recorded digest before using it. Do not substitute a branch link for the released reference.
2. Set local values for account/queue, wall time, CPU and memory requests, runtime module, image location and digest, writable scratch root, worker count, task count, and readiness timeout. Keep requested values within the documented workflow bounds.
3. Run the prerequisite checks above. If Slurm fails, use [BSSW-PREREQ-SLURM](/diagnostics/bssw-prereq-slurm/); if Apptainer fails, use [BSSW-PREREQ-APPTAINER](/diagnostics/bssw-prereq-apptainer/). You can still read every concept and adaptation section while execution is blocked.
4. Submit the release script with `sbatch workflows/baseline-slurm-apptainer/slurm/baseline.sbatch`. Record the submission ID without publishing account names, private hosts, or sensitive paths.
5. Wait for the terminal scheduler state, then run the release verifier against the job output. If readiness times out, use [BSSW-READINESS-TIMEOUT](/diagnostics/bssw-readiness-timeout/).

## Expected results
A successful bounded run has a terminal `COMPLETED` state, zero exit status, a machine-readable success result, the documented number of unique task results, and verifier output confirming every invariant. Worker-start events occur only after the readiness event. Any missing invariant is a failure even if the coordinator once became reachable.

## Known limitations
This procedure has been validated on Purdue Anvil (Slurm 25.11.1, Apptainer 1.4.3) for single-node execution with the v0.1.0 image; see the [Milestone 1 collection](/milestones/1/) for deliverable status and the evidence bundle under `evidence/anvil-v0-1-0-*` in the companion repository. It covers one node, loopback coordinator access, bounded inert inputs, and ephemeral job-scoped state. It does not establish multi-node networking, durable service operation, cross-center portability, performance scaling, or production support. A rebuilt image or a different scheduler/runtime version requires revalidation.

## Next steps
Use [Getting started](/start/) for assumptions and the Compose-to-HPC adaptation table. After a verified baseline, compare your center’s scheduler, network, storage, security, and runtime policies before changing the workflow.
