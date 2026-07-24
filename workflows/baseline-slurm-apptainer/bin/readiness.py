#!/usr/bin/env python3
"""Bounded semantic loopback readiness probe using a monotonic deadline."""
import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument("--endpoint", required=True)
parser.add_argument("--task-count", required=True, type=int)
parser.add_argument("--timeout", required=True, type=float)
parser.add_argument("--interval", type=float, default=0.1)
args = parser.parse_args()
parsed = urllib.parse.urlparse(args.endpoint)
if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost"}:
    print("readiness endpoint must use HTTP loopback", file=sys.stderr)
    raise SystemExit(64)
if not 0 < args.timeout <= 300 or not 0 < args.interval <= 5:
    print("readiness bounds are invalid", file=sys.stderr)
    raise SystemExit(64)
deadline = time.monotonic() + args.timeout
while time.monotonic() < deadline:
    try:
        with urllib.request.urlopen(f"{args.endpoint}/health", timeout=min(1.0, args.timeout)) as response:
            health = json.load(response)
        if response.status == 200 and health == {
            "status": "ready", "schemaVersion": 1, "taskCount": args.task_count
        }:
            print(json.dumps(health, sort_keys=True))
            raise SystemExit(0)
    except (OSError, ValueError, urllib.error.URLError):
        pass
    time.sleep(min(args.interval, max(0.0, deadline - time.monotonic())))
print("coordinator semantic readiness timed out", file=sys.stderr)
raise SystemExit(24)
