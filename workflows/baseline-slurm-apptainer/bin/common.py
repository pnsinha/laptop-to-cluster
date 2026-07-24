#!/usr/bin/env python3
"""Shared validation and atomic JSON helpers for the baseline workflow."""
from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any

TASK_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
MAX_TASKS = 256
MAX_MESSAGE = 256
MAX_REPEAT = 100


def canonical(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(65536), b""):
            digest.update(block)
    return digest.hexdigest()


def load_tasks(path: str | Path) -> list[dict[str, Any]]:
    with open(path, encoding="utf-8") as stream:
        document = json.load(stream)
    if not isinstance(document, dict) or document.get("schemaVersion") != 1:
        raise ValueError("input must be a schemaVersion 1 object")
    tasks = document.get("tasks")
    if not isinstance(tasks, list) or not 1 <= len(tasks) <= MAX_TASKS:
        raise ValueError(f"tasks must contain 1..{MAX_TASKS} items")
    seen: set[str] = set()
    for task in tasks:
        if not isinstance(task, dict) or set(task) != {"id", "payload"}:
            raise ValueError("each task must contain only id and payload")
        task_id, payload = task["id"], task["payload"]
        if not isinstance(task_id, str) or not TASK_ID.fullmatch(task_id) or task_id in seen:
            raise ValueError("task ids must be unique bounded identifiers")
        if not isinstance(payload, dict) or set(payload) != {"message", "repeat"}:
            raise ValueError("payload must contain only message and repeat")
        message, repeat = payload["message"], payload["repeat"]
        if not isinstance(message, str) or not 1 <= len(message) <= MAX_MESSAGE:
            raise ValueError(f"message length must be 1..{MAX_MESSAGE}")
        if isinstance(repeat, bool) or not isinstance(repeat, int) or not 1 <= repeat <= MAX_REPEAT:
            raise ValueError(f"repeat must be an integer in 1..{MAX_REPEAT}")
        seen.add(task_id)
    return tasks


def atomic_json(path: str | Path, value: Any) -> None:
    target = Path(path)
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(canonical(value))
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
