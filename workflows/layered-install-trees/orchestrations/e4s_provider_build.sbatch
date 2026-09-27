#!/bin/bash
#SBATCH --job-name=u_provider
#SBATCH --partition=shared
#SBATCH --account=BSSW_SLURM_ACCOUNT
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=16
#SBATCH --mem=64G
#SBATCH --time=02:00:00
#SBATCH --output=${BSSW_SCRATCH_ROOT}/union-anvil/logs/provider-%j.out

# Stage 1 — Build CPU provider (Layer 1), E4S-faithful representative subset.
# Canonical install path /tmp/e4s-provider-cpu -> persisted to GPFS for layers 2/3.
set +e
U=${BSSW_SCRATCH_ROOT}/union-anvil
SIF=${BSSW_SCRATCH_ROOT}/containers/e4s-cuda-26.06-cuda80.sif
ENV=$U/configuration/e4s-26.06/provider-cpu
TREE_GPFS=$U/trees/e4s-provider-cpu
CANON=/tmp/e4s-provider-cpu

mkdir -p "$U/logs" "$U/stage" "$U/mirror" "$U/misc-cache" "$U/trees"

echo "[PROVIDER START $(date -u)] host=$(hostname) SLURM_JOB_ID=$SLURM_JOB_ID"
apptainer exec --bind ${BSSW_SCRATCH_ROOT} "$SIF" bash -lc '
  . "'"$U"'/spack-v1.2.1/share/spack/setup-env.sh"
  spack compiler find >/dev/null 2>&1 || true
  echo "=== spack $(spack --version) ==="
  echo "=== CONCRETIZE (provider, unify=true) ==="
  spack -e "'"$ENV"'" concretize -f 2>&1 | tail -5
  echo "=== root specs concretized ==="
  spack -e "'"$ENV"'" find --roots 2>/dev/null | grep -iE "heffte|amrex|py-numpy" | head
  echo "=== INSTALL (provider) ==="
  spack -e "'"$ENV"'" install -v
  IR=$?
  echo "=== spack install exit=$IR ==="
  echo "=== installed roots ==="
  spack -e "'"$ENV"'" find --roots 2>/dev/null | grep -iE "heffte|amrex|py-numpy" | head
  echo "=== footprint (inodes/size) ==="
  find "'"$CANON"'" -type f | wc -l | xargs echo "files:"
  du -sh "'"$CANON"'" 2>/dev/null
  exit $IR
'
IR=$?
echo "[INSTALL rc=$IR $(date -u)]"

# Persist canonical tree to GPFS IMMEDIATELY on successful install
# (before verification, so the tree survives even if checks are noisy).
if [ $IR -eq 0 ]; then
  echo "=== persist /tmp/e4s-provider-cpu -> $TREE_GPFS ==="
  rm -rf "$TREE_GPFS"
  apptainer exec --bind ${BSSW_SCRATCH_ROOT} "$SIF" bash -lc '
    cp -a "'"$CANON"'" "'"$TREE_GPFS"'"
    echo "GPFS copy: $(du -sh '"$TREE_GPFS"' | cut -f1), $(find '"$TREE_GPFS"' -type f | wc -l) files"
  '
fi

# Non-fatal verification on the GPFS-persisted tree.
if [ $IR -eq 0 ]; then
  echo "=== VERIFY: RPATH is canonical /tmp path (amrex lib, has cross-tree deps) ==="
  apptainer exec --bind ${BSSW_SCRATCH_ROOT} "$SIF" bash -lc '
    BIN=$(find '"$TREE_GPFS"' -path "*amrex*" -name "libamrex_*.so" 2>/dev/null | head -1)
    echo "sample binary: $BIN"
    if [ -n "$BIN" ]; then
      echo "--- DT_RUNPATH/DT_RPATH (canonical /tmp paths) ---"
      readelf -d "$BIN" | grep -iE "runpath|rpath" || echo "(none on this lib)"
      echo "--- ldd (LD_LIBRARY_PATH unset): deps resolved from provider tree? ---"
      ldd "$BIN" | grep -iE "provider|not found" | head || true
    fi
  ' || echo "(verify non-fatal)"
fi

echo "[PROVIDER DONE $(date -u)] rc=$IR"
exit $IR
