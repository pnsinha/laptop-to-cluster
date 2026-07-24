#!/usr/bin/env python3
"""Bounded worker client for the baseline coordinator."""
import argparse
import hashlib
import json
import re
import time
import urllib.error
import urllib.request

WORKER_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")


def request(endpoint: str, path: str, body: dict) -> dict:
    data = json.dumps(body, sort_keys=True).encode()
    call = urllib.request.Request(
        f"{endpoint}{path}", data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(call, timeout=5) as response:
        return json.load(response)


parser = argparse.ArgumentParser()
parser.add_argument("--endpoint", required=True)
parser.add_argument("--worker-id", required=True)
parser.add_argument("--max-wait", type=float, default=30)
args = parser.parse_args()
if not WORKER_ID.fullmatch(args.worker_id) or not 1 <= args.max_wait <= 300:
    raise SystemExit("invalid worker id or max-wait")
deadline = time.monotonic() + args.max_wait
while time.monotonic() < deadline:
    claim = request(args.endpoint, "/claim", {"workerId": args.worker_id})
    if claim.get("status") == "done":
        print(json.dumps({"status": "complete", "workerId": args.worker_id}, sort_keys=True))
        raise SystemExit(0)
    if claim.get("status") == "wait":
        time.sleep(0.05)
        continue
    task = claim.get("task")
    if claim.get("status") != "task" or not isinstance(task, dict):
        raise SystemExit("coordinator returned an invalid claim")
    payload = task["payload"]
    output = payload["message"] * payload["repeat"]
    result = {
        "taskId": task["id"],
        "workerId": args.worker_id,
        "output": output,
        "sha256": hashlib.sha256(output.encode()).hexdigest(),
    }
    accepted = request(args.endpoint, "/result", result)
    if accepted.get("status") != "accepted":
        raise SystemExit("coordinator rejected result")
raise SystemExit("worker exceeded bounded wait")
