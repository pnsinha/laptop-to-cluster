# Baseline single-node reference workflow (Slurm + Apptainer)

The runnable half of *Module 2: Baseline Pattern — Single-Node Service + Workers*.
It takes the simplest multi-service Compose shape — one coordinating service, a
producer, and N workers — and runs it inside a single-node Slurm allocation
through Apptainer, treating the scheduler as the orchestrator.

The service code is pure Python standard library (`argparse`, `json`, `os`,
`time`, `random`, `glob`, `http.server`). There is no `requirements.txt` and
nothing to `pip install`.

> **Validation status: unvalidated on a representative environment.** The
> orchestration logic has been exercised against a runtime shim; nothing here
> constitutes a completed run on Anvil or Expanse until an evidence bundle is
> recorded under `evidence/`. See the project site's applicability record for
> the authoritative status.

## Layout

```
baseline-slurm-apptainer/
├── bin/                         # application + orchestration code
│   ├── app.py                   # HTTP dashboard (coordinating service)
│   ├── producer.py              # one-shot task generator
│   ├── worker.py                # file-based queue worker
│   ├── orchestrate.sh           # the HPC analogue of `docker compose up`
│   └── readiness.sh             # depends_on/healthcheck primitives
├── slurm/
│   └── baseline.sbatch          # single-node batch job
├── container/
│   ├── worker.def               # Apptainer definition (worker image)
│   ├── dashboard.def            # Apptainer definition (dashboard image)
│   ├── build_images.sh          # build the .sif images
│   └── docker-compose.yml       # the "before" Compose version (reference)
├── inputs/                      # sample task files (document the task contract)
├── expected/                    # sample result files (document the result schema)
└── tests/
```

`docker-compose.yml` is the *before* side of the translation; read it next to
`bin/orchestrate.sh` to see each Compose construct and its scheduler-side
equivalent.

## What it does

`orchestrate.sh` runs, in order, all inside one allocation:

1. **Dashboard** (`app.py`) — the coordinating service, bound to loopback.
2. **Readiness gate** — `wait_for_port` blocks until the dashboard answers.
   No later step starts before it succeeds.
3. **Producer** (`producer.py`) — writes N task files into job-scoped scratch.
4. **Workers** (`worker.py`) — N copies claim tasks from the queue by atomic
   rename, process them, and write results.
5. **Wait** on the worker PIDs only (the dashboard never exits; a bare `wait`
   would hang the job to walltime).
6. **Verify** — result count equals task count, queue drained, no stuck tasks.
7. **Success marker** — `SUCCESS.json` written only after all invariants pass.

State lives in job-scoped scratch (`$SLURM_SCRATCH`, or `$SCRATCH` keyed by
`$SLURM_JOB_ID` where the scheduler provides no job scratch — a real portability
boundary on Anvil), bound into each container at `/data`.

## Prerequisites

- A Slurm allocation on a single node.
- Apptainer on `PATH` (`module load apptainer` on centers that require it).
- Job-scoped scratch available (see the `BSSW-W003` diagnostic).

## Getting started

### 1. Build the images

```bash
# from this directory
bash container/build_images.sh
```

This writes `worker.sif` and `dashboard.sif` to `$C2H_IMAGE_DIR` (default
`$SCRATCH/c2hpc-images`) and records their SHA-256 digests. The definitions
install no packages, so the build is unprivileged on most sites.

### 2. Submit the job

Account and partition are **not** in the script — they differ at every center:

```bash
# Purdue Anvil (worked example)
sbatch -A <account> -p shared slurm/baseline.sbatch
```

Override the task and worker counts from the command line via environment, or
the defaults (`C2H_TASKS=20`, `C2H_WORKERS=4`):

```bash
C2H_TASKS=50 C2H_WORKERS=8 sbatch -A <account> -p shared slurm/baseline.sbatch
```

### 3. Check the result

```bash
# job status
squeue -j <jobid>          # should reach COMPLETED, not TIMEOUT

# success marker and logs (path printed at the end of the job output)
cat $SCRATCH/c2hpc-jobs/<jobid>/SUCCESS.json
ls $SCRATCH/c2hpc-jobs/<jobid>/logs/
```

A successful run ends with a `SUCCESS.json` containing `"status": "success"`.
A failed run exits nonzero with a `BSSW-W*` diagnostic code and no success marker.

## Adapter variables

These are the values that vary by center or by run; override them in the
environment rather than editing scripts:

| Variable | Default | Meaning |
|---|---|---|
| `C2H_WORKERS` | `4` | worker count |
| `C2H_TASKS` | `20` | task count |
| `C2H_IMAGE_DIR` | `$SCRATCH/c2hpc-images` | `.sif` location |
| `C2H_RUNTIME` | `apptainer` | runtime binary |
| `C2H_BIND_HOST` | `127.0.0.1` | dashboard bind address |
| `C2H_PORT` | derived from job ID | dashboard port |
| `C2H_PROBE_PORT` | `= C2H_PORT` | port the readiness gate polls |
| `C2H_READY_TIMEOUT` | `60` | readiness timeout (seconds) |

## Producing the negative-evidence run

Set `C2H_PROBE_PORT` to an unused port so the readiness gate times out. The job
must exit nonzero with `BSSW-W001`, write no success marker, and start no workers:

```bash
C2H_PROBE_PORT=9999 sbatch -A <account> -p shared slurm/baseline.sbatch
```

## Diagnostic codes

| Code | Condition |
|---|---|
| `BSSW-W001` | Coordinating service not ready within timeout |
| `BSSW-W002` | Result count mismatch or undrained queue |
| `BSSW-W003` | No job-scoped storage available |
| `BSSW-W004` | Container runtime not on `PATH` |
| `BSSW-W005` | Required `.sif` image missing |
| `BSSW-W006` | Invalid worker or task count |
| `BSSW-W007` | Producer failed |
| `BSSW-W008` | A worker exited nonzero |

## Portability boundaries

These are the conditions under which the workflow needs site-specific adaptation:

- **Job-scoped scratch.** Not every scheduler exports `$SLURM_SCRATCH`; Anvil
  provides `$SCRATCH` only. The path is derived and its source recorded in the
  success marker.
- **Shared compute nodes.** A fixed dashboard port collides with other users'
  jobs on a shared partition, so the port is derived from the job ID and bound
  to loopback (reached over an SSH tunnel, per the SOW).
- **`nc` availability.** The readiness probe falls back to bash `/dev/tcp` where
  `nc` is absent.
- **Account and partition.** Deliberately left off the `#SBATCH` directives.
