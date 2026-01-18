"""
RegistryManager - central coordination for plugin-aware registries.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional
import weakref
import structlog

logger = structlog.get_logger(__name__)

from pixsim7.backend.main.lib.registry.cleanup import RegistryCleanupResult


class RegistryManager:
    """Tracks registries and coordinates cross-registry operations."""

    def __init__(self) -> None:
        self._registries: "weakref.WeakSet[object]" = weakref.WeakSet()

    def register(self, registry: object) -> None:
        """Register a registry for coordinated operations."""
        self._registries.add(registry)

    def unregister(self, registry: object) -> None:
        """Unregister a registry."""
        try:
            self._registries.remove(registry)
        except KeyError:
            pass

    def register_many(self, registries: Iterable[object]) -> None:
        """Register multiple registries."""
        for registry in registries:
            self.register(registry)

    def registries(self) -> List[object]:
        """Return tracked registry instances."""
        return list(self._registries)

    def list_registries(self) -> List[str]:
        """List names of all tracked registries."""
        return [
            getattr(registry, "name", registry.__class__.__name__)
            for registry in self._registries
        ]

    def unregister_plugin_from_all(self, plugin_id: str) -> RegistryCleanupResult:
        """
        Remove all extensions from a plugin across ALL tracked registries.

        Returns dict mapping registry name to removal counts.
        """
        results: Dict[str, Any] = {}
        errors: Dict[str, str] = {}
        for registry in list(self._registries):
            try:
                results[registry.name] = registry.unregister_by_plugin(plugin_id)
            except AttributeError:
                logger.warning(
                    "Registry missing unregister_by_plugin",
                    registry=getattr(registry, "name", registry.__class__.__name__),
                )
            except NotImplementedError:
                logger.warning(
                    "Registry marked plugin_aware but missing unregister_by_plugin",
                    registry=getattr(registry, "name", registry.__class__.__name__),
                )
            except Exception as e:
                name = getattr(registry, "name", registry.__class__.__name__)
                logger.error(
                    "Failed to unregister plugin from registry",
                    registry=name,
                    plugin_id=plugin_id,
                    error=str(e),
                )
                results[name] = {"error": str(e)}
                errors[name] = str(e)
        return RegistryCleanupResult(registries=results, errors=errors)


_DEFAULT_MANAGER: Optional[RegistryManager] = None


def get_registry_manager() -> RegistryManager:
    """Return the process-wide RegistryManager singleton."""
    global _DEFAULT_MANAGER
    if _DEFAULT_MANAGER is None:
        _DEFAULT_MANAGER = RegistryManager()
    return _DEFAULT_MANAGER


def set_registry_manager(manager: RegistryManager, *, migrate: bool = True) -> None:
    """Set the process-wide RegistryManager singleton."""
    global _DEFAULT_MANAGER
    previous = _DEFAULT_MANAGER
    _DEFAULT_MANAGER = manager
    if migrate and previous is not None and previous is not manager:
        manager.register_many(previous.registries())
