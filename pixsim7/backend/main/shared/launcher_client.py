"""Lightweight client for querying the launcher API.

The launcher (when running) exposes a REST API for managing services.
This module provides thin helpers so backend code can coordinate with it
without duplicating URL construction and error handling.

All functions return ``None`` or ``False`` on failure (launcher offline,
service not found, network timeout) — callers should always treat the
launcher as optional.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Optional

_TIMEOUT = 2  # seconds — keep short; launcher is localhost
_RETRIES = 2


def _launcher_url(path: str) -> str:
    port = os.environ.get("LAUNCHER_PORT", "8100")
    return f"http://localhost:{port}{path}"


def get_service_status(service_key: str) -> Optional[dict]:
    """Query launcher for a service's current state.

    Returns the full status dict (key, status, health, pid, ...) or
    ``None`` if the launcher is unreachable or the service doesn't exist.
    """
    for attempt in range(_RETRIES):
        try:
            req = urllib.request.Request(
                _launcher_url(f"/services/{service_key}"),
                headers={"Accept": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception:
            if attempt == _RETRIES - 1:
                return None
            time.sleep(0.15)
    return None


def is_service_running(service_key: str) -> bool:
    """Check if a launcher-managed service is currently running."""
    status = get_service_status(service_key)
    return status is not None and status.get("status") == "running"


def start_service(service_key: str) -> bool:
    """Ask the launcher to start a service.  Returns True on success."""
    try:
        req = urllib.request.Request(
            _launcher_url(f"/services/{service_key}/start"),
            method="POST",
            headers={"Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("success", False)
    except Exception:
        return False


def stop_service(service_key: str) -> bool:
    """Ask the launcher to stop a service.  Returns True on success."""
    try:
        req = urllib.request.Request(
            _launcher_url(f"/services/{service_key}/stop"),
            method="POST",
            headers={"Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("success", False)
    except Exception:
        return False
