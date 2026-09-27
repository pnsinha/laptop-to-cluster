# Layered install trees (provider + specialized)

This package builds a shared CPU "provider" Spack install tree once and a thin
per-GPU-architecture "specialized" tree on top of it via Spack upstream
chaining, then composes both trees at runtime under Apptainer or Charliecloud.
The provider installs at a canonical container-native path (`/tmp/e4s-provider-cpu`);
the specialized layer at `/tmp/e4s-specialized-amrex-sm80`; persisted copies are
re-bound at those same canonical paths at compose time so `DT_RPATH` entries
resolve across trees without `LD_LIBRARY_PATH`.

Passing fake-runtime tests is not representative-cluster validation. The only
representative evidence for this workflow is the Purdue Anvil run set recorded
in `PROVENANCE.md` (Slurm jobs 19747042, 19747874, 19806294, 19831461, 19831573,
20509657); it is Anvil-only.

## Security and site assumptions

- Submit from an authorized Slurm account: replace the `BSSW_SLURM_ACCOUNT` /
  `BSSW_SLURM_ACCOUNT_GPU` placeholders in the `#SBATCH --account=` lines (they
  do not expand; edit them or pass `--account` on the `sbatch` command line).
- Apptainer must be available on compute nodes; Charliecloud requires a
  user-installed prefix (`BSSW_CHARLIECLOUD_PREFIX`, Charliecloud 0.38 in the
  Anvil runs).
- GPU stages need a GPU partition/QOS and `--gres=gpu:1`; the compose job ran on
  an NVIDIA A100 (`sm_80`).
- `BSSW_SCRATCH_ROOT` must be private, writable scratch large enough for the
  provider tree (~3 GB) plus specialized trees (~257 MB each); the canonical
  trees persist to GPFS under `${BSSW_SCRATCH_ROOT}/union-anvil/trees/`.
- `BSSW_BUNDLED_LIBCUDA_DIR` and `BSSW_HOST_LIBCUDA` are site-specific driver
  library locations used only by the Charliecloud functional test.

## Pinned inputs

| Input | Version | Pin |
|---|---|---|
| Spack core | v1.2.1 | `2f80bed` |
| spack-packages | e4s-26.06.1 | `c9c7cdc5` |
| Base image | `e4s-cuda-26.06-cuda80.sif` | Ubuntu 24.04, gcc 13.3.0, cuda 12.9, mpich 4.3.2 |
| Target arch | `x86_64_v3` | generic x86-64 |
| Target GPU | NVIDIA A100 | `sm_80` |

The base image is expected under `${BSSW_SCRATCH_ROOT}/containers/` and the
Charliecloud squashfs under `${BSSW_SCRATCH_ROOT}/charliecloud-build/`; the
scripts assume a Spack v1.2.1 checkout at `${BSSW_SCRATCH_ROOT}/union-anvil/spack-v1.2.1`.

## Stages

1. `orchestrations/e4s_provider_build.sbatch` — concretize and install the CPU
   provider (`configuration/e4s-26.06/provider-cpu/spack.yaml`), persist the
   canonical `/tmp` tree to GPFS, verify `DT_RPATH`.
2. `orchestrations/e4s_specialized_build.sbatch` — concretize the GPU layer
   (`specialized-amrex-sm80/spack.yaml`) against the provider as an upstream;
   reused specs appear as `[^]` in the concretize log (19 of 20 buildable
   packages reused on Anvil; only `amrex` rebuilds). Persist to GPFS.
3. `orchestrations/e4s_gpu_compose.sbatch` — Apptainer compose: bind both trees
   at canonical paths with `--nv`, check cross-tree `ldd` resolution with
   `LD_LIBRARY_PATH` unset (zero `=> not found`), then compile and run the
   arch-adaptive `apps/gpu-check/cuda_smoke.cu` (`RESULT: PASS`,
   `mismatches=0`).
4. `orchestrations/ch_compose2.sbatch` — the same compose under `ch-run -w -t`
   with a minimal Ubuntu 24.04 rootfs. The container-external MPI
   (`libmpi.so.12`) is absent from the minimal rootfs and reports
   `=> not found`; that is expected, not a mechanism failure.
5. `orchestrations/ch_cuda_functional.sbatch` — Charliecloud GPU functional run
   (`ch-run -W -t` on the squashed image): `cuda_smoke` PASS under both the
   bundled and host-driver libcuda.
6. `orchestrations/r4_startup.sbatch` — startup-cost array job comparing bare,
   layered, and monolithic `apptainer exec` times (one cold sample per array
   task, ten warm repeats).

## Adapter variables

`BSSW_SCRATCH_ROOT`, `BSSW_SLURM_ACCOUNT`, `BSSW_SLURM_ACCOUNT_GPU`,
`BSSW_CHARLIECLOUD_PREFIX`, `BSSW_BUNDLED_LIBCUDA_DIR`, `BSSW_HOST_LIBCUDA`,
plus the `#SBATCH` partition/QOS/GRES/time lines per stage.

## Outputs

Each stage writes a `logs/<stage>-<jobid>.out` scheduler log under
`${BSSW_SCRATCH_ROOT}/union-anvil/logs/` (the specialized stage also tees
`concretize-specialized.txt`). The deliverable trees land under
`${BSSW_SCRATCH_ROOT}/union-anvil/trees/`. These logs are the gate artifacts the
`layered-install-trees` evidence profile recomputes; see `evidence/README.md`.

## What this package does not prove

The Anvil runs demonstrate the mechanism on one site, one base image, and one
GPU family. They do not measure a BLAS-provider swap, do not cover multi-node
execution, and file counts were collected with `find -type f` (apparent sizes;
GPFS block sizes are not part of the claim).
