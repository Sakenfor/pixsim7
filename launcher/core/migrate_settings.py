"""
One-time migration: import .env + old settings.json into per-service settings.

After migration, the per-service ``service_settings/*.json`` files become the
single source of truth. The ``.env`` file is renamed to ``.env.bak``.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Dict, Any, Optional

from .paths import LAUNCHER_STATE_DIR, PROJECT_ROOT
from .service_settings import save_persisted, load_persisted

_MARKER = LAUNCHER_STATE_DIR / ".settings_v2"

# .env key → (target_service, setting_key)
_ENV_KEY_MAP: Dict[str, tuple[str, str]] = {
    # Backend ports
    "BACKEND_PORT": ("main-api", "port"),
    "GENERATION_API_PORT": ("generation-api", "port"),
    "LAUNCHER_PORT": ("launcher-api", "port"),
    # Frontend ports
    "LAUNCHER_DEV_PORT": ("launcher-ui", "port"),
    "FRONTEND_PORT": ("frontend", "port"),
    "GAME_FRONTEND_PORT": ("game_frontend", "port"),
    "DEVTOOLS_PORT": ("devtools", "port"),
    "ADMIN_PORT": ("admin", "port"),
    # Infra ports
    "POSTGRES_PORT": ("db", "postgres_port"),
    "REDIS_PORT": ("db", "redis_port"),
    # Base URLs
    "BACKEND_BASE_URL": ("main-api", "base_url"),
    "GENERATION_BASE_URL": ("generation-api", "base_url"),
    "LAUNCHER_BASE_URL": ("launcher-api", "base_url"),
    # Platform
    "DATABASE_URL": ("_platform", "database_url"),
    "REDIS_URL": ("_platform", "redis_url"),
    "SECRET_KEY": ("_platform", "secret_key"),
    "CORS_ORIGINS": ("_platform", "cors_origins"),
    "DEBUG": ("_platform", "debug"),
}

# old settings.json paths → (target_service, setting_key)
_SETTINGS_JSON_MAP: Dict[str, tuple[str, str]] = {
    "logging.sql_logging_enabled": ("_platform", "sql_logging"),
    "logging.worker_debug_flags": ("_platform", "worker_debug_flags"),
    "datastores.use_local_datastores": ("_platform", "use_local_datastores"),
}


def _read_env_file(root: Path) -> Dict[str, str]:
    path = root / ".env"
    if not path.exists():
        return {}
    env: Dict[str, str] = {}
    try:
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    except Exception:
        pass
    return env


def _read_old_settings(root: Path) -> Dict[str, Any]:
    path = LAUNCHER_STATE_DIR / "settings.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _get_nested(data: Dict[str, Any], dotted_key: str) -> Any:
    """Get a value from a nested dict using dotted key like 'logging.sql_logging_enabled'."""
    parts = dotted_key.split(".")
    current: Any = data
    for part in parts:
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def _coerce_port(value: str) -> Optional[int]:
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _coerce_bool(value: str) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in ("true", "1", "yes")
    return None


def maybe_migrate(root: Optional[Path] = None) -> bool:
    """Run migration if .env exists and migration hasn't been done yet.

    Returns True if migration was performed.
    """
    root = root or PROJECT_ROOT
    env_path = root / ".env"

    if _MARKER.exists():
        return False
    if not env_path.exists():
        # No .env to migrate — just create marker
        LAUNCHER_STATE_DIR.mkdir(parents=True, exist_ok=True)
        _MARKER.write_text("migrated (no .env found)")
        return False

    env_vars = _read_env_file(root)
    old_settings = _read_old_settings(root)

    # Collect updates grouped by service key
    updates: Dict[str, Dict[str, Any]] = {}

    # Map .env vars
    for env_key, (svc, setting_key) in _ENV_KEY_MAP.items():
        value = env_vars.get(env_key)
        if value is None:
            continue
        if svc not in updates:
            updates[svc] = {}

        # Coerce ports to int, booleans for DEBUG
        if setting_key in ("port", "postgres_port", "redis_port"):
            coerced = _coerce_port(value)
            if coerced is not None:
                updates[svc][setting_key] = coerced
        elif setting_key == "debug":
            coerced = _coerce_bool(value)
            if coerced is not None:
                updates[svc][setting_key] = coerced
        else:
            updates[svc][setting_key] = value

    # Map old settings.json values
    for dotted_key, (svc, setting_key) in _SETTINGS_JSON_MAP.items():
        value = _get_nested(old_settings, dotted_key)
        if value is None:
            continue
        if svc not in updates:
            updates[svc] = {}
        updates[svc][setting_key] = value

    # Write per-service settings (merge with any existing persisted values)
    for svc_key, values in updates.items():
        existing = load_persisted(svc_key)
        existing.update(values)
        save_persisted(svc_key, existing)

    # Create marker
    LAUNCHER_STATE_DIR.mkdir(parents=True, exist_ok=True)
    _MARKER.write_text(f"migrated from .env ({len(updates)} services)")

    # Rename .env → .env.bak
    bak_path = root / ".env.bak"
    try:
        if bak_path.exists():
            bak_path.unlink()
        env_path.rename(bak_path)
    except Exception:
        pass  # Non-fatal — settings are already migrated

    return True
