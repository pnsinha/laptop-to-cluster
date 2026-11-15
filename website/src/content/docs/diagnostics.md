---
title: "Find a failure by the ID it prints"
description: "Short reader codes, stable workflow identifiers, and recovery guidance for every documented baseline failure mode."
editUrl: false
tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 2 }
l2c:
  kindLine: "Troubleshooting"
  lede: "When a run fails, the job output names an ID that starts with BSSW-. Find that ID below, or choose the symptom you see."
---
<nav aria-label="Diagnostics on this page" class="not-content">
<ul class="diagnostic-index"><li><a href="#bssw-cleanup-child">A job step did not stop during cleanup</a><code>BSSW-CLEANUP-CHILD</code></li><li><a href="#bssw-preq-command">A required helper command is missing</a><code>BSSW-PREQ-COMMAND</code></li><li><a href="#bssw-worker-exit">A worker step failed</a><code>BSSW-WORKER-EXIT</code></li><li><a href="#bssw-preq-value">An adapter value is out of bounds</a><code>BSSW-PREQ-VALUE</code></li><li><a href="#bssw-prereq-apptainer">Container runtime is unavailable</a><code>BSSW-PREQ-APPTAINER</code></li><li><a href="#bssw-readiness-timeout">Coordinator did not become ready</a><code>BSSW-READY-TIMEOUT</code></li><li><a href="#bssw-storage-unavailable">Job-scoped storage check failed</a><code>BSSW-PREQ-STORAGE</code></li><li><a href="#bssw-prereq-slurm">Scheduler prerequisite is unavailable</a><code>BSSW-PREQ-SLURM</code></li><li><a href="#bssw-preq-image">The container image is missing or unsafe</a><code>BSSW-PREQ-IMAGE</code></li><li><a href="#bssw-coordinator-exit">The coordinator stopped early</a><code>BSSW-COORDINATOR-EXIT</code></li><li><a href="#bssw-integrity-image">The image checksum does not match</a><code>BSSW-INTEGRITY-IMAGE</code></li><li><a href="#bssw-integrity-input">The input checksum does not match</a><code>BSSW-INTEGRITY-INPUT</code></li><li><a href="#bssw-preq-input">The input or expected results are unusable</a><code>BSSW-PREQ-INPUT</code></li><li><a href="#bssw-cleanup-signal">The job was stopped by a signal</a><code>BSSW-CLEANUP-SIGNAL</code></li><li><a href="#bssw-verify-result">The results failed verification</a><code>BSSW-VERIFY-RESULT</code></li></ul>
</nav>

<section class="diagnostic-entry" id="bssw-cleanup-child" aria-labelledby="bssw-cleanup-child-heading">

## BSSW-CLEANUP-CHILD: A job step did not stop during cleanup {#bssw-cleanup-child-heading}

<p class="diagnostic-code"><strong>Code:</strong> <code>BSSW-CLEANUP-CHILD</code></p>

### Signal {#bssw-cleanup-child--signal}
The job prints `BSSW-CLEANUP-CHILD` and exits with code 79. When the job ended, at least one job step did not stop within the cleanup time limit. The script removes any success file.

### Likely causes {#bssw-cleanup-child--likely-causes}
A step ignored the polite stop and the forced stop, or the cleanup time limit is shorter than the step needs. The forced-stop path is **Designed, not run**: it has not been exercised on a cluster.

### Recovery steps {#bssw-cleanup-child--recovery-steps}
1. Check for leftover steps with `squeue -u $USER` and `sacct -j <job id>`.
2. If steps need longer to stop, raise `CLEANUP_TIMEOUT` (1 to 60 seconds).
3. Read the coordinator and worker logs in the run folder for a step that hangs on exit.

**Warning:** Do not treat a run that ended with this code as a success, even if `results.json` exists.

### Verify the recovery {#bssw-cleanup-child--verify-the-recovery}
A new run ends with exit code 0 and no leftover steps.

### Escalate {#bssw-cleanup-child--escalate}
Report the sanitized logs through [support](/about/support/).

</section>

<section class="diagnostic-entry" id="bssw-preq-command" aria-labelledby="bssw-preq-command-heading">

