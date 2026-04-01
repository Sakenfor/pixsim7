"""
In-memory stores for settings (DB-backed via system_config).

Generic namespace cache is delegated to the shared pixsim_settings package.
Provider and media caches remain here (app-specific).
"""
from __future__ import annotations

from typing import Any

# Re-export generic store from shared package
from pixsim_settings.store import (  # noqa: F401
    get_settings_data,
    apply_settings,
)


# ---------------------------------------------------------------------------
# Provider settings cache (app-specific)
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
