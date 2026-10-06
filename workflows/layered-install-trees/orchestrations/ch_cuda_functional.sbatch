#!/bin/bash
#SBATCH --job-name=ch_cu_fn
#SBATCH --partition=gpu-debug
#SBATCH --account=BSSW_SLURM_ACCOUNT_GPU
#SBATCH --qos=gpu
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16G
#SBATCH --gres=gpu:1
#SBATCH --time=00:15:00
#SBATCH --output=logs/ch-cuda-fn-%j.out

# Charliecloud functional GPU test — bundled libcuda (Julia 610) vs host driver (580).
set +e
export PATH=${BSSW_CHARLIECLOUD_PREFIX}/bin:$PATH
echo "BSSW_VERSIONS slurm=$(scontrol --version 2>/dev/null | head -1)"
echo "BSSW_VERSIONS apptainer=$(apptainer --version 2>/dev/null || echo unavailable)"
echo "BSSW_VERSIONS charliecloud=$(ch-run --version 2>&1 | head -1 || echo unavailable)"
U=${BSSW_SCRATCH_ROOT}/union-anvil
SQSH=${BSSW_SCRATCH_ROOT}/charliecloud-build/e4s-cuda-26.06-cuda80.sqsh
JULIA_LIB=${BSSW_BUNDLED_LIBCUDA_DIR}

mkdir -p "$U/logs"

# Stage smoke source into the provider tree (already bound at /tmp/e4s-provider-cpu)
cp "$U/apps/gpu-check/cuda_smoke.cu" "$U/trees/e4s-provider-cpu/cuda_smoke.cu"

echo "[START $(date -u)] host=$(hostname)"
echo "=== host GPU + driver ==="
nvidia-smi --query-gpu=name,driver_version,compute_cap --format=csv,noheader 2>&1
echo "host libcuda: $(readlink -f "${BSSW_HOST_LIBCUDA:-/usr/lib64/libcuda.so.1}" 2>/dev/null)"

echo
echo "########## A. bundled libcuda (Julia 610.43.02) ##########"
ch-run -W -t "$SQSH" \
  --bind="$U/trees/e4s-provider-cpu":/tmp/e4s-provider-cpu \
  --bind="$U/trees/e4s-specialized-amrex-sm80":/tmp/e4s-specialized-amrex-sm80 \
  -- /bin/bash -c "unset LD_PRELOAD; cp /tmp/e4s-provider-cpu/cuda_smoke.cu /tmp/smoke.cu; export LD_LIBRARY_PATH=$JULIA_LIB; echo libcuda: \$(ls $JULIA_LIB/libcuda.so* 2>&1 | head -1); /usr/local/cuda-12.9/bin/nvcc -arch=sm_80 -o /tmp/smoke /tmp/smoke.cu 2>&1 | tail -3; echo compile_rc=\$?; echo '--- RUN (bundled 610) ---'; /tmp/smoke 2>&1; echo smoke_exit=\$?" 2>&1 | grep -vE "xalt|LD_PRELOAD.*ignored"

echo
echo "########## B. host driver libcuda ##########"
HOSTLIB=$(mktemp -d ${BSSW_SCRATCH_ROOT}/union-anvil/hostcuda.XXXXXX)
LIBCUDA_REAL=$(readlink -f "${BSSW_HOST_LIBCUDA:-/usr/lib64/libcuda.so.1}")
cp -a "$LIBCUDA_REAL" "$HOSTLIB/"
ln -sf "$(basename "$LIBCUDA_REAL")" "$HOSTLIB/libcuda.so.1"
ln -sf "$(basename "$LIBCUDA_REAL")" "$HOSTLIB/libcuda.so"
ch-run -W -t "$SQSH" \
  --bind="$U/trees/e4s-provider-cpu":/tmp/e4s-provider-cpu \
  --bind="$U/trees/e4s-specialized-amrex-sm80":/tmp/e4s-specialized-amrex-sm80 \
  --bind="$HOSTLIB":/hostlibs \
  -- /bin/bash -c "unset LD_PRELOAD; cp /tmp/e4s-provider-cpu/cuda_smoke.cu /tmp/smoke.cu; export LD_LIBRARY_PATH=/hostlibs; echo libcuda: \$(ls /hostlibs/libcuda.so* 2>&1 | head -1); /usr/local/cuda-12.9/bin/nvcc -arch=sm_80 -o /tmp/smoke /tmp/smoke.cu 2>&1 | tail -3; echo compile_rc=\$?; echo '--- RUN (host 580) ---'; /tmp/smoke 2>&1; echo smoke_exit=\$?" 2>&1 | grep -vE "xalt|LD_PRELOAD.*ignored"
rm -rf "$HOSTLIB"

# Cleanup staged file
rm -f "$U/trees/e4s-provider-cpu/cuda_smoke.cu"
echo "[DONE $(date -u)]"
exit 0