## BSSW-PREQ-COMMAND: A required helper command is missing {#bssw-preq-command-heading}

<p class="diagnostic-code"><strong>Code:</strong> <code>BSSW-PREQ-COMMAND</code></p>

### Signal {#bssw-preq-command--signal}
The job, or `container/acquire.sh`, prints `BSSW-PREQ-COMMAND` and exits with code 66. The SHA-256 command the workflow uses (`sha256sum` by default) is not available, or `python3` is missing when you run `acquire.sh`.

### Likely causes {#bssw-preq-command--likely-causes}
The command is not on the compute node's path, or your center provides it under another name or module.

### Recovery steps {#bssw-preq-command--recovery-steps}
1. Run `command -v sha256sum` inside a job on the compute node.
2. If your center uses another command, set `BSSW_SHA256_CMD` to it. It must print the digest first, then the file name.
3. For `acquire.sh`, load a module that provides `python3`, then run it again.

**Warning:** Do not skip the checksum steps to get past this error.

### Verify the recovery {#bssw-preq-command--verify-the-recovery}
The command is found inside a job, and the next submission passes the prerequisite checks.

### Escalate {#bssw-preq-command--escalate}
Ask center support which checksum tool is supported on compute nodes.

</section>

<section class="diagnostic-entry" id="bssw-worker-exit" aria-labelledby="bssw-worker-exit-heading">

## BSSW-WORKER-EXIT: A worker step failed {#bssw-worker-exit-heading}

<p class="diagnostic-code"><strong>Code:</strong> <code>BSSW-WORKER-EXIT</code></p>

### Signal {#bssw-worker-exit--signal}
The job prints `BSSW-WORKER-EXIT` and exits with code 76. At least one worker job step ended with an error.

### Likely causes {#bssw-worker-exit--likely-causes}
The job does not have enough CPUs for the number of workers, your center restricts exclusive single-task job steps, or the worker could not reach the coordinator.

### Recovery steps {#bssw-worker-exit--recovery-steps}
1. Open the worker logs in the run folder's `logs/` directory. Each worker has its own log.
2. Each worker step uses one CPU. Compare `WORKER_COUNT` with the job's `--cpus-per-task`, and lower the count or raise the CPUs.
3. If `srun` rejects the step, ask your center whether exclusive single-task steps are allowed.

**Warning:** Do not remove the exclusive option from the step launcher to make it run.

### Verify the recovery {#bssw-worker-exit--verify-the-recovery}
Every worker exits cleanly and the run reaches the verification step.

### Escalate {#bssw-worker-exit--escalate}
Report sanitized worker logs and your center's step policy through [support](/about/support/).

</section>

<section class="diagnostic-entry" id="bssw-preq-value" aria-labelledby="bssw-preq-value-heading">

## BSSW-PREQ-VALUE: An adapter value is out of bounds {#bssw-preq-value-heading}

<p class="diagnostic-code"><strong>Code:</strong> <code>BSSW-PREQ-VALUE</code></p>

### Signal {#bssw-preq-value--signal}
The job prints `BSSW-PREQ-VALUE` and exits with code 67. The message names the value: `WORKER_COUNT` must be a whole number from 1 to 16, `TASK_COUNT` from 1 to 256, `READINESS_TIMEOUT` from 1 to 300, and `CLEANUP_TIMEOUT` from 1 to 60.

### Likely causes {#bssw-preq-value--likely-causes}
The value passed through `--export` is not a whole number, is empty, or is outside its range.

### Recovery steps {#bssw-preq-value--recovery-steps}
1. Read which value the message names.
2. Correct it in your `sbatch --export=...` list.
3. Submit again.

**Warning:** Do not edit the bounds in the script. They keep a run small enough for a shared node.

### Verify the recovery {#bssw-preq-value--verify-the-recovery}
The next submission gets past the prerequisite checks.

### Escalate {#bssw-preq-value--escalate}
If you need larger values, ask your center whether the node and partition allow them first.

</section>

<section class="diagnostic-entry" id="bssw-preq-apptainer" aria-labelledby="bssw-preq-apptainer-heading">
<span id="bssw-prereq-apptainer"></span>

