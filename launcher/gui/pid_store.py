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


def _load_pids() -> Dict[str, int]:
    """Load PIDs from disk."""
    if not os.path.exists(PID_FILE):
        return {}
    try:
        with open(PID_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return {k: int(v) for k, v in data.items() if v}
    except Exception:
        return {}


def _save_pids(pids: Dict[str, int]):
    """Save PIDs to disk."""
    _ensure_data_dir()
    try:
        with open(PID_FILE, 'w', encoding='utf-8') as f:
            json.dump(pids, f, indent=2)
    except Exception:
        pass


def save_pid(service_key: str, pid: int):
    """Save a service PID to persistent storage."""
    if not pid:
        return
    try:
        pids = _load_pids()
        pids[service_key] = pid
        _save_pids(pids)
    except Exception:
        pass


def get_pid(service_key: str) -> Optional[int]:
    """Get a persisted PID for a service."""
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
    return _load_pids()


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
    active_pids = {}
    for key, pid in pids.items():
        if is_pid_running(pid):
            active_pids[key] = pid
    if len(active_pids) != len(pids):
        _save_pids(active_pids)
    return active_pids
