# Sample task inputs

Each file is one task in the format emitted by `bin/producer.py`:

```json
{ "id": <int>, "payload": "work_item_<id>", "created": "task_<id>" }
```

The producer generates these at runtime (`producer.py --output <dir> --count N`),
so under normal operation no input files are checked in. These two samples exist
to document the task contract and to let the worker be exercised without running
the producer: copy them into a tasks directory and point `worker.py --input` at it.

The file name (`task_<id>.json`) is the task identifier that flows through to
the result file of the same name; the worker claims a task by atomically renaming
it into a sibling `processing/` directory, so `id` and filename must agree.
