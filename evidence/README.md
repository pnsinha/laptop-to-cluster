# Representative-environment validation evidence

This directory contains the representative Purdue Anvil run bundles behind the test records, in two pairs. Each pair is a successful run and a deliberate negative run.

**October 2026 (current evidence for Module 2).** These back the record `applicability/m2-baseline-anvil-2026-10.yml` (Slurm 26.05.4, Apptainer 1.5.3, the same image digest as July):

- `anvil-baseline-20261007-success/` — the successful baseline run.
- `anvil-baseline-20261007-readiness-timeout/` — the deliberate negative case.

**July 2026 (release v0.1.0).** These back the earlier record `applicability/m1-baseline-anvil.yml`, which the October record supersedes:

- `anvil-v0-1-0-success-20260725/` — the successful baseline run (submission 19500029, terminal state COMPLETED, exit 0) that supports `applicability/m1-baseline-anvil.yml` at `status: validated`.
- `anvil-v0-1-0-readiness-timeout-20260725/` — the deliberate negative case: a bounded readiness timeout that exits nonzero with `BSSW-READY-TIMEOUT`, records no worker-start event, and contains no success marker.

Module 2 is `validated` against this representative environment, as recorded in the current record. Deterministic fake-runtime tests remain distinct from these bundles and do not by themselves establish that status.

## Record an additional run

Use this procedure to add a new bundle — a later release, a new center, or a re-validation. After running a tagged workflow on Purdue Anvil, copy and complete the applicable metadata template without adding secrets. If Anvil allocation is unavailable, use SDSC Expanse, set `fallback: true`, and record `primaryUnavailableReason`. Capture the scheduler terminal state and exit code from the center scheduler, not from a mock.

```sh
npm run record-run -- --metadata /secure/success.json --run-dir /secure/bssw-JOBID --scheduler-log /secure/slurm-JOBID.out --output-root evidence
npm run validate:evidence -- --bundle evidence/EVIDENCE_ID
```

Each validated release pairs a successful run with a deliberately bounded readiness-timeout run, as the v0.1.0 bundles above do. The timeout run must exit nonzero with `BSSW-READY-TIMEOUT`, record no worker-start event, and contain no success marker.

`record-run` creates a new directory only; it refuses to overwrite evidence. It redacts configured values plus common credential, allocation, hostname, user-qualified host, email, and user-path forms; copies scheduler/runtime logs and result artifacts; records ordered timestamped events, versions, assumptions, limitations, portability boundaries, review date, and reviewer; and writes `manifest.json`, `verification.json`, and `checksums.sha256`.

Before changing an applicability record to `validated`, review every redaction, commit the immutable bundle, set the record’s evidence path/integrity to its manifest, and run `npm run validate:evidence`. Validation rejects missing/tampered files, revision/image/environment mismatches, stale evidence, invalid primary/fallback semantics, incomplete success output, and invalid timeout ordering.

## Layered install trees profile

Bundles whose manifest declares `profile: "layered-install-trees"` record the
multi-job Module 5 pipeline rather than a single service-plus-workers run. The
profile supports `success` evidence only. `run.submissionId` is the primary job
(the Apptainer GPU compose); `run.submissions` lists every contributing Slurm
job with role (`provider-build`, `specialized-build`, `apptainer-compose-gpu`,
`charliecloud-compose`, `charliecloud-gpu`, `startup-cost`), and each
submission's scheduler log lands at `scheduler/<role>-<jobId>.log`. Events are
derived from submissions (`provider-built < specialized-built < composed <=
gpu-verified`, `runtime-replicated` after `composed`), using `endedAt` or the
scheduler-log mtime.

`gates` (minimum four) name the machine check, the job that produced the
artifact, and the bundle-relative artifact path. Validation recomputes every
gate from the bundled file — the declared `passed` flag is never trusted:

- `spack-reuse`: counts `[^]` (reused) and ` -   ` (built locally) lines in the
  specialized concretize log and compares them to `expected`.
- `no-unresolved-symbols`: fails on any `=> not found` line in the Apptainer
  GPU compose log.
- `gpu-checksum`: requires `mismatches=0` and `RESULT: PASS` in that log.
- `runtime-replication`: requires `RESULT: PASS` in the Charliecloud GPU log;
  `=> not found` lines in the Charliecloud compose log (`artifactSecondary`)
  must all be named in `allowedUnresolved`.

Recording uses the same command with `templates/layered-install-trees-metadata.example.json`:

```sh
npm run record-run -- --metadata /secure/layered.json --run-dir /secure/any --scheduler-log /secure/gpu-compose-JOBID.out --output-root evidence
```

The profile's scheduler and runtime version strings must come from the
`BSSW_VERSIONS` lines the rerun orchestration prints into the primary scheduler
log. Applicability records for layered runs must also declare
`secondary_runtime` (the second container runtime), which is compared to the
manifest's `run.secondaryRuntimeVersion`.

## Acknowledgment

This work was supported by the Better Scientific Software Fellowship Program, a collaborative effort of the U.S. Department of Energy (DOE), Office of Advanced Scientific Research via ANL under Contract DE-AC02-06CH11357 and the National Nuclear Security Administration Advanced Simulation and Computing Program via LLNL under Contract DE-AC52-07NA27344; and by the National Science Foundation (NSF) via SHI under Grant No. 2435328.

Any opinions, findings, and conclusions or recommendations expressed in this material are those of the author(s) and do not necessarily reflect the views of the DOE or NSF.