## BSSW-PREQ-APPTAINER: Container runtime is unavailable {#bssw-preq-apptainer-heading}

<p class="diagnostic-code"><strong>Code:</strong> <code>BSSW-PREQ-APPTAINER</code> <span class="diagnostic-stable-id">Earlier name: <code>BSSW-PREREQ-APPTAINER</code></span></p>

### Signal {#bssw-preq-apptainer--signal}
The job prints `BSSW-PREQ-APPTAINER` and exits with code 65.

`command -v apptainer` fails, `apptainer --version` fails, or the runtime is absent on compute nodes.

### Likely causes {#bssw-preq-apptainer--likely-causes}
The runtime module is not loaded, login and compute environments differ, or the center supports another rootless runtime.

### Recovery steps {#bssw-preq-apptainer--recovery-steps}
1. Find the center-documented runtime module or path.
2. Verify it inside a compute allocation.
3. Record the runtime version and rerun the prerequisite check.

**Warning:** Do not install a privileged daemon or bypass center policy.

### Verify the recovery {#bssw-preq-apptainer--verify-the-recovery}
Both `command -v apptainer` and `apptainer --version` succeed in the job environment.

### Escalate {#bssw-preq-apptainer--escalate}
Ask center support which rootless runtime is approved. This release does not claim another runtime is validated.

<aside class="diagnostic-applicability" aria-label="Relevant tested context"><p><strong>Relevant discriminator:</strong> runtime: Apptainer. <a href="/applicability/m2-baseline-anvil-2026-10/">Review the complete applicability record</a>.</p></aside>

</section>

<section class="diagnostic-entry" id="bssw-ready-timeout" aria-labelledby="bssw-ready-timeout-heading">
<span id="bssw-readiness-timeout"></span>

## BSSW-READY-TIMEOUT: Coordinator did not become ready {#bssw-ready-timeout-heading}

<p class="diagnostic-code"><strong>Code:</strong> <code>BSSW-READY-TIMEOUT</code> <span class="diagnostic-stable-id">Earlier name: <code>BSSW-READINESS-TIMEOUT</code></span></p>

### Signal {#bssw-ready-timeout--signal}
The job prints `BSSW-READY-TIMEOUT` and exits with code 75.

The semantic health check expires. The launcher exits nonzero and no worker-start event occurs.

### Likely causes {#bssw-ready-timeout--likely-causes}
The coordinator failed, the image is wrong, loopback communication is blocked, job-scoped storage is unwritable, or requested resources are insufficient.

### Recovery steps {#bssw-ready-timeout--recovery-steps}
1. Inspect the coordinator log and image digest.
2. Check loopback communication and job-scoped write permissions.
3. Correct one cause, remove invalid success artifacts, and resubmit within the documented timeout bounds.

**Warning:** Do not replace semantic health with a fixed sleep or an unbounded loop.

### Verify the recovery {#bssw-ready-timeout--verify-the-recovery}
Confirm the failed run has this diagnostic code, a nonzero result, cleanup evidence, and no worker-start event. A repaired run must pass readiness before workers.

### Escalate {#bssw-ready-timeout--escalate}
Report sanitized coordinator and readiness logs through [support](/about/support/).

</section>

<section class="diagnostic-entry" id="bssw-preq-storage" aria-labelledby="bssw-preq-storage-heading">
<span id="bssw-storage-unavailable"></span>

## BSSW-PREQ-STORAGE: Job-scoped storage check failed {#bssw-preq-storage-heading}

<p class="diagnostic-code"><strong>Code:</strong> <code>BSSW-PREQ-STORAGE</code> <span class="diagnostic-stable-id">Earlier name: <code>BSSW-STORAGE-UNAVAILABLE</code></span></p>

### Signal {#bssw-preq-storage--signal}
The job prints `BSSW-PREQ-STORAGE` and exits with code 72.

The selected scratch root is missing or unwritable, quota is insufficient, or the container bind is denied.

### Likely causes {#bssw-preq-storage--likely-causes}
The path is not allocated to the job, quota is exhausted, permissions are wrong, or runtime bind policy rejects it.

