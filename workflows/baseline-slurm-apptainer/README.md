# Single-node Slurm + Apptainer reference workflow

This bounded reference package runs one loopback coordinator and 1–16 workers as
exclusive Slurm steps in one node allocation. Inputs are inert JSON; no input value
is evaluated by a shell. A run succeeds only when `result.json` is atomically
created after schema, count, uniqueness, digest, and expected-output verification.
Passing fake-runtime tests is not representative-cluster validation.

## Security and site assumptions

- Submit from an authorized Slurm account and adapt the `#SBATCH` resource lines.
- Apptainer must be available on the compute node under center policy.
- Compute-node loopback connections and exclusive job steps must be permitted.
- Scratch must be private, writable, large enough for logs/results, and suitable for
  an Apptainer bind. The launcher uses mode `0700` job storage and `0600` files.
- The image and input are regular, non-symlink files with separately supplied
  SHA-256 records. Never use credentials, shell fragments, or sensitive data here.

## Acquire the container

The lock file records an immutable Python 3.12.10 slim-bookworm OCI manifest.
Review `container/image-lock.json`, then run:

```sh
workflows/baseline-slurm-apptainer/container/acquire.sh
```

The command builds from the digest-pinned OCI base into a temporary file, records
the resulting SIF SHA-256, and atomically installs `container/baseline.sif`. A SIF hash is intentionally not
predeclared because local Apptainer conversion can vary; the generated sidecar is
the immutable input to a submitted run. Alternatively build the checked-in
`container/Apptainer.def`, then create `baseline.sif.sha256` with your SHA-256 tool.
The pinned OCI record is documented at [Docker Hub](https://hub.docker.com/layers/library/python/3.12.10-slim-bookworm/images/sha256-90aa7f84f25a90382d75026a82010016d9ae811865bdda851ce48e5d14469b53).
Content from that source was rephrased for licensing compliance.

## Validate and submit

```sh
sha256sum -c workflows/baseline-slurm-apptainer/inputs/tasks.json.sha256
sbatch workflows/baseline-slurm-apptainer/slurm/baseline.sbatch
```

Defaults expect four tasks, two workers, a 30-second readiness deadline, and the
acquired image beside its checksum. The launcher records Slurm, Apptainer, image,
and input versions/digests in private job storage. Successful output is beneath
`${SLURM_TMPDIR}/bssw-${SLURM_JOB_ID}` when `SLURM_TMPDIR` exists, otherwise beneath
`${TMPDIR:-/tmp}/bssw-${SLURM_JOB_ID}`.

## Adapter variables and bounds

Set these through `sbatch --export` or a center-owned wrapper; do not edit input
JSON into shell syntax.

| Variable | Default | Constraint / adaptation |
|---|---|---|
| `WORKER_COUNT` | `2` | integer 1–16; ensure allocated CPUs are sufficient |
| `TASK_COUNT` | `4` | integer 1–256 and exactly equal to input task count |
| `READINESS_TIMEOUT` | `30` | integer 1–300 seconds, measured monotonically |
| `CLEANUP_TIMEOUT` | `10` | integer 1–60 seconds |
| `IMAGE_PATH` | `container/baseline.sif` | immutable regular SIF file |
| `IMAGE_SHA256_FILE` | `${IMAGE_PATH}.sha256` | SHA-256 sidecar from acquisition |
| `INPUT_PATH` | `inputs/tasks.json` | schema-version 1 inert JSON |
| `INPUT_SHA256_FILE` | input sidecar | trusted SHA-256 record |
| `EXPECTED_PATH` | `expected/results.json` | expected task outputs |
| `BSSW_SCRATCH_ROOT` | scheduler temp root | center-approved private scratch |
| `BSSW_APPTAINER_CMD` | `apptainer` | center module/wrapper command name |
| `BSSW_SRUN_CMD` | `srun` | center Slurm step command name |
| `BSSW_SLURM_VERSION_CMD` | `scontrol` | version-recording command name |
| `BSSW_SHA256_CMD` | `sha256sum` | command emitting digest then filename |

`BSSW_APP_ROOT` and `BSSW_KILL_CMD` are test/runtime packaging boundaries and
normally remain `/opt/bssw/bin` and `kill`.

## Output and diagnostics

`logs/` separates coordinator, readiness, each worker, verifier, input validation,
and machine-readable diagnostic output. `events.jsonl` proves readiness precedes
all worker-start events. `results.json` is intermediate and is not a success claim.
Only `result.json` with `status: "success"` is the success marker. Any failure or
cleanup problem removes it and returns nonzero.

Stable IDs are published in `diagnostics.json`: prerequisite failures use
`BSSW-PREQ-*`; digest mismatches use `BSSW-INTEGRITY-*`; readiness timeout uses
`BSSW-READY-TIMEOUT`; early coordinator and worker failures use
`BSSW-COORDINATOR-EXIT` and `BSSW-WORKER-EXIT`; verification uses `BSSW-VERIFY-*`;
and bounded cleanup uses `BSSW-CLEANUP-*`. Diagnostics contain no input payload,
account, host, token, or selected filesystem path.

## Local deterministic fixtures

```sh
bash tests/fixtures/baseline-fake-runtime/run-scenario.sh success
npx vitest run tests/unit/baseline-workflow.test.ts
```

The fixture covers success, invalid input, early coordinator exit, worker failure,
checksum mismatch, verification failure, cleanup failure, and readiness timeout
through fake scheduler, runtime, process, clock/timeout, and filesystem boundaries.
It does not execute Slurm or Apptainer and cannot support a validated-environment
claim.

## Representative-environment re-verification checklist

The fixtures above prove orchestration logic; they do **not** prove the image
builds or the job runs on a real cluster. Neither has happened yet. The findings
below were distilled from center documentation (not from observed failed jobs)
and are the things to confirm explicitly on the first Anvil (or Expanse fallback)
run, because they are properties of the site rather than of this code:

- [ ] **Job-scoped scratch.** Confirm whether the allocation exports
  `$SLURM_TMPDIR`. Anvil provides `$SCRATCH` but not `$SLURM_SCRATCH`; if
  `$SLURM_TMPDIR` is also absent, set `BSSW_SCRATCH_ROOT` explicitly to a
  private, job-scoped path. A silent fallback to `/tmp` on a shared node must
  not be accepted.
- [ ] **Single-image build.** `container/acquire.sh` runs `apptainer build`
  from `Apptainer.def`. Confirm it builds unprivileged (no `--fakeroot` needed,
  since `%post` installs nothing) and that the resulting `baseline.sif` loads
  and serves `/health` at `/opt/bssw/bin/coordinator.py`. This image model is
  unbuilt on real metal — only `apptainer build` + `sbatch` confirms it.
- [ ] **Loopback on shared partitions.** The coordinator binds `127.0.0.1` on
  an ephemeral port. Confirm compute-node loopback connections are permitted
  on the target partition (the SSH-tunnel access pattern the SOW describes).
- [ ] **`sha256sum` availability.** `BSSW_SHA256_CMD` defaults to `sha256sum`;
  confirm it is on `PATH` on the compute node or override the variable.
- [ ] **Exclusive step launch.** `srun --exclusive --ntasks=1` per step; confirm
  the center permits exclusive single-task steps within the allocation.

When the first successful run completes, record it as an applicability record
(`evidence/`) and flip the published validation status from `unvalidated`. Until
then, the applicability record correctly reads `NOT RUN`.
