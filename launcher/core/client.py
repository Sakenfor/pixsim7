"""Lightweight HTTP client for the launcher REST API.

The launcher (when running) exposes a REST API for managing services.
This module provides thin helpers so any consumer (backend, bridge, CLI)
can coordinate with it without duplicating URL construction and error handling.

All functions return ``None`` or ``False`` on failure (launcher offline,
service not found, network timeout) — callers should always treat the
launcher as optional.

Usage::

    from launcher.core.client import get_service_status, start_service

    status = get_service_status("ai-client")
    if status and status.get("status") == "running":
        ...
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


# ── Generic service operations ──────────────────────────────────────


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


# ── Service settings ────────────────────────────────────────────────


def get_service_settings(service_key: str) -> Optional[dict]:
    """Fetch schema + current values for a service.

    Returns ``{"service_key": str, "schema": [...], "values": {...}}``
    or ``None`` if the launcher is unreachable.
    """
    try:
        req = urllib.request.Request(
            _launcher_url(f"/services/{service_key}/settings"),
            headers={"Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def update_service_settings(service_key: str, values: dict) -> Optional[dict]:
    """Update settings for a service.

    Returns updated ``{"service_key": str, "schema": [...], "values": {...}}``
    or ``None`` if the launcher is unreachable.
    """
    body = json.dumps({"values": values}).encode()
    try:
        req = urllib.request.Request(
            _launcher_url(f"/services/{service_key}/settings"),
            data=body,
            method="PATCH",
            headers={"Accept": "application/json", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


# ── AI-client hook config ───────────────────────────────────────────


def get_hook_config() -> Optional[dict]:
    """Read current hook config from the launcher.

    Returns ``{"hook_tools": [...], "mcp_allowed": bool, "hook_configured": bool}``
    or ``None`` if the launcher is unreachable.
    """
    try:
        req = urllib.request.Request(
            _launcher_url("/services/ai-client/hook-config"),
            headers={"Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def apply_hook_config(hook_tools: list[str], mcp_allowed: bool = True) -> Optional[dict]:
    """Write hook config via the launcher.

    Returns response dict ``{"ok": bool, "path": str, "message": str}``
    or ``None`` if the launcher is unreachable.
    """
    body = json.dumps({"hook_tools": hook_tools, "mcp_allowed": mcp_allowed}).encode()
    try:
        req = urllib.request.Request(
            _launcher_url("/services/ai-client/apply-hook-config"),
            data=body,
            method="POST",
            headers={"Accept": "application/json", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None
