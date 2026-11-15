/* The six steps of one allocation, with one caption each, matching slurm/baseline.sbatch at v0.1.0:
   workers run in step 4 only; the coordinator runs from step 2 through verify;
   job scratch spans the run; cleanup is the EXIT trap set at the start. Claims stay
   inside what the script does: the time limit is READINESS_TIMEOUT (default 30,
   range 1..300, baseline.sbatch:22,135), and an untrappable SIGKILL or a wall-time
   kill bypasses the trap (the KILL path is Designed, not run), so no caption says
   "however the job ends" or a fixed number of seconds. */
export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6;

export const TIMELINE_STEPS: readonly { n: StepNumber; label: string; caption: string }[] = [
  { n: 1, label: 'Get an allocation', caption: 'The scheduler grants one node for a set time. The script checks its inputs and makes a private job folder (job-scoped scratch).' },
  { n: 2, label: 'Start coordinator', caption: 'The coordinator starts as its own tracked program (a job step), on local-only access (loopback), and writes its address to a file.' },
  { n: 3, label: 'Readiness gate', caption: 'Proves the coordinator can serve: the exact expected answer within the time limit (30 seconds by default), or the job stops before any worker starts.' },
  { n: 4, label: 'Run workers', caption: 'Only now do workers start, each as a job step. The script waits for every worker to finish.' },
  { n: 5, label: 'Verify results', caption: 'With the coordinator still running, a separate check confirms every result; only a full pass writes the success file.' },
  { n: 6, label: 'Clean up', caption: 'Cleanup, set up at the start (an EXIT trap), stops every step still running when the script exits, whether it passed or failed.' },
] as const;
