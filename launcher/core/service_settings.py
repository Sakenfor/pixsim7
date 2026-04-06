"""
Per-service settings — schema, persistence, and CLI arg generation.

Each service can declare a ``settings`` array in its ``pixsim.service.json``.
Values are persisted per-service under ``LAUNCHER_STATE_DIR/service_settings/``.
This module is independent of the global ``LauncherSettings`` system.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from .paths import LAUNCHER_STATE_DIR

SETTINGS_DIR = LAUNCHER_STATE_DIR / "service_settings"

# ── Type-level base schemas ──
# Every service of a given type inherits these settings automatically.
# Per-service manifests can override defaults (e.g. a different port) or add
# extra fields, but they can never "forget" the fundamentals.

TYPE_BASE_SCHEMAS: Dict[str, List[Dict[str, Any]]] = {
    "backend": [
        {
            "key": "port",
            "type": "number",
            "label": "Port",
            "description": "API server port",
            "default": 8000,
        },
        {
            "key": "reload",
            "type": "boolean",
            "label": "Auto-Reload",
            "description": "Watch for file changes and restart automatically",
            "default": True,
        },
        {
            "key": "log_level",
            "type": "select",
            "label": "Log Level",
            "description": "Uvicorn server log level (app logs use Debug tab)",
            "options": ["debug", "info", "warning", "error"],
            "default": "info",
            "arg_map": "--log-level",
        },
    ],
    "frontend": [
        {
            "key": "port",
            "type": "number",
            "label": "Port",
            "description": "Dev server port",
            "default": 3000,
        },
    ],
    "worker": [
        {
            "key": "log_level",
            "type": "select",
            "label": "Log Level",
            "description": "Python logging level for the worker process",
            "options": ["debug", "info", "warning", "error"],
            "default": "info",
            "env_map": "LOG_LEVEL",
        },
        {
            "key": "max_jobs",
            "type": "number",
            "label": "Max Concurrent Jobs",
            "description": "Maximum number of jobs processed in parallel",
            "default": 30,
            "env_map": "ARQ_MAX_JOBS",
        },
        {
            "key": "job_timeout",
            "type": "number",
            "label": "Job Timeout (s)",
            "description": "Maximum seconds per job before timeout",
            "default": 3600,
            "env_map": "ARQ_JOB_TIMEOUT",
        },
    ],
}


def merge_with_base_schema(
    service_type: str,
    manifest_settings: Optional[List[Dict[str, Any]]],
    *,
    exclude_base: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Merge a manifest's ``settings`` array on top of the base schema for its type.

    - Base fields are always present (unless listed in *exclude_base*).
    - Manifest fields with a matching ``key`` override individual properties
      (e.g. a different ``default``, ``label``, or ``description``).
    - Extra manifest fields (keys not in the base) are appended after the base.
    """
    base = TYPE_BASE_SCHEMAS.get(service_type.lower())
    if not base:
        return list(manifest_settings or [])

    excluded = set(exclude_base or [])

    if not manifest_settings:
        return [dict(f) for f in base if f["key"] not in excluded]

    manifest_by_key = {f["key"]: f for f in manifest_settings if "key" in f}

    merged: List[Dict[str, Any]] = []
    seen_keys: set = set()

    # Base fields first — overlay manifest overrides per-property
    for base_field in base:
        if base_field["key"] in excluded:
            continue
        field = dict(base_field)
        override = manifest_by_key.get(field["key"])
        if override:
            field.update(override)
        merged.append(field)
        seen_keys.add(field["key"])

    # Append any extra manifest-only fields
    for mf in manifest_settings:
        if mf.get("key") and mf["key"] not in seen_keys:
            merged.append(mf)
            seen_keys.add(mf["key"])

    return merged


# ── Schema types ──

FIELD_TYPES = {"string", "number", "boolean", "select", "multi_select"}


def parse_schema(raw: Optional[List[Dict]]) -> List[Dict]:
    """Validate and normalise a raw settings schema from a manifest.
    Returns a list of validated field dicts (or empty list)."""
    if not raw or not isinstance(raw, list):
        return []
    fields: List[Dict] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        key = entry.get("key")
        ftype = entry.get("type", "string")
        if not key or ftype not in FIELD_TYPES:
            continue
        field: Dict[str, Any] = {
            "key": key,
            "type": ftype,
            "label": entry.get("label", key),
            "default": entry.get("default"),
        }
        if entry.get("description"):
            field["description"] = entry["description"]
        if entry.get("options") and ftype in ("select", "multi_select"):
            field["options"] = entry["options"]
        if entry.get("arg_map"):
            field["arg_map"] = entry["arg_map"]
        if entry.get("env_map"):
            field["env_map"] = entry["env_map"]
        fields.append(field)
    return fields


