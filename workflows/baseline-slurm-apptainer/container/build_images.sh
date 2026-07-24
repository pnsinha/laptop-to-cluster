#!/bin/bash
# build_images.sh -- build per-service Apptainer images for the reference workflow.
#
# Each service gets its own .sif with the application code baked in, matching
# what `build:` does on the Docker Compose side. This keeps the two halves of
# the translation comparable: code-in-image on both sides, no source bind.
#
# Adapter variables (override per center):
#   C2H_IMAGE_DIR   where .sif files are written   (default: $SCRATCH/c2hpc-images)
#   C2H_RUNTIME     container runtime binary       (default: apptainer)
#
# Unprivileged build: the definitions install no packages, so this normally
# succeeds without root or --fakeroot. If your site blocks user namespaces
# entirely, build on a root-capable VM and copy the .sif files across:
#   apptainer build worker.sif container/worker.def    # on the VM
#   scp worker.sif <cluster>:$SCRATCH/c2hpc-images/

set -euo pipefail

RUNTIME="${C2H_RUNTIME:-apptainer}"
CONTAINER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$CONTAINER_DIR/.." && pwd)"
BIN_DIR="$ROOT_DIR/bin"
DEF_DIR="$CONTAINER_DIR"
IMAGE_DIR="${C2H_IMAGE_DIR:-${SCRATCH:-$HOME}/c2hpc-images}"

command -v "$RUNTIME" >/dev/null 2>&1 || {
    echo "ERROR [BSSW-W004] container runtime '$RUNTIME' not found on PATH" >&2
    echo "  On many centers this needs 'module load apptainer' first." >&2
    exit 1
}

mkdir -p "$IMAGE_DIR"
echo "Runtime  : $($RUNTIME --version)"
echo "Image dir: $IMAGE_DIR"
echo

# definition-file:image-name:source-dir-relative-to-root
# Both definitions cd into the source dir so their %files paths resolve:
#   worker.def    needs producer.py + worker.py  (both in bin/)
#   dashboard.def needs app.py                   (in bin/)
BUILDS=(
    "worker.def:worker:$BIN_DIR"
    "dashboard.def:dashboard:$BIN_DIR"
)

for spec in "${BUILDS[@]}"; do
    IFS=: read -r def_file img_name src_dir <<<"$spec"
    sif="$IMAGE_DIR/$img_name.sif"

    [ -d "$src_dir" ] || { echo "ERROR: missing source dir $src_dir" >&2; exit 1; }

    echo "==> building $img_name.sif from $DEF_DIR/$def_file (source: $src_dir)"
    # cd into the source dir so the definition's %files paths resolve.
    ( cd "$src_dir" && "$RUNTIME" build --force "$sif" "$DEF_DIR/$def_file" )
done

# Record digests. Evidence records need these to prove which image ran.
MANIFEST="$IMAGE_DIR/images.sha256"
( cd "$IMAGE_DIR" && sha256sum ./*.sif > "$MANIFEST" )

echo
echo "Built:"
sed 's/^/  /' "$MANIFEST"
echo
echo "Digest manifest: $MANIFEST"
echo "Next: sbatch -A <account> -p <partition> $ROOT_DIR/slurm/baseline.sbatch"
