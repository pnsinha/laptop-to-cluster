# Representative-environment validation evidence

This directory intentionally contains **no representative Anvil or Expanse run bundle yet**. Module 2 and release v0.1.0 therefore remain `unvalidated`; deterministic fake-runtime tests cannot change that status.

## Record a real run

After running a tagged workflow on Purdue Anvil, copy and complete the applicable metadata template without adding secrets. If Anvil allocation is unavailable, use SDSC Expanse, set `fallback: true`, and record `primaryUnavailableReason`. Capture the scheduler terminal state and exit code from the center scheduler, not from a mock.

```sh
npm run record-run -- --metadata /secure/success.json --run-dir /secure/bssw-JOBID --scheduler-log /secure/slurm-JOBID.out --output-root evidence
npm run validate:evidence -- --bundle evidence/EVIDENCE_ID
```

Record both a successful run and a deliberately bounded readiness-timeout run. The timeout run must exit nonzero with `BSSW-READY-TIMEOUT`, record no worker-start event, and contain no success marker.

`record-run` creates a new directory only; it refuses to overwrite evidence. It redacts configured values plus common credential, allocation, hostname, user-qualified host, email, and user-path forms; copies scheduler/runtime logs and result artifacts; records ordered timestamped events, versions, assumptions, limitations, portability boundaries, review date, and reviewer; and writes `manifest.json`, `verification.json`, and `checksums.sha256`.

Before changing an applicability record to `validated`, review every redaction, commit the immutable bundle, set the record’s evidence path/integrity to its manifest, and run `npm run validate:evidence`. Validation rejects missing/tampered files, revision/image/environment mismatches, stale evidence, invalid primary/fallback semantics, incomplete success output, and invalid timeout ordering.
