"""
RegistryGroup - aggregate cleanup for related registries.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from pixsim7.backend.main.lib.registry.base import RegistryBase
from pixsim7.backend.main.lib.registry.ownership import get_plugin_owner


@dataclass(frozen=True)
class _RegistryEntry:
    registry: object
    plugin_attr: str


class RegistryGroup(RegistryBase):
    """Aggregate operations over multiple registries or dict-based stores."""

    def __init__(self, name: str):
        super().__init__(name=name, log_operations=False, plugin_aware=False)
        self._registries: Dict[str, _RegistryEntry] = {}

    def register_registry(
        self,
        name: str,
        registry: object,
        *,
        plugin_attr: str = "plugin_id",
    ) -> None:
        self._registries[name] = _RegistryEntry(registry=registry, plugin_attr=plugin_attr)

    def list_registries(self) -> Dict[str, object]:
        return {name: entry.registry for name, entry in self._registries.items()}

    def unregister_by_plugin(self, plugin_id: str) -> Dict[str, int]:
        results: Dict[str, int] = {}
        for name, entry in self._registries.items():
            registry = entry.registry
            if hasattr(registry, "unregister_by_plugin"):
                results[name] = registry.unregister_by_plugin(plugin_id)
                continue
            if isinstance(registry, dict):
                results[name] = _remove_by_plugin_attr(
                    registry,
                    plugin_id,
                    entry.plugin_attr,
                )
                continue
            results[name] = 0
        return results


def _remove_by_plugin_attr(
    registry: Dict[str, Any],
    plugin_id: str,
    plugin_attr: str,
) -> int:
    to_remove = [
        key
        for key, item in registry.items()
        if _get_plugin_attr(item, plugin_attr) == plugin_id
    ]
    for key in to_remove:
        del registry[key]
    return len(to_remove)


def _get_plugin_attr(value: object, plugin_attr: str) -> Optional[str]:
    if plugin_attr in ("plugin_id", "source_plugin_id"):
        return get_plugin_owner(value)
    if isinstance(value, dict):
        return value.get(plugin_attr)
    return getattr(value, plugin_attr, None)
