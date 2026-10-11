# Layered install trees (provider + specialized)

This package builds a shared CPU “provider” Spack install tree once and a thin
per-GPU-architecture “specialized” tree on top of it via Spack upstream
chaining, then composes both trees at runtime under Apptainer. A Charliecloud
variant is included; its recorded compose run does not pass its own gate (see
stage 4). The provider installs at a canonical container-native path
(`/tmp/e4s-provider-cpu`); the specialized layer at `/tmp/e4s-specialized-amrex-sm80`;
persisted copies are re-bound at those same canonical paths at compose time, so
under Apptainer the `DT_RPATH` entries resolve within the provider tree or the
base image without `LD_LIBRARY_PATH` (see stage 3).
The recorded `ldd` probes ran on the provider's own heFFTe library
(`libheffte.so`), and the AMReX specialized layer ships only static archives,
so these runs do not show a shared library in one tree resolving against the
other. A heFFTe specialized layer is the only runtime cross-tree case, and this
package does not build it (see stage 6).

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
  provider tree (~3 GB) plus specialized trees (about 400 MB apparent size
  each; the AMReX layer logged 399 MB in 2,603 files); the canonical trees
  persist to GPFS under `${BSSW_SCRATCH_ROOT}/union-anvil/trees/`.
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

## Before you submit

Every script reads `$U/configuration` and `$U/apps` with
`U=${BSSW_SCRATCH_ROOT}/union-anvil`, so stage this directory there and submit
from it:

```bash
mkdir -p "${BSSW_SCRATCH_ROOT}/union-anvil"
cp -r configuration apps orchestrations "${BSSW_SCRATCH_ROOT}/union-anvil/"
cd "${BSSW_SCRATCH_ROOT}/union-anvil"
mkdir -p logs
sbatch orchestrations/e4s_provider_build.sbatch
```

Slurm does not expand environment variables in `#SBATCH` lines, so each
script's `#SBATCH --output=logs/...` path is relative to the directory you
submit from, and `logs/` must exist before you submit. To write logs elsewhere,
pass `--output` on the command line, for example
`sbatch --output="$BSSW_SCRATCH_ROOT/union-anvil/logs/provider-%j.out" orchestrations/e4s_provider_build.sbatch`.

## Stages

1. `orchestrations/e4s_provider_build.sbatch` — concretize and install the CPU
   provider (`configuration/e4s-26.06/provider-cpu/spack.yaml`), persist the
   canonical `/tmp` tree to GPFS, verify `DT_RPATH`.
2. `orchestrations/e4s_specialized_build.sbatch` — concretize the GPU layer
   (`specialized-amrex-sm80/spack.yaml`) against the provider as an upstream;
   reused specs appear as `[^]` in the concretize log (19 of 20 buildable
   packages reused on Anvil; only `amrex` rebuilds). Most of that reuse is of
   build tools: 18 of the 19 reused packages are build-only dependencies of
   AMReX, so the count overstates what is shared at run time. Persist to GPFS.
3. `orchestrations/e4s_gpu_compose.sbatch` — Apptainer compose: bind both trees
   at canonical paths with `--nv`, check `ldd` resolution of the provider's
   heFFTe library with `LD_LIBRARY_PATH` unset (zero `=> not found`; its
   dependencies resolve within the provider tree or the base image), then
   compile and run the arch-adaptive `apps/gpu-check/cuda_smoke.cu`
   (`RESULT: PASS`, `mismatches=0`).
4. `orchestrations/ch_compose2.sbatch` — the same compose under `ch-run -w -t`
   with a minimal Ubuntu 24.04 rootfs. The container-external MPI
   (`libmpi.so.12`) is absent from the minimal rootfs and reports
   `=> not found`, and the recorded run (job 19831461) printed
   `GATE: FAIL (1 unresolved deps)`. The stage does not pass its own gate.
5. `orchestrations/ch_cuda_functional.sbatch` — Charliecloud GPU functional run
   (`ch-run -W -t` on the squashed image): `cuda_smoke` PASS under both the
   bundled and host-driver libcuda. The script exports `LD_LIBRARY_PATH` to
   supply libcuda, and the smoke binary uses no code from either tree, so this
   stage shows that a GPU program runs under Charliecloud with the trees bound;
   it does not test tree composition.
6. `orchestrations/r4_startup.sbatch` — startup-cost array job comparing bare,
   layered, and monolithic `apptainer exec` times (one cold sample per array
   task, ten warm repeats). The recorded comparison is confounded and is
   pending a re-run. The script also needs the `e4s-specialized-heffte-sm80`
   and `e4s-monolithic-amrex-sm80` trees, which this package neither imports
   nor builds (see `PROVENANCE.md`), so this stage is not reproducible from
   this package.

## Adapter variables

`BSSW_SCRATCH_ROOT`, `BSSW_SLURM_ACCOUNT`, `BSSW_SLURM_ACCOUNT_GPU`,
`BSSW_CHARLIECLOUD_PREFIX`, `BSSW_BUNDLED_LIBCUDA_DIR`, `BSSW_HOST_LIBCUDA`,
plus the `#SBATCH` partition/QOS/GRES/time lines per stage.

## Outputs

Each stage writes a `logs/<stage>-<jobid>.out` scheduler log under the
directory you submit from, which is `${BSSW_SCRATCH_ROOT}/union-anvil/logs/`
when you follow "Before you submit" (the specialized stage also tees
`concretize-specialized.txt`). The deliverable trees land under
`${BSSW_SCRATCH_ROOT}/union-anvil/trees/`. These logs are the gate artifacts the
`layered-install-trees` evidence profile recomputes; see `evidence/README.md`.

## What this package does not prove

The Anvil runs demonstrate the mechanism on one site, one base image, and one
GPU family. They do not show a shared library resolving across the two trees,
do not measure a BLAS-provider swap, do not cover multi-node execution, and
file counts were collected with `find -type f` (apparent sizes; GPFS block
sizes are not part of the claim).

## Acknowledgment

This work was supported by the Better Scientific Software Fellowship Program, a collaborative effort of the U.S. Department of Energy (DOE), Office of Advanced Scientific Research via ANL under Contract DE-AC02-06CH11357 and the National Nuclear Security Administration Advanced Simulation and Computing Program via LLNL under Contract DE-AC52-07NA27344; and by the National Science Foundation (NSF) via SHI under Grant No. 2435328.

Any opinions, findings, and conclusions or recommendations expressed in this material are those of the author(s) and do not necessarily reflect the views of the DOE or NSF.