### Recovery steps {#bssw-preq-storage--recovery-steps}
1. Select the center-approved job-scoped path.
2. Verify ownership and free quota.
3. Create a private directory for the submitted job.
4. Test the bind with a non-sensitive file.

**Warning:** Never fall back silently to shared persistent storage or a world-writable path.

### Verify the recovery {#bssw-preq-storage--verify-the-recovery}
The job can create, read, and remove a private test file through the same container bind.

### Escalate {#bssw-preq-storage--escalate}
Ask center support to confirm the approved scratch and bind policy.

</section>

<section class="diagnostic-entry" id="bssw-preq-slurm" aria-labelledby="bssw-preq-slurm-heading">
<span id="bssw-prereq-slurm"></span>

## BSSW-PREQ-SLURM: Scheduler prerequisite is unavailable {#bssw-preq-slurm-heading}

<p class="diagnostic-code"><strong>Code:</strong> <code>BSSW-PREQ-SLURM</code> <span class="diagnostic-stable-id">Earlier name: <code>BSSW-PREREQ-SLURM</code></span></p>

### Signal {#bssw-preq-slurm--signal}
The job prints `BSSW-PREQ-SLURM` and exits with code 64.

`sbatch` is unavailable, submission authorization is unknown, or a minimal submission is rejected before the job starts.

### Likely causes {#bssw-preq-slurm--likely-causes}
The scheduler client is not loaded, the account or partition is unauthorized, or the center requires a site-specific submission option.

### Recovery steps {#bssw-preq-slurm--recovery-steps}
1. Read the center user guide.
2. Load only the documented scheduler client environment.
3. Select an authorized account and partition.
4. Rerun `command -v sbatch` and the center's non-submitting account check.

**Warning:** Do not guess account names.

### Verify the recovery {#bssw-preq-slurm--verify-the-recovery}
The scheduler command is available and the center confirms an authorized submission target.

### Escalate {#bssw-preq-slurm--escalate}
Contact center support when authorization remains unclear.

</section>

<section class="diagnostic-entry" id="bssw-preq-image" aria-labelledby="bssw-preq-image-heading">

## BSSW-PREQ-IMAGE: The container image is missing or unsafe {#bssw-preq-image-heading}

<p class="diagnostic-code"><strong>Code:</strong> <code>BSSW-PREQ-IMAGE</code></p>

### Signal {#bssw-preq-image--signal}
The job prints `BSSW-PREQ-IMAGE` and exits with code 68. The image file is missing, is not a regular file, or its checksum record is missing, unreadable, or invalid. `container/acquire.sh` prints the same code when its acquisition metadata is invalid.

### Likely causes {#bssw-preq-image--likely-causes}
The image has not been built yet, `IMAGE_PATH` is a relative path that Slurm's copy of the script cannot resolve, the path is a symbolic link, or the `.sha256` file next to the image is absent.

### Recovery steps {#bssw-preq-image--recovery-steps}
1. Run `workflows/baseline-slurm-apptainer/container/acquire.sh` where your center allows image builds.
2. Pass `IMAGE_PATH` as an absolute path in `--export`.
3. Confirm the image is a regular file, not a link, and that `<image>.sha256` holds one 64-character digest.

**Warning:** Do not point `IMAGE_PATH` at an image you did not build or obtain through your center.

### Verify the recovery {#bssw-preq-image--verify-the-recovery}
The next submission gets past the image checks and starts the coordinator.

### Escalate {#bssw-preq-image--escalate}
Ask center support whether image builds are allowed on login nodes or need a build node.

</section>

<section class="diagnostic-entry" id="bssw-coordinator-exit" aria-labelledby="bssw-coordinator-exit-heading">

## BSSW-COORDINATOR-EXIT: The coordinator stopped early {#bssw-coordinator-exit-heading}

<p class="diagnostic-code"><strong>Code:</strong> <code>BSSW-COORDINATOR-EXIT</code></p>

### Signal {#bssw-coordinator-exit--signal}
The job prints `BSSW-COORDINATOR-EXIT` and exits with code 74. The coordinator exited before it published its address, published an invalid address, exited right after becoming ready, or exited before the results were checked.

### Likely causes {#bssw-coordinator-exit--likely-causes}
The image or input is wrong, the coordinator could not write its files in the run folder, or the job ran out of time or resources.

