"""
PID Store - Persists service PIDs across launcher restarts.

Saves PIDs to a JSON file so the launcher can control services
even after being restarted while services are still running.
"""

import json
import os
from typing import Optional, Dict

try:
    from .config import ROOT
except ImportError:
    from config import ROOT


PID_FILE = os.path.join(ROOT, 'data', 'pids.json')


def _ensure_data_dir():
    """Ensure data directory exists."""
    data_dir = os.path.dirname(PID_FILE)
    os.makedirs(data_dir, exist_ok=True)


def _normalize_pid_entry(value) -> Optional[Dict[str, object]]:
    """Normalize PID entries from disk (supports legacy int format)."""
    if value is None:
        return None
    if isinstance(value, dict):
        pid = value.get("pid") or value.get("PID")
        if not pid:
            return None
        entry = {"pid": int(pid)}
        for key in ("port", "cmdline", "start_time", "started_at"):
            if key in value and value[key]:
                entry[key] = value[key]
        return entry
    try:
        return {"pid": int(value)}
    except Exception:
        return None


def _load_pids() -> Dict[str, Dict[str, object]]:
    """Load PIDs from disk."""
    if not os.path.exists(PID_FILE):
        return {}
    try:
        with open(PID_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        entries: Dict[str, Dict[str, object]] = {}
        for key, value in data.items():
            entry = _normalize_pid_entry(value)
            if entry:
                entries[str(key)] = entry
        return entries
    except Exception:
        return {}


def _save_pids(pids: Dict[str, Dict[str, object]]):
    """Save PIDs to disk."""
    _ensure_data_dir()
    try:
        with open(PID_FILE, 'w', encoding='utf-8') as f:
            json.dump(pids, f, indent=2)
    except Exception:
        pass


def save_pid(service_key: str, pid: int, metadata: Optional[Dict[str, object]] = None):
    """Save a service PID to persistent storage."""
    if not pid:
        return
    try:
        entry: Dict[str, object] = {"pid": int(pid)}
        if metadata:
            for key in ("port", "cmdline", "start_time", "started_at"):
                if key in metadata and metadata[key] is not None:
                    entry[key] = metadata[key]
        pids = _load_pids()
        pids[service_key] = entry
        _save_pids(pids)
    except Exception:
        pass


def get_pid(service_key: str) -> Optional[int]:
    """Get a persisted PID for a service."""
    pids = _load_pids()
    entry = pids.get(service_key)
    if entry:
        try:
            return int(entry.get("pid"))
        except Exception:
            return None
    return None


def get_pid_entry(service_key: str) -> Optional[Dict[str, object]]:
    """Get the persisted PID entry (pid + metadata) for a service."""
    pids = _load_pids()
    return pids.get(service_key)


def clear_pid(service_key: str):
    """Clear a service PID from persistent storage."""
    try:
        pids = _load_pids()
        if service_key in pids:
            del pids[service_key]
            _save_pids(pids)
    except Exception:
        pass


def get_all_pids() -> Dict[str, int]:
    """Get all persisted PIDs."""
    entries = _load_pids()
    return {key: int(entry.get("pid")) for key, entry in entries.items() if entry.get("pid")}


def is_pid_running(pid: int) -> bool:
    """Check if a PID is still running."""
    if not pid:
        return False
    try:
        if os.name == 'nt':
            import subprocess
            result = subprocess.run(
                ['tasklist', '/FI', f'PID eq {pid}', '/NH'],
                capture_output=True,
                text=True,
                timeout=5
            )
            # tasklist returns the process if it exists
            return str(pid) in result.stdout
        else:
            # Unix: signal 0 checks if process exists
            os.kill(pid, 0)
            return True
    except (ProcessLookupError, PermissionError):
        return False
    except Exception:
        return False


def cleanup_stale_pids():
    """Remove PIDs for processes that are no longer running."""
    pids = _load_pids()
    active_pids: Dict[str, Dict[str, object]] = {}
    for key, entry in pids.items():
        try:
            pid = int(entry.get("pid"))
        except Exception:
            continue
        if is_pid_running(pid):
            active_pids[key] = entry
    if len(active_pids) != len(pids):
        _save_pids(active_pids)
    return active_pids
