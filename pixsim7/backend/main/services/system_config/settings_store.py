"""
In-memory stores for provider and media settings (DB-backed via system_config).

These module-level caches are populated on startup by the applier registry
and updated on every write. Consumers can read synchronously without a DB session.
"""
from __future__ import annotations

from typing import Any


# ---------------------------------------------------------------------------
# Generic namespace cache (used by SettingsBase subclasses)
# ---------------------------------------------------------------------------

_namespace_caches: dict[str, dict[str, Any]] = {}


def get_settings_data(namespace: str) -> dict[str, Any]:
    """Read settings for any namespace from in-memory cache."""
    return dict(_namespace_caches.get(namespace, {}))


def apply_settings(namespace: str, data: dict) -> None:
    """Applier callback: project data onto the generic namespace cache."""
    _namespace_caches[namespace] = dict(data) if data else {}

# ---------------------------------------------------------------------------
# Provider settings cache
# ---------------------------------------------------------------------------

_provider_settings_cache: dict[str, dict[str, Any]] = {}

_PROVIDER_DEFAULTS: dict[str, Any] = {
    "global_password": None,
    "auto_reauth_enabled": True,
    "auto_reauth_max_retries": 3,
}


def get_provider_settings(provider_id: str) -> dict[str, Any]:
    """Read provider settings from in-memory cache. No DB session needed."""
    cached = _provider_settings_cache.get(provider_id)
    if cached is not None:
        return cached
    return {"provider_id": provider_id, **_PROVIDER_DEFAULTS}


def get_all_provider_settings() -> dict[str, dict[str, Any]]:
    """Return the full provider settings cache."""
    return dict(_provider_settings_cache)


def apply_provider_settings(data: dict) -> None:
    """Applier callback: project DB data onto the in-memory cache."""
    _provider_settings_cache.clear()
    if data:
        _provider_settings_cache.update(data)


# ---------------------------------------------------------------------------
# Media settings — delegates to generic namespace cache
# ---------------------------------------------------------------------------


def apply_media_settings(data: dict) -> None:
    """Applier callback: delegates to the generic namespace cache."""
    apply_settings("media_settings", data)
