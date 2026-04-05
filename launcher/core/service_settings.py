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
