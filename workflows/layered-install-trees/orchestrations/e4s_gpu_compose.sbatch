#!/bin/bash
#SBATCH --job-name=u_gpu_compose
#SBATCH --partition=gpu-debug
#SBATCH --account=BSSW_SLURM_ACCOUNT_GPU
#SBATCH --qos=gpu
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16G
#SBATCH --gres=gpu:1
#SBATCH --time=00:20:00
#SBATCH --output=${BSSW_SCRATCH_ROOT}/union-anvil/logs/gpu-compose-%j.out

# Stage 3 (Apptainer) — compose provider + specialized, run arch-adaptive cuda_smoke on A100.
# This is the Apptainer lane; Charliecloud GPU test (19805890) runs independently.
set +e
U=${BSSW_SCRATCH_ROOT}/union-anvil
SIF=${BSSW_SCRATCH_ROOT}/containers/e4s-cuda-26.06-cuda80.sif
P=$U/trees/e4s-provider-cpu
S=$U/trees/e4s-specialized-amrex-sm80
SMOKE=$U/apps/gpu-check/cuda_smoke.cu

mkdir -p "$U/logs"

echo "[GPU COMPOSE START $(date -u)] host=$(hostname) job=$SLURM_JOB_ID"
echo "=== host GPU ==="
nvidia-smi --query-gpu=index,name,compute_cap,driver_version --format=csv,noheader 2>&1

# Compose: bind BOTH trees at canonical /tmp paths + scratch; --nv for GPU passthrough.
apptainer exec --nv \
  --bind ${BSSW_SCRATCH_ROOT} \
  --bind "$P":/tmp/e4s-provider-cpu \
  --bind "$S":/tmp/e4s-specialized-amrex-sm80 \
  "$SIF" bash -lc '
    set +e
    echo "########## (a) both layers visible in-container ##########"
    echo "provider:    $(ls /tmp/e4s-provider-cpu/linux-x86_64_v3/ | wc -l) package dirs"
    echo "specialized: $(ls /tmp/e4s-specialized-amrex-sm80/linux-x86_64_v3/ | wc -l) package dirs"
    ls -d /tmp/e4s-provider-cpu/linux-x86_64_v3/heffte-* /tmp/e4s-specialized-amrex-sm80/linux-x86_64_v3/amrex-* 2>&1 | head

    echo
    echo "########## (b) cross-tree RPATH resolves (ldd, no LD_LIBRARY_PATH) ##########"
    BIN=/tmp/e4s-provider-cpu/linux-x86_64_v3/heffte-2.4.1-ksq3blx/lib/libheffte.so
    echo "binary: $BIN"
    readelf -d "$BIN" | grep -iE "0x000000000000000f|RPATH|RUNPATH"
    echo "ldd: deps from canonical trees?"
    ldd "$BIN" 2>&1 | grep -iE "/tmp/e4s-provider|/tmp/e4s-specialized|/opt/mpi|not found" | head

    echo
    echo "########## (c) GPU present in-container ##########"
    nvidia-smi --query-gpu=name,compute_cap,driver_version --format=csv,noheader 2>&1

    echo
    echo "########## (d) arch-adaptive cuda_smoke ##########"
    CC=$(nvidia-smi --query-gpu=compute_cap --format=csv,noheader 2>/dev/null | head -1 | tr -d " ")
    echo "detected compute_cap: $CC -> sm_${CC/./}"
    ARCH="sm_${CC/./}"
    mkdir -p /tmp/smoke && cp "'"$SMOKE"'" /tmp/smoke/cuda_smoke.cu
    cd /tmp/smoke
    /usr/local/cuda-12.9/bin/nvcc -arch=$ARCH -O2 cuda_smoke.cu -o cuda_smoke 2>&1 | head
    echo "compile rc=$?"
    if [ -x ./cuda_smoke ]; then
      ./cuda_smoke 2>&1
      echo "smoke exit=$?"
    else
      echo "RESULT: COMPILE_FAIL"
    fi
  '
echo "[GPU COMPOSE DONE $(date -u)] rc=$?"
exit 0
