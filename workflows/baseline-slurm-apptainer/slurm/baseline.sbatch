#!/bin/bash
# baseline.sbatch -- single-node Slurm batch job for the reference workflow.
#
# Account and partition are deliberately NOT set here. They are the two values
# that differ at every center, so the template keeps them on the command line
# rather than baking one site's answer into a published artifact:
#
#   sbatch -A <account> -p <partition> slurm/baseline.sbatch
#
# Worked example (Purdue Anvil):
#   sbatch -A cis261295 -p shared        slurm/baseline.sbatch   # evidence run
#   sbatch -A cis261295 -p debug         slurm/baseline.sbatch   # iteration
#
# Command-line flags override #SBATCH directives, so the resource requests
# below are defaults you can also override without editing the file.

#SBATCH --job-name=c2hpc
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=8
#SBATCH --mem=8G
#SBATCH --time=00:30:00
#SBATCH --output=c2hpc_%j.out
#SBATCH --error=c2hpc_%j.err

set -uo pipefail

SLURM_DIR="$(cd "$(dirname "$0")" && pwd)"
# orchestrate.sh lives in the sibling bin/ directory; resolve from there.
BIN_DIR="$(cd "$SLURM_DIR/../bin" && pwd)"

# Some centers require an explicit module load; Anvil does not.
# module load apptainer

echo "=== batch context ==="
echo "  job id      : ${SLURM_JOB_ID:-unset}"
echo "  node list   : ${SLURM_JOB_NODELIST:-unset}"
echo "  account     : ${SLURM_JOB_ACCOUNT:-unset}"
echo "  partition   : ${SLURM_JOB_PARTITION:-unset}"
echo "  cpus/task   : ${SLURM_CPUS_PER_TASK:-unset}"
echo "  SCRATCH     : ${SCRATCH:-unset}"
echo "  SLURM_SCRATCH: ${SLURM_SCRATCH:-unset}"
echo

bash "$BIN_DIR/orchestrate.sh"
rc=$?

echo
echo "=== orchestrate.sh exit: $rc ==="
exit "$rc"
