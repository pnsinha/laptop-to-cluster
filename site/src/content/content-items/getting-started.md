---
id: start-guide
stable_slug: getting-started
route_namespace: start
title: Run the example
summary: "Get the code and the image, record your local values, submit the example job, check that it worked, and copy your results out."
artifact_type: guidance-note
topics: [adaptation, baseline-workflow]
keywords: [allocation, Apptainer, prerequisites, Slurm, verification]
audiences: [first-time HPC learners, scientific software practitioners]
milestone: 1
status: published
publication_date: "2026-07-31"
schedulers: [slurm]
container_runtimes: [apptainer]
related: [module-1-scheduler-orchestrator, module-2-baseline, BSSW-PREREQ-SLURM, BSSW-PREREQ-APPTAINER, BSSW-READINESS-TIMEOUT]
learning_stage: baseline
authority: [{ kind: project-decision, citation: "Milestone 1 bounded workflow", scope: "Prerequisite and adaptation sequence for the single-node baseline." }]
---
## Can I run this?

New to this guide? Take the [five-minute tour](/guide/tour/) first for audience, assumed skills, and a readiness checklist; this page stays focused on running the example.

Confirm these assumptions before you run anything:

- **Allocation:** you have Slurm access, an account, and permission to request the CPU, memory, and wall time the script asks for.
- **Security and network:** the coordinator needs only local-only access ([loopback](/about/glossary/#loopback)) inside one node. No root access, privileged daemon, or inbound public port is required.
- **Storage:** a center-approved private, [job-scoped](/about/glossary/#job-scoped-scratch) path with room for the image, the run files, and the results.
- **Runtime and image:** Apptainer is available on the compute nodes, and you can build or obtain the image (see "Get the container image").
- **Readiness:** the coordinator and workers can reach each other over loopback inside the node.

## Get the code

Clone the repository at this release. The commands on this page start from its root, `laptop-to-cluster`, unless they say otherwise:

```sh
git clone --branch @release https://github.com/pnsinha/laptop-to-cluster.git && cd laptop-to-cluster
```

The code of the example workflow (`workflows/baseline-slurm-apptainer`) in this release is identical to the tested v0.1.0 revision; only its README changed.

## Check the prerequisites

1. Run `command -v sbatch` and confirm your center's account and partition syntax. If either fails, use [BSSW-PREQ-SLURM](/diagnostics/#bssw-preq-slurm).
2. Run `command -v apptainer` and `apptainer --version` in the compute-node module environment. If either fails, use [BSSW-PREQ-APPTAINER](/diagnostics/#bssw-preq-apptainer).
3. Create and remove a private test file through the intended container bind. If that fails, use [BSSW-PREQ-STORAGE](/diagnostics/#bssw-preq-storage).

## Record your local values

Write these down before you submit. The right-hand column says how to find each one. If a command prints nothing, ask your center's support.

| Value | What it is | How to find it |
|---|---|---|
| Account or project | The allocation your jobs are charged to | `sacctmgr show associations user=$USER format=Account,Partition`, or your center's account page |
| Partition or queue | The group of nodes your job runs on | `sinfo -s` lists them; your center's guide says which ones you may use |
| Wall time | The longest the job may run | The script asks for 10 minutes (`#SBATCH --time=00:10:00`). `scontrol show partition <name>` shows the partition's limit |
| CPUs and memory | What the job asks for on its one node | The script asks for 4 CPUs (`--cpus-per-task=4`) and sets no memory, so your partition's default applies. Add `#SBATCH --mem=` if your center requires it |
| Apptainer module | How the compute nodes provide the runtime | `module spider apptainer`, or your center's software guide |
| Scratch root (`BSSW_SCRATCH_ROOT`) | A private, job-scoped directory under which the job makes its `bssw-<job id>` run folder | Your center's storage guide. Set it explicitly; do not rely on the fallback to `/tmp` |
| Image and input paths | Absolute paths to the image, the input, and the expected results | The files you prepare in the next two sections; "Submit the job" shows where they go |
| Worker and task counts | How many workers run, and how many tasks they share | The defaults are 2 workers and 4 tasks (`WORKER_COUNT`, `TASK_COUNT`). `TASK_COUNT` must equal the number of tasks in `inputs/tasks.json` |
| Readiness timeout | How long the gate waits for the coordinator | The default is 30 seconds (`READINESS_TIMEOUT`, 1 to 300) |
| Tunnel or accelerator request | Needed only if you extend the example | Your center's documentation. The example uses neither |

## Get the container image

From the root of the repository you cloned in [Get the code](#get-the-code), run:

```sh
workflows/baseline-slurm-apptainer/container/acquire.sh
```

The script builds the image from a digest-pinned base into a temporary file, records the image's SHA-256 in `container/baseline.sif.sha256`, and then installs `container/baseline.sif`. It needs Apptainer and network access to the registry, so run it where your center allows image builds. If your center builds images elsewhere, build `container/Apptainer.def` there and create `container/baseline.sif.sha256` with your SHA-256 tool. If a check in the script fails, it prints a `BSSW-PREQ-*` or `BSSW-INTEGRITY-*` ID; look it up in [Troubleshooting](/diagnostics/).

Some centers do not allow an unprivileged `apptainer build`. On the Apptainer used for the [October 2026 test](/applicability/m2-baseline-anvil-2026-10/), this script could not build the image without extra privileges, and the test used the earlier build with the same digest. If the build fails with an Apptainer error rather than a BSSW ID, build `container/Apptainer.def` where you have privileges (or ask your center’s support), copy the `.sif` file into `container/`, and create `container/baseline.sif.sha256` with your SHA-256 tool.

## Check the input

The input has a recorded checksum. Check it from inside the `inputs` folder, because the checksum file names `tasks.json` without a directory:

```sh
(cd workflows/baseline-slurm-apptainer/inputs && sha256sum -c tasks.json.sha256)
```

Expect `tasks.json: OK`. If the checksum does not match, stop: the job would stop at the same point with [BSSW-INTEGRITY-INPUT](/diagnostics/#bssw-integrity-input).

## Submit the job

Submit once, from the repository root. Slurm runs a copy of the script from its own spool directory, so pass the file locations as absolute paths instead of relying on the defaults:

```sh
cd workflows/baseline-slurm-apptainer
WF=$PWD
sbatch --export=ALL,BSSW_SCRATCH_ROOT=<path>,IMAGE_PATH=$WF/container/baseline.sif,INPUT_PATH=$WF/inputs/tasks.json,INPUT_SHA256_FILE=$WF/inputs/tasks.json.sha256,EXPECTED_PATH=$WF/expected/results.json slurm/baseline.sbatch
```

Replace `<path>` with your scratch root. Add your own `--account=` and `--partition=` options to the same command. Do not exceed the documented worker, task, or timeout bounds, and keep account names, private hosts, and sensitive paths out of logs.

The [readiness gate](/about/glossary/#readiness-gate) must pass before any worker starts. If it expires, use [BSSW-READY-TIMEOUT](/diagnostics/#bssw-ready-timeout).

## Check that it worked

Two places hold the output:

- Slurm prints the job's output to `slurm-<job id>.out` in the directory you submitted from.
- The run files are in `<path>/bssw-<job id>/`, under the scratch root you chose.

Accept success only when all of these agree:

- The scheduler reports the job `COMPLETED` (for example `sacct -j <job id> --format=JobID,State,ExitCode`).
- `slurm-<job id>.out` ends with `BSSW workflow completed: result is in the job-scoped runtime directory.`
- `<path>/bssw-<job id>/result.json` says `"status": "success"`.
- In `<path>/bssw-<job id>/events.jsonl`, `coordinator-ready` comes before every `worker-start`.

A zero exit alone is not success. [Module 2](/guide/baseline-single-node-pattern/#expected-result) describes the complete result-based check.

## Copy your results out

The run folder is [job-scoped scratch](/about/glossary/#job-scoped-scratch). Your center may clear it without notice, and the job's cleanup stops the coordinator and workers but never deletes the folder. Copy out what you want to keep, to storage your center says is durable:

```sh
cp -r <path>/bssw-<job id> ~/bssw-results-<job id>
```

## If it still fails

Use [Troubleshooting](/diagnostics/) to match the ID or symptom you see. If no entry matches, [report a workflow defect](/about/support/) with sanitized commands, expected behavior, and observed behavior.
