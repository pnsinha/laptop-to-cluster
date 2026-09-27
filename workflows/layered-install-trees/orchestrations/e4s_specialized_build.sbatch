#!/bin/bash
#SBATCH --job-name=u_specialized
#SBATCH --partition=shared
#SBATCH --account=BSSW_SLURM_ACCOUNT
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=16
#SBATCH --mem=64G
#SBATCH --time=01:30:00
#SBATCH --output=${BSSW_SCRATCH_ROOT}/union-anvil/logs/specialized-%j.out

# Stage 2 — Build GPU specialized (Layer 2), reuses CPU provider via upstreams.
# cuda_arch=80 (A100). Canonical /tmp/e4s-specialized-amrex-sm80; persisted to GPFS.
set +e
echo "BSSW_VERSIONS slurm=$(scontrol --version 2>/dev/null | head -1)"
echo "BSSW_VERSIONS apptainer=$(apptainer --version 2>/dev/null || echo unavailable)"
echo "BSSW_VERSIONS charliecloud=$(ch-run --version 2>&1 | head -1 || echo unavailable)"
U=${BSSW_SCRATCH_ROOT}/union-anvil
SIF=${BSSW_SCRATCH_ROOT}/containers/e4s-cuda-26.06-cuda80.sif
ENV=$U/configuration/e4s-26.06/specialized-amrex-sm80
PROV_GPFS=$U/trees/e4s-provider-cpu
SPEC_GPFS=$U/trees/e4s-specialized-amrex-sm80

mkdir -p "$U/logs" "$U/stage"

echo "[SPECIALIZED START $(date -u)] host=$(hostname) SLURM_JOB_ID=$SLURM_JOB_ID"
# Bind: GPFS provider copy -> canonical /tmp/e4s-provider-cpu so upstream DB + RPATH resolve.
apptainer exec --bind ${BSSW_SCRATCH_ROOT} --bind "$PROV_GPFS":/tmp/e4s-provider-cpu "$SIF" bash -lc '
  set -e
  . "'"$U"'/spack-v1.2.1/share/spack/setup-env.sh"
  spack compiler find >/dev/null 2>&1 || true
  echo "=== upstream check: provider readable at /tmp/e4s-provider-cpu ==="
  ls /tmp/e4s-provider-cpu/.spack-db/index.json 2>&1
  echo "=== CONCRETIZE (specialized, upstreams -> provider) ==="
  spack -e "'"$ENV"'" concretize -f 2>&1 | tee ${BSSW_SCRATCH_ROOT}/union-anvil/logs/concretize-specialized.txt | tail -8
  echo "=== INSTALL (specialized) ==="
  spack -e "'"$ENV"'" install -v
  IR=$?
  echo "=== spack install exit=$IR ==="
  echo "=== footprint (inodes/size) ==="
  find /tmp/e4s-specialized-amrex-sm80 -type f | wc -l | xargs echo "files:"
  du -sh /tmp/e4s-specialized-amrex-sm80 2>/dev/null
  exit $IR
'
IR=$?
echo "[INSTALL rc=$IR $(date -u)]"

# Persist specialized tree to GPFS immediately on success.
if [ $IR -eq 0 ]; then
  echo "=== persist /tmp/e4s-specialized-amrex-sm80 -> $SPEC_GPFS ==="
  rm -rf "$SPEC_GPFS"
  apptainer exec --bind ${BSSW_SCRATCH_ROOT} --bind "$PROV_GPFS":/tmp/e4s-provider-cpu "$SIF" bash -lc '
    cp -a /tmp/e4s-specialized-amrex-sm80 "'"$SPEC_GPFS"'"
    echo "GPFS copy: $(du -sh '"$SPEC_GPFS"' | cut -f1), $(find '"$SPEC_GPFS"' -type f | wc -l) files"
  '
fi

# Non-fatal verify: amrex CUDA device code + cross-tree RPATH.
if [ $IR -eq 0 ]; then
  echo "=== VERIFY: amrex lib (CUDA build, RPATH -> both trees) ==="
  apptainer exec --bind ${BSSW_SCRATCH_ROOT} --bind "$PROV_GPFS":/tmp/e4s-provider-cpu "$SIF" bash -lc '
    BIN=$(find '"$SPEC_GPFS"' -name "libamrex_*.so" 2>/dev/null | head -1)
    echo "binary: $BIN"
    [ -n "$BIN" ] && readelf -d "$BIN" | grep -iE "runpath|rpath" || echo "(no libamrex .so found)"
  ' || echo "(verify non-fatal)"
fi

echo "[SPECIALIZED DONE $(date -u)] rc=$IR"
exit $IR
