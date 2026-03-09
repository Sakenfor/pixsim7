from __future__ import annotations

from typing import Any, Dict, Optional

PROJECT_RUNTIME_META_KEY = "project_runtime"
PROJECT_META_RUNTIME_MODE = "project_runtime_mode"
PROJECT_META_SYNC_MODE = "project_sync_mode"
PROJECT_META_WATCH_ENABLED = "project_watch_enabled"

LEGACY_BANANZA_RUNTIME_META_KEY = "bananza_runtime"
LEGACY_BANANZA_META_SEEDER_MODE = "bananza_seeder_mode"
LEGACY_BANANZA_META_SYNC_MODE = "bananza_sync_mode"
LEGACY_BANANZA_META_WATCH_ENABLED = "bananza_watch_enabled"


def _is_record(value: Any) -> bool:
    return isinstance(value, dict)


def _normalize_mode(value: Any) -> Optional[str]:
    text = str(value or "").strip().lower()
    if text in {"api", "direct"}:
        return text
    return None


def _normalize_sync_mode(value: Any) -> Optional[str]:
    text = str(value or "").strip().lower()
    if text in {"two_way", "backend_to_file", "file_to_backend", "none"}:
        return text
    return None


def _normalize_bool(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on", "enabled"}:
            return True
        if normalized in {"false", "0", "no", "off", "disabled"}:
            return False
    return None


def read_project_runtime_preferences(meta_value: Any) -> Dict[str, Any]:
    meta = canonicalize_project_runtime_meta(meta_value)
    runtime = (
        dict(meta.get(PROJECT_RUNTIME_META_KEY) or {})
        if _is_record(meta.get(PROJECT_RUNTIME_META_KEY))
        else {}
    )

    mode = _normalize_mode(runtime.get("mode")) or _normalize_mode(
        meta.get(PROJECT_META_RUNTIME_MODE)
    )
    sync_mode = _normalize_sync_mode(runtime.get("sync_mode")) or _normalize_sync_mode(
        meta.get(PROJECT_META_SYNC_MODE)
    )
    watch = _normalize_bool(runtime.get("watch_enabled"))
    if watch is None:
        watch = _normalize_bool(meta.get(PROJECT_META_WATCH_ENABLED))

    return {"mode": mode, "sync_mode": sync_mode, "watch": watch}


def canonicalize_project_runtime_meta(meta_value: Any) -> Dict[str, Any]:
    meta = dict(meta_value) if _is_record(meta_value) else {}

    runtime = {}
    if _is_record(meta.get(PROJECT_RUNTIME_META_KEY)):
        runtime = dict(meta.get(PROJECT_RUNTIME_META_KEY) or {})
    elif _is_record(meta.get(LEGACY_BANANZA_RUNTIME_META_KEY)):
        runtime = dict(meta.get(LEGACY_BANANZA_RUNTIME_META_KEY) or {})

    mode = (
        _normalize_mode(runtime.get("mode"))
        or _normalize_mode(runtime.get("seeder_mode"))
        or _normalize_mode(meta.get(PROJECT_META_RUNTIME_MODE))
        or _normalize_mode(meta.get(LEGACY_BANANZA_META_SEEDER_MODE))
    )
    sync_mode = (
        _normalize_sync_mode(runtime.get("sync_mode"))
        or _normalize_sync_mode(meta.get(PROJECT_META_SYNC_MODE))
        or _normalize_sync_mode(meta.get(LEGACY_BANANZA_META_SYNC_MODE))
    )
    watch_enabled = _normalize_bool(runtime.get("watch_enabled"))
    if watch_enabled is None:
        watch_enabled = _normalize_bool(meta.get(PROJECT_META_WATCH_ENABLED))
    if watch_enabled is None:
        watch_enabled = _normalize_bool(meta.get(LEGACY_BANANZA_META_WATCH_ENABLED))

    meta.pop(LEGACY_BANANZA_RUNTIME_META_KEY, None)
    meta.pop(LEGACY_BANANZA_META_SEEDER_MODE, None)
    meta.pop(LEGACY_BANANZA_META_SYNC_MODE, None)
    meta.pop(LEGACY_BANANZA_META_WATCH_ENABLED, None)

    canonical_runtime: Dict[str, Any] = {}
    if mode is not None:
        canonical_runtime["mode"] = mode
        meta[PROJECT_META_RUNTIME_MODE] = mode
    if sync_mode is not None:
        canonical_runtime["sync_mode"] = sync_mode
        meta[PROJECT_META_SYNC_MODE] = sync_mode
    if watch_enabled is not None:
        canonical_runtime["watch_enabled"] = watch_enabled
        meta[PROJECT_META_WATCH_ENABLED] = watch_enabled

    if canonical_runtime:
        meta[PROJECT_RUNTIME_META_KEY] = canonical_runtime
    else:
        meta.pop(PROJECT_RUNTIME_META_KEY, None)

    return meta
