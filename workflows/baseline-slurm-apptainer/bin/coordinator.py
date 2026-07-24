#!/usr/bin/env python3
"""Loopback-only coordinating service for bounded inert JSON tasks."""
from __future__ import annotations

import argparse
import json
import signal
import threading
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from common import atomic_json, load_tasks


class State:
    def __init__(self, tasks: list[dict[str, Any]], results_path: str) -> None:
        self.tasks = {task["id"]: task for task in tasks}
        self.pending = deque(self.tasks)
        self.claimed: set[str] = set()
        self.results: dict[str, dict[str, Any]] = {}
        self.results_path = results_path
        self.lock = threading.Lock()
        atomic_json(self.results_path, {"schemaVersion": 1, "results": []})

    def health(self) -> dict[str, Any]:
        return {"status": "ready", "schemaVersion": 1, "taskCount": len(self.tasks)}

    def claim(self) -> dict[str, Any]:
        with self.lock:
            if self.pending:
                task_id = self.pending.popleft()
                self.claimed.add(task_id)
                return {"status": "task", "task": self.tasks[task_id]}
            status = "done" if len(self.results) == len(self.tasks) else "wait"
            return {"status": status}

    def submit(self, result: Any) -> tuple[int, dict[str, Any]]:
        if not isinstance(result, dict) or set(result) != {"taskId", "workerId", "output", "sha256"}:
            return 400, {"error": "invalid result schema"}
        task_id = result.get("taskId")
        if not all(isinstance(result.get(key), str) for key in result):
            return 400, {"error": "result fields must be strings"}
        with self.lock:
            if task_id not in self.tasks or task_id not in self.claimed:
                return 409, {"error": "task was not claimed"}
            if task_id in self.results:
                return 409, {"error": "duplicate task result"}
            self.results[task_id] = result
            atomic_json(self.results_path, {
                "schemaVersion": 1,
                "results": [self.results[key] for key in sorted(self.results)],
            })
            return 201, {"status": "accepted", "remaining": len(self.tasks) - len(self.results)}


class Handler(BaseHTTPRequestHandler):
    server: "CoordinatorServer"

    def send_json(self, status: int, value: Any) -> None:
        body = json.dumps(value, sort_keys=True).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> Any:
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length <= 65536:
            raise ValueError("invalid request size")
        return json.loads(self.rfile.read(length))

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_json(200, self.server.state.health())
        else:
            self.send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        try:
            body = self.read_json()
            if self.path == "/claim":
                if not isinstance(body, dict) or set(body) != {"workerId"}:
                    raise ValueError("invalid claim schema")
                self.send_json(200, self.server.state.claim())
            elif self.path == "/result":
                status, response = self.server.state.submit(body)
                self.send_json(status, response)
            else:
                self.send_json(404, {"error": "not found"})
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error)})

    def log_message(self, template: str, *values: Any) -> None:
        print(f"coordinator: {template % values}", flush=True)


class CoordinatorServer(ThreadingHTTPServer):
    allow_reuse_address = False

    def __init__(self, address: tuple[str, int], state: State) -> None:
        self.state = state
        super().__init__(address, Handler)


parser = argparse.ArgumentParser()
parser.add_argument("--input", required=True)
parser.add_argument("--results", required=True)
parser.add_argument("--endpoint-file", required=True)
args = parser.parse_args()
tasks = load_tasks(args.input)
state = State(tasks, args.results)
server = CoordinatorServer(("127.0.0.1", 0), state)
endpoint = f"http://127.0.0.1:{server.server_port}"
atomic_json(args.endpoint_file, {"schemaVersion": 1, "endpoint": endpoint})
stop = threading.Event()


def request_stop(_signum: int, _frame: Any) -> None:
    stop.set()
    threading.Thread(target=server.shutdown, daemon=True).start()


signal.signal(signal.SIGTERM, request_stop)
signal.signal(signal.SIGINT, request_stop)
print(json.dumps({"event": "coordinator-listening", "endpoint": endpoint}), flush=True)
try:
    server.serve_forever(poll_interval=0.1)
finally:
    server.server_close()
