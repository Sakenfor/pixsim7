"""
In-memory settings store.

A simple namespace → dict cache populated by each consumer's persistence
layer (DB appliers, JSON loader, etc.). Consumers read synchronously
without needing a DB session.
"""
from __future__ import annotations

from typing import Any


_namespace_caches: dict[str, dict[str, Any]] = {}


def get_settings_data(namespace: str) -> dict[str, Any]:
    """Read settings for any namespace from in-memory cache."""
    return dict(_namespace_caches.get(namespace, {}))


def apply_settings(namespace: str, data: dict) -> None:
    """Write settings for a namespace into the in-memory cache."""
    _namespace_caches[namespace] = dict(data) if data else {}
