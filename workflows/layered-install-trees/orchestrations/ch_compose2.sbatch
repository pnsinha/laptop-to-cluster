#!/bin/bash
#SBATCH --job-name=ch_compose2
#SBATCH --partition=shared
#SBATCH --account=BSSW_SLURM_ACCOUNT
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16G
#SBATCH --time=00:30:00
#SBATCH --output=${BSSW_SCRATCH_ROOT}/union-anvil/logs/ch-compose2-%j.out

# Charliecloud Phase 1: compose both layers + verify cross-tree RPATH under ch-run.
# Uses minimal Ubuntu 24.04 rootfs (same glibc 2.39 as E4S image, ~80 MB not 32 GB).
set +e
export PATH=${BSSW_CHARLIECLOUD_PREFIX}/bin:$PATH
U=${BSSW_SCRATCH_ROOT}/union-anvil
P=$U/trees/e4s-provider-cpu
S=$U/trees/e4s-specialized-amrex-sm80
IMG=$U/charliecloud/ubuntu24.04-dir

mkdir -p "$U/charliecloud"

echo "[CH COMPOSE START $(date -u)] host=$(hostname) ch-run=$(ch-run --version)"

echo
echo "########## Phase 0: minimal Ubuntu 24.04 rootfs (docker pull -> sandbox) ##########"
if [ -x "$IMG/bin/bash" ]; then
  echo "rootfs exists: $IMG"
else
  echo "pulling ubuntu:24.04 sandbox..."
  apptainer build --sandbox "$IMG" docker://ubuntu:24.04 2>&1 | tail -8
  echo "rootfs: $(du -sh "$IMG" 2>/dev/null | cut -f1), $(find "$IMG" -type f 2>/dev/null | wc -l) files"
fi

echo
echo "=== rootfs sanity (ch-run can enter) ==="
ch-run "$IMG" -- /bin/bash -c 'echo "  inside: $(cat /etc/os-release | head -1)"; echo "  glibc: $(ldd --version | head -1)"' 2>&1 | head -5

echo
echo "########## Phase 1: compose both layers + verify cross-tree RPATH ##########"
# Pre-create mount points inside the rootfs (ch-run can't mkdir under its /tmp bind-mount)
mkdir -p "$IMG/tmp/e4s-provider-cpu" "$IMG/tmp/e4s-specialized-amrex-sm80"

ch-run -w -t "$IMG" \
  --bind="$P":/tmp/e4s-provider-cpu \
  --bind="$S":/tmp/e4s-specialized-amrex-sm80 \
  -- /bin/bash -c '
    unset LD_PRELOAD
    set +e
    echo "--- (a) both layers visible at canonical paths ---"
    echo "provider:    $(ls /tmp/e4s-provider-cpu/linux-x86_64_v3/ 2>/dev/null | wc -l) package dirs"
    echo "specialized: $(ls /tmp/e4s-specialized-amrex-sm80/linux-x86_64_v3/ 2>/dev/null | wc -l) package dirs"
    ls -d /tmp/e4s-provider-cpu/linux-x86_64_v3/heffte-* 2>&1 | head -1
    ls -d /tmp/e4s-specialized-amrex-sm80/linux-x86_64_v3/amrex-* 2>&1 | head -1

    echo
    echo "--- (b) cross-tree DT_RPATH (readelf) ---"
    BIN=/tmp/e4s-provider-cpu/linux-x86_64_v3/heffte-2.4.1-ksq3blx/lib/libheffte.so
    echo "binary: $BIN"
    readelf -d "$BIN" 2>/dev/null | grep -iE "0x000000000000000f|RPATH|RUNPATH"

    echo
    echo "--- (c) ldd resolves deps from canonical trees (LD_LIBRARY_PATH unset) ---"
    ldd "$BIN" 2>&1 | grep -iE "/tmp/e4s-provider|/opt/mpi|not found" | head

    echo
    echo "--- (d) specialized amrex static lib present ---"
    ls -lh /tmp/e4s-specialized-amrex-sm80/linux-x86_64_v3/amrex-26.06-a2ugptk/lib/*.a 2>&1 | head -4

    echo
    NF=$(ldd "$BIN" 2>&1 | grep -c "not found")
    echo "not-found count: $NF"
    if [ "$NF" -eq 0 ]; then
      echo "GATE: PASS (cross-tree RPATH resolves under ch-run, zero not-found)"
    else
      echo "GATE: FAIL ($NF unresolved deps)"
    fi
  '
echo "[CH COMPOSE DONE $(date -u)] rc=$?"
exit 0
