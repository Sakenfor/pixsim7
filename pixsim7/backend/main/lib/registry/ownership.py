"""
Plugin ownership helpers for registry items.
"""

from __future__ import annotations

from typing import Optional, Protocol, runtime_checkable


@runtime_checkable
class PluginOwned(Protocol):
    plugin_id: Optional[str]
    source_plugin_id: Optional[str]


def get_plugin_owner(value: object) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, dict):
        return value.get("source_plugin_id") or value.get("plugin_id")
    return getattr(value, "source_plugin_id", None) or getattr(value, "plugin_id", None)
