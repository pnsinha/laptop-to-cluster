#!/usr/bin/env python3
"""Verify every invariant, then atomically create the sole success marker."""
import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path

from common import atomic_json, load_tasks, sha256_file

WORKER_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")

parser = argparse.ArgumentParser()
parser.add_argument("--input", required=True)
parser.add_argument("--results", required=True)
parser.add_argument("--expected", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args()
Path(args.output).unlink(missing_ok=True)
try:
    tasks = load_tasks(args.input)
    with open(args.results, encoding="utf-8") as stream:
        actual_doc = json.load(stream)
    with open(args.expected, encoding="utf-8") as stream:
        expected_doc = json.load(stream)
    actual, expected = actual_doc["results"], expected_doc["results"]
    if actual_doc.get("schemaVersion") != 1 or expected_doc.get("schemaVersion") != 1:
        raise ValueError("result documents must use schemaVersion 1")
    if not isinstance(actual, list) or len(actual) != len(tasks):
        raise ValueError("result count does not equal task count")
    if not isinstance(expected, list) or len(expected) != len(tasks):
        raise ValueError("expected result count does not equal task count")
    expected_by_id = {item["taskId"]: item for item in expected}
    if len(expected_by_id) != len(expected):
        raise ValueError("expected task ids are not unique")
    seen: set[str] = set()
    for result in actual:
        if not isinstance(result, dict) or set(result) != {"taskId", "workerId", "output", "sha256"}:
            raise ValueError("actual result schema is invalid")
        task_id = result["taskId"]
        if task_id in seen or task_id not in expected_by_id:
            raise ValueError("actual task ids are duplicate or unexpected")
        if not isinstance(result["output"], str) or not WORKER_ID.fullmatch(result["workerId"]):
            raise ValueError("result output or worker id is invalid")
        digest = hashlib.sha256(result["output"].encode()).hexdigest()
        expected_result = expected_by_id[task_id]
        if result["sha256"] != digest or result["output"] != expected_result["output"]:
            raise ValueError("result content or digest differs from expected")
        if expected_result["sha256"] != digest:
            raise ValueError("expected result digest is invalid")
        seen.add(task_id)
    if seen != {task["id"] for task in tasks}:
        raise ValueError("results do not cover each input task exactly once")
except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
    print(f"verification failed: {error}", file=sys.stderr)
    raise SystemExit(65)

result_digest = sha256_file(args.results)
success = {
    "schemaVersion": 1,
    "status": "success",
    "taskCount": len(tasks),
    "inputSha256": sha256_file(args.input),
    "resultsSha256": result_digest,
    "results": sorted(actual, key=lambda item: item["taskId"]),
}
atomic_json(args.output, success)
print(json.dumps({"status": "verified", "taskCount": len(tasks)}, sort_keys=True))