# ── Persistence ──

def _settings_path(service_key: str) -> Path:
    return SETTINGS_DIR / f"{service_key}.json"


def load_persisted(service_key: str) -> Dict[str, Any]:
    """Load persisted setting values for a service (empty dict if none)."""
    path = _settings_path(service_key)
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_persisted(service_key: str, values: Dict[str, Any]) -> None:
    """Write setting values for a service."""
    SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
    path = _settings_path(service_key)
    with path.open("w", encoding="utf-8") as f:
        json.dump(values, f, indent=2)


# ── Merge + resolve ──

def get_effective(schema: List[Dict], persisted: Dict[str, Any]) -> Dict[str, Any]:
    """Merge persisted values over schema defaults. Returns {key: effective_value}."""
    result: Dict[str, Any] = {}
    for field in schema:
        key = field["key"]
        if key in persisted:
            result[key] = _coerce(field, persisted[key])
        else:
            result[key] = field.get("default")
    return result


def _coerce(field: Dict, value: Any) -> Any:
    """Coerce a value to match the field type."""
    ftype = field["type"]
    if ftype == "boolean":
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ("true", "1", "yes")
        return bool(value)
    if ftype == "number":
        try:
            return int(value) if isinstance(value, int) else float(value)
        except (TypeError, ValueError):
            return field.get("default", 0)
    if ftype == "multi_select":
        if isinstance(value, list):
            return value
        return field.get("default", [])
    return value


# ── CLI arg generation ──

def settings_to_args(schema: List[Dict], effective: Dict[str, Any]) -> List[str]:
    """Convert effective settings into CLI arguments using each field's ``arg_map``.

    Rules:
      - boolean + truthy  → ``["--flag"]``
      - boolean + falsy   → omitted
      - multi_select      → ``["--flag", "a,b,c"]`` (comma-joined)
      - other             → ``["--flag", str(value)]``
      - no ``arg_map``    → omitted (setting is UI-only / consumed differently)
    """
    args: List[str] = []
    for field in schema:
        arg = field.get("arg_map")
        if not arg:
            continue
        key = field["key"]
        value = effective.get(key)
        if value is None:
            continue

        ftype = field["type"]
        if ftype == "boolean":
            if value:
                args.append(arg)
        elif ftype == "multi_select":
            if isinstance(value, list) and value:
                args.extend([arg, ",".join(str(v) for v in value)])
        else:
            args.extend([arg, str(value)])
    return args


def settings_to_env(schema: List[Dict], effective: Dict[str, Any]) -> Dict[str, str]:
    """Convert effective settings into environment variables using each field's ``env_map``.

    Rules:
      - boolean + truthy  → ``"1"``
      - boolean + falsy   → ``"0"``
      - multi_select      → ``"a,b,c"`` (comma-joined)
      - other             → ``str(value)``
      - no ``env_map``    → omitted
    """
    env: Dict[str, str] = {}
    for field in schema:
        env_var = field.get("env_map")
        if not env_var:
            continue
        key = field["key"]
        value = effective.get(key)
        if value is None:
            continue

        ftype = field["type"]
        if ftype == "boolean":
            env[env_var] = "1" if value else "0"
        elif ftype == "multi_select":
            if isinstance(value, list) and value:
                env[env_var] = ",".join(str(v) for v in value)
        elif ftype == "select":
            env[env_var] = str(value).upper()
        else:
            env[env_var] = str(value)
    return env


def validate_update(schema: List[Dict], values: Dict[str, Any]) -> Dict[str, Any]:
    """Validate an incoming update dict against the schema.
    Returns only valid keys with coerced values. Unknown keys are dropped."""
    schema_map = {f["key"]: f for f in schema}
    result: Dict[str, Any] = {}
    for key, value in values.items():
        field = schema_map.get(key)
        if not field:
            continue
        result[key] = _coerce(field, value)
    return result