### Recovery steps {#bssw-coordinator-exit--recovery-steps}
1. Open `logs/coordinator.log` in the run folder (`<scratch root>/bssw-<job id>/logs/`).
2. Fix the cause the log shows: image, input, or a scratch path that is not writable.
3. If the coordinator stopped mid-run, compare the job's elapsed time with its time limit.

**Warning:** Do not restart only the workers. A run needs the whole sequence from the start.

### Verify the recovery {#bssw-coordinator-exit--verify-the-recovery}
A new run passes the readiness gate and keeps the coordinator running until the results are checked.

### Escalate {#bssw-coordinator-exit--escalate}
Report sanitized coordinator logs through [support](/about/support/).

</section>

<section class="diagnostic-entry" id="bssw-integrity-image" aria-labelledby="bssw-integrity-image-heading">

## BSSW-INTEGRITY-IMAGE: The image checksum does not match {#bssw-integrity-image-heading}

<p class="diagnostic-code"><strong>Code:</strong> <code>BSSW-INTEGRITY-IMAGE</code></p>

### Signal {#bssw-integrity-image--signal}
The job prints `BSSW-INTEGRITY-IMAGE` and exits with code 71. The image's SHA-256 could not be calculated or does not match the recorded value. `container/acquire.sh` prints the same code if its definition and registry record are not tied to the same digest.

### Likely causes {#bssw-integrity-image--likely-causes}
The image was rebuilt or replaced after its checksum was recorded, or the file was damaged.

### Recovery steps {#bssw-integrity-image--recovery-steps}
1. Run `container/acquire.sh` again to build a fresh image and a fresh checksum record.
2. If `acquire.sh` itself prints this code, restore `container/Apptainer.def` and `container/image-lock.json` from the release.

**Warning:** Do not edit the checksum record to match a different image.

### Verify the recovery {#bssw-integrity-image--verify-the-recovery}
The next submission gets past the image checks.

### Escalate {#bssw-integrity-image--escalate}
If a fresh build keeps failing, report the sanitized output through [support](/about/support/).

</section>

<section class="diagnostic-entry" id="bssw-integrity-input" aria-labelledby="bssw-integrity-input-heading">

## BSSW-INTEGRITY-INPUT: The input checksum does not match {#bssw-integrity-input-heading}

<p class="diagnostic-code"><strong>Code:</strong> <code>BSSW-INTEGRITY-INPUT</code></p>

### Signal {#bssw-integrity-input--signal}
The job prints `BSSW-INTEGRITY-INPUT` and exits with code 70. The input's SHA-256 could not be calculated, does not match the recorded value, or the job's private copy of the input failed the same check.

### Likely causes {#bssw-integrity-input--likely-causes}
The input file was edited without updating its checksum record, or it was changed or truncated in transit.

### Recovery steps {#bssw-integrity-input--recovery-steps}
1. From the workflow directory, run `(cd inputs && sha256sum -c tasks.json.sha256)`.
2. If you edited the input on purpose, create a new checksum record with your SHA-256 tool and keep the `tasks.json` file name in it.
3. If you did not edit it, restore the file from the release.

**Warning:** Do not edit the checksum record just to make the check pass.

### Verify the recovery {#bssw-integrity-input--verify-the-recovery}
`sha256sum -c` prints `tasks.json: OK`, and the next submission gets past the integrity checks.

### Escalate {#bssw-integrity-input--escalate}
Report the problem through [support](/about/support/) if a restored file still fails.

</section>

<section class="diagnostic-entry" id="bssw-preq-input" aria-labelledby="bssw-preq-input-heading">

## BSSW-PREQ-INPUT: The input or expected results are unusable {#bssw-preq-input-heading}

<p class="diagnostic-code"><strong>Code:</strong> <code>BSSW-PREQ-INPUT</code></p>

### Signal {#bssw-preq-input--signal}
The job prints `BSSW-PREQ-INPUT` and exits with code 69 or 73. Code 69 means the input or expected-results file is missing or unsafe, or its checksum record is missing, unreadable, or invalid. Code 73 means the input was read but failed the schema or bounds check.

