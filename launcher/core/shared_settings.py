"""
Shared launcher settings storage.

Provides a small, UI-agnostic settings store for values that should be
consistent across launcher UIs (Qt and web admin).
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Optional
import json
import os


DEFAULT_ROOT = Path(__file__).resolve().parents[2]


@dataclass
class SharedLauncherSettings:
    sql_logging_enabled: bool = False
    worker_debug_flags: str = ""
    backend_log_level: str = "INFO"
    use_local_datastores: bool = False


def _settings_path(root_dir: Optional[Path] = None) -> Path:
    root = root_dir or DEFAULT_ROOT
    return root / "data" / "launcher" / "shared_settings.json"


def _coerce_bool(value: object, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
    return default


def _read_settings_file(path: Path) -> Optional[Dict[str, object]]:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def load_shared_settings(root_dir: Optional[Path] = None) -> SharedLauncherSettings:
    path = _settings_path(root_dir)
    raw = _read_settings_file(path) or {}
    return SharedLauncherSettings(
        sql_logging_enabled=_coerce_bool(raw.get("sql_logging_enabled"), False),
        worker_debug_flags=str(raw.get("worker_debug_flags") or ""),
        backend_log_level=str(raw.get("backend_log_level") or "INFO").upper(),
        use_local_datastores=_coerce_bool(raw.get("use_local_datastores"), False),
    )


def save_shared_settings(
    settings: SharedLauncherSettings,
    root_dir: Optional[Path] = None
) -> None:
    path = _settings_path(root_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(asdict(settings), indent=2), encoding="utf-8")


def update_shared_settings(
    updates: Dict[str, object],
    root_dir: Optional[Path] = None,
    apply_env: bool = True,
) -> SharedLauncherSettings:
    current = load_shared_settings(root_dir)

    if "sql_logging_enabled" in updates:
        current.sql_logging_enabled = _coerce_bool(updates["sql_logging_enabled"])
    if "worker_debug_flags" in updates:
        current.worker_debug_flags = str(updates["worker_debug_flags"] or "")
    if "backend_log_level" in updates:
        current.backend_log_level = str(updates["backend_log_level"] or "INFO").upper()
    if "use_local_datastores" in updates:
        current.use_local_datastores = _coerce_bool(updates["use_local_datastores"])

    save_shared_settings(current, root_dir=root_dir)

    if apply_env:
        apply_shared_settings_to_env(current)

    return current


def shared_settings_to_env(settings: SharedLauncherSettings) -> Dict[str, str]:
    env = {
        "SQL_LOGGING_ENABLED": "1" if settings.sql_logging_enabled else "0",
        "LOG_LEVEL": settings.backend_log_level or "INFO",
        "USE_LOCAL_DATASTORES": "1" if settings.use_local_datastores else "0",
    }
    if settings.worker_debug_flags:
        env["PIXSIM_WORKER_DEBUG"] = settings.worker_debug_flags
    return env


def apply_shared_settings_to_env(settings: SharedLauncherSettings) -> None:
    env = shared_settings_to_env(settings)
    for key, value in env.items():
        os.environ[key] = value
    if not settings.worker_debug_flags and "PIXSIM_WORKER_DEBUG" in os.environ:
        del os.environ["PIXSIM_WORKER_DEBUG"]
