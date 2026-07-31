# Representative-environment validation evidence

This directory contains the representative Purdue Anvil run bundles that back release v0.1.0:

- `anvil-v0-1-0-success-20260725/` — the successful baseline run (submission 19500029, terminal state COMPLETED, exit 0) that supports `applicability/m1-baseline-anvil.yml` at `status: validated`.
- `anvil-v0-1-0-readiness-timeout-20260725/` — the deliberate negative case: a bounded readiness timeout that exits nonzero with `BSSW-READY-TIMEOUT`, records no worker-start event, and contains no success marker.

Module 2 and release v0.1.0 are therefore `validated` against this representative environment. Deterministic fake-runtime tests remain distinct from these bundles and do not by themselves establish that status.

## Record an additional run

Use this procedure to add a new bundle — a later release, a new center, or a re-validation. After running a tagged workflow on Purdue Anvil, copy and complete the applicable metadata template without adding secrets. If Anvil allocation is unavailable, use SDSC Expanse, set `fallback: true`, and record `primaryUnavailableReason`. Capture the scheduler terminal state and exit code from the center scheduler, not from a mock.

```sh
npm run record-run -- --metadata /secure/success.json --run-dir /secure/bssw-JOBID --scheduler-log /secure/slurm-JOBID.out --output-root evidence
npm run validate:evidence -- --bundle evidence/EVIDENCE_ID
```

Each validated release pairs a successful run with a deliberately bounded readiness-timeout run, as the v0.1.0 bundles above do. The timeout run must exit nonzero with `BSSW-READY-TIMEOUT`, record no worker-start event, and contain no success marker.

`record-run` creates a new directory only; it refuses to overwrite evidence. It redacts configured values plus common credential, allocation, hostname, user-qualified host, email, and user-path forms; copies scheduler/runtime logs and result artifacts; records ordered timestamped events, versions, assumptions, limitations, portability boundaries, review date, and reviewer; and writes `manifest.json`, `verification.json`, and `checksums.sha256`.

Before changing an applicability record to `validated`, review every redaction, commit the immutable bundle, set the record’s evidence path/integrity to its manifest, and run `npm run validate:evidence`. Validation rejects missing/tampered files, revision/image/environment mismatches, stale evidence, invalid primary/fallback semantics, incomplete success output, and invalid timeout ordering.
