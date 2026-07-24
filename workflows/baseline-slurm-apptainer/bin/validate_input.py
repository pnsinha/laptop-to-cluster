#!/usr/bin/env python3
"""Reject malformed inert task documents before any service starts."""
import argparse
import json
import sys
from common import load_tasks

parser = argparse.ArgumentParser()
parser.add_argument("--input", required=True)
parser.add_argument("--task-count", required=True, type=int)
args = parser.parse_args()
try:
    tasks = load_tasks(args.input)
    if len(tasks) != args.task_count:
        raise ValueError("task count does not match TASK_COUNT")
except (OSError, ValueError, json.JSONDecodeError) as error:
    print(f"invalid input: {error}", file=sys.stderr)
    raise SystemExit(64)
print(json.dumps({"status": "valid", "taskCount": len(tasks)}, sort_keys=True))
