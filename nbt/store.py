"""Tiny JSON-on-disk helpers. Data is committed to the repo so history accumulates."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any


def read_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return default


def write_json(path: Path, data: Any, *, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    if compact:
        tmp.write_text(json.dumps(data, separators=(",", ":"), sort_keys=True))
    else:
        tmp.write_text(json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n")
    tmp.replace(path)


class Cache:
    """Key/value cache with a TTL, persisted as one JSON file per namespace."""

    def __init__(self, path: Path, ttl_days: float):
        self.path = path
        self.ttl = ttl_days * 86400
        self._data: dict[str, list] = read_json(path, {})
        self._dirty = False

    def get(self, key: str) -> Any:
        hit = self._data.get(key)
        if hit and time.time() - hit[0] < self.ttl:
            return hit[1]
        return None

    def set(self, key: str, value: Any) -> None:
        self._data[key] = [int(time.time()), value]
        self._dirty = True

    def save(self) -> None:
        if self._dirty:
            write_json(self.path, self._data, compact=True)
            self._dirty = False
