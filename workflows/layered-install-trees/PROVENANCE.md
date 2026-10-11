# Provenance — layered-install-trees

Imported 2026-09-26 from the Anvil working directory
`revised_union_of_containers/union-anvil/` (see `STATUS.md` and
`REVISION-RUNS.md` there). Copies below are redacted: Slurm accounts and the
user scratch root were replaced by `BSSW_*` variables, and each script's
`#SBATCH --output=` path was changed to a literal relative `logs/...` path
because Slurm does not expand variables in `#SBATCH` lines.

Later edits: version-capture lines (`BSSW_VERSIONS`, 2026-09-27) were added to
each sbatch script, and two comments were corrected (the reuse figure and the
rootfs size). All jobs listed below ran the scripts as they were before these
edits. The working directory and its `STATUS.md` and `REVISION-RUNS.md` are not
published in this repository.

| Imported file | Source path | Slurm jobs that used it |
|---|---|---|
| `configuration/e4s-26.06/provider-cpu/spack.yaml` | `configuration/e4s-26.06/provider-cpu/spack.yaml` | 19747042 (provider build) |
| `configuration/e4s-26.06/specialized-amrex-sm80/spack.yaml` | `configuration/e4s-26.06/specialized-amrex-sm80/spack.yaml` | 19747874 (specialized build) |
| `configuration/e4s-26.06/specialized-amrex-sm80/upstreams.yaml` | `configuration/e4s-26.06/specialized-amrex-sm80/upstreams.yaml` | 19747874 (kept for reference; the active upstream block is inline in `spack.yaml`) |
| `configuration/e4s-26.06/_container_packages.yaml` | `configuration/e4s-26.06/_container_packages.yaml` | 19747042, 19747874 (base-image package pins) |
| `orchestrations/e4s_provider_build.sbatch` | `orchestrations/e4s_provider_build.sbatch` | 19747042 |
| `orchestrations/e4s_specialized_build.sbatch` | `orchestrations/e4s_specialized_build.sbatch` | 19747874 |
| `orchestrations/e4s_gpu_compose.sbatch` | `orchestrations/e4s_gpu_compose.sbatch` | 19806294 (Apptainer compose + GPU smoke, A100 sm_80) |
| `orchestrations/ch_compose2.sbatch` | `orchestrations/ch_compose2.sbatch` | 19831461 (Charliecloud compose) |
| `orchestrations/ch_cuda_functional.sbatch` | `orchestrations/ch_cuda_functional.sbatch` | 19831573 (Charliecloud GPU functional) |
| `orchestrations/r4_startup.sbatch` | `orchestrations/r4_startup.sbatch` | 20509657 (startup-cost array) |
| `apps/gpu-check/cuda_smoke.cu` | `apps/gpu-check/cuda_smoke.cu` | 19806294, 19831573 |
| `apps/gpu-check/cuda_handshake.cu` | `apps/gpu-check/cuda_handshake.cu` | imported for completeness; not part of the gate set |

Not imported: `monolithic-*` and `sm_70`/`sm_90`/`heffte` specialized variants
(comparison points, not the pipeline), `ch_compose.sbatch` /
`ch_handshake.sbatch` (superseded by `ch_compose2`), `m6_squashfuse` and the
`r5*`/`r6*` debugging orchestrations, `a.out`/`Backtrace.*` (binaries/crash
dumps).
