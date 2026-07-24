# Expected task results

Each file is one result in the format emitted by `bin/worker.py`:

```json
{
  "task_id": <int>,
  "status": "completed",
  "duration_sec": <float, 0.5-2.0>,
  "worker": "<worker id>",
  "timestamp": "<YYYY-MM-DDTHH:MM:SS>"
}
```

The `duration_sec` and `timestamp` fields are non-deterministic by design (the
worker sleeps a random interval), so these files document the *schema* and the
required fields, not exact values. The `tests/` directory validates shape and
field presence, not the random duration.

The orchestration invariant `orchestrate.sh` enforces at the end of a run is:
the number of `*.json` files in the results directory equals `C2H_TASKS`, the
tasks directory is empty, and the processing directory is empty. These samples
correspond to a two-task run against `inputs/task_{1,2}.json`.