### Likely causes {#bssw-preq-input--likely-causes}
`INPUT_PATH`, `EXPECTED_PATH`, or `INPUT_SHA256_FILE` is a relative path that Slurm's copy of the script cannot resolve. For code 73, `inputs/tasks.json` does not follow the task format, repeats a task id, or holds a different number of tasks than `TASK_COUNT`.

### Recovery steps {#bssw-preq-input--recovery-steps}
1. Pass all three paths as absolute paths in `--export`, as shown in [Run the example](/start/#submit-the-job).
2. For code 73, read `logs/input-validation.log` in the run folder.
3. Make sure the file has `schemaVersion` 1, a `tasks` list, and for each task an `id` and a `payload` holding only `message` and `repeat`, with unique ids.
4. Set `TASK_COUNT` to the number of tasks in the file.

**Warning:** Treat input as data only. Never put shell syntax in it.

### Verify the recovery {#bssw-preq-input--verify-the-recovery}
The validation step passes and the coordinator starts.

### Escalate {#bssw-preq-input--escalate}
If the input is generated by another tool, report the failing sanitized `logs/input-validation.log` through [support](/about/support/).

</section>

<section class="diagnostic-entry" id="bssw-cleanup-signal" aria-labelledby="bssw-cleanup-signal-heading">

## BSSW-CLEANUP-SIGNAL: The job was stopped by a signal {#bssw-cleanup-signal-heading}

<p class="diagnostic-code"><strong>Code:</strong> <code>BSSW-CLEANUP-SIGNAL</code></p>

### Signal {#bssw-cleanup-signal--signal}
The job prints `BSSW-CLEANUP-SIGNAL` and exits with code 78. The job received a termination signal (terminate, interrupt, or hang-up) before it finished. No success file is left behind.

### Likely causes {#bssw-cleanup-signal--likely-causes}
Someone ran `scancel`, or the job reached its wall-time limit. The wall-time signal path is **Designed, not run**: it has not been exercised on a cluster.

### Recovery steps {#bssw-cleanup-signal--recovery-steps}
1. Run `sacct -j <job id> --format=JobID,State,Elapsed,Timelimit`.
2. If the state is `TIMEOUT`, raise `#SBATCH --time` and submit again.
3. If the state is `CANCELLED`, find out who cancelled it before you submit again.

**Warning:** Do not count partial files in the run folder as results.

### Verify the recovery {#bssw-cleanup-signal--verify-the-recovery}
A new run finishes before its time limit and writes `result.json`.

### Escalate {#bssw-cleanup-signal--escalate}
If the scheduler ended the job without a request from you, ask center support for the reason.

</section>

<section class="diagnostic-entry" id="bssw-verify-result" aria-labelledby="bssw-verify-result-heading">

## BSSW-VERIFY-RESULT: The results failed verification {#bssw-verify-result-heading}

<p class="diagnostic-code"><strong>Code:</strong> <code>BSSW-VERIFY-RESULT</code></p>

### Signal {#bssw-verify-result--signal}
The job prints `BSSW-VERIFY-RESULT` and exits with code 77. The result schema, the count, the uniqueness, or the content did not pass verification, or the verifier did not create `result.json`. No success file is left behind.

### Likely causes {#bssw-verify-result--likely-causes}
A worker produced a wrong or missing result, `expected/results.json` no longer matches your input or application, or the verifier is still the demonstration one after you changed the application.

### Recovery steps {#bssw-verify-result--recovery-steps}
1. Read `logs/verification.log` in the run folder.
2. Compare `results.json` with `expected.json` in the same folder.
3. If you changed the application, replace `bin/verify.py` and `expected/results.json` with your own definition of correct.

**Warning:** Do not create `result.json` by hand. It is the only success marker.

### Verify the recovery {#bssw-verify-result--verify-the-recovery}
A new run writes `result.json` with `"status": "success"`.

### Escalate {#bssw-verify-result--escalate}
Report the sanitized verification log through [support](/about/support/).

</section>

If execution is blocked, you can still use the conceptual modules and local adaptation guidance. If no symptom matches, [report a missing diagnostic](/about/support/) with sanitized reproduction details.
