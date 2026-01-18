"""
Registry base classes and mixins.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional, Union
import structlog

logger = structlog.get_logger(__name__)

RegistryListener = Callable[[str, Dict[str, Any]], None]

from pixsim7.backend.main.lib.registry.cleanup import RegistryCleanupResult


class RegistryBase:
    """Shared base for registry implementations."""

    # Class-level tracking of plugin-aware registries
    _plugin_aware_registries: List["RegistryBase"] = []

    def __init__(
        self,
        *,
        name: Optional[str] = None,
        log_operations: bool = True,
        plugin_aware: bool = False,
        **_: Any,
    ):
        self._name = name or self.__class__.__name__
        self._log_operations = log_operations
        self._plugin_aware = plugin_aware

        if plugin_aware:
            manager = _get_registry_manager()
            if manager:
                manager.register(self)
            else:
                RegistryBase._plugin_aware_registries.append(self)

    @property
    def name(self) -> str:
        """Registry name for logging/errors."""
        return self._name

    @property
    def log_operations(self) -> bool:
        """Whether registry operations should log."""
        return self._log_operations

    @property
    def plugin_aware(self) -> bool:
        """Whether this registry tracks plugin ownership."""
        return self._plugin_aware

    def _seed_defaults(self) -> None:
        """Seed default items on init/reset."""
        pass

    def _on_reset(self) -> None:
        """Hook called before reset clears items."""
        pass

    def _log_debug(self, message: str, **kwargs: Any) -> None:
        if self._log_operations:
            logger.debug(message, registry=self._name, **kwargs)

    def unregister_by_plugin(self, plugin_id: str) -> Union[int, Dict[str, int]]:
        """
        Remove all items registered by a plugin.

        Override in subclasses to implement plugin cleanup.
        Returns count of removed items (int) or counts by category (dict).
        """
        raise NotImplementedError(
            f"{self._name}.unregister_by_plugin() must be implemented for plugin_aware registries"
        )

    # =========================================================================
    # Class-level plugin management
    # =========================================================================

    @classmethod
    def register_plugin_aware(cls, registry: "RegistryBase") -> None:
        """
        Manually register a plugin-aware registry.

        Use this for registries that don't inherit from RegistryBase
        but implement unregister_by_plugin().
        """
        manager = _get_registry_manager()
        if manager:
            manager.register(registry)
        elif registry not in cls._plugin_aware_registries:
            cls._plugin_aware_registries.append(registry)

    @classmethod
    def unregister_plugin_from_all(cls, plugin_id: str) -> RegistryCleanupResult:
        """
        Remove all extensions from a plugin across ALL plugin-aware registries.

        Returns dict mapping registry name to removal counts.
        """
        manager = _get_registry_manager()
        if manager:
            return manager.unregister_plugin_from_all(plugin_id)
        results: Dict[str, Any] = {}
        errors: Dict[str, str] = {}
        for registry in cls._plugin_aware_registries:
            try:
                results[registry.name] = registry.unregister_by_plugin(plugin_id)
            except NotImplementedError:
                logger.warning(
                    "Registry marked plugin_aware but missing unregister_by_plugin",
                    registry=registry.name,
                )
            except Exception as e:
                logger.error(
                    "Failed to unregister plugin from registry",
                    registry=registry.name,
                    plugin_id=plugin_id,
                    error=str(e),
                )
                results[registry.name] = {"error": str(e)}
                errors[registry.name] = str(e)
        return RegistryCleanupResult(registries=results, errors=errors)

    @classmethod
    def list_plugin_aware_registries(cls) -> List[str]:
        """List names of all plugin-aware registries."""
        manager = _get_registry_manager()
        if manager:
            return manager.list_registries()
        return [r.name for r in cls._plugin_aware_registries]


def _get_registry_manager():
    try:
        from pixsim7.backend.main.lib.registry.manager import get_registry_manager
    except Exception:
        return None
    return get_registry_manager()


class RegistryObserverMixin:
    """Optional observer mixin for registry change events."""

    def __init__(self, *args: Any, **kwargs: Any):
        self._listeners: List[RegistryListener] = []
        super().__init__(*args, **kwargs)

    def add_listener(self, listener: RegistryListener) -> None:
        """Register a change listener."""
        self._listeners.append(listener)

    def remove_listener(self, listener: RegistryListener) -> None:
        """Remove a change listener if present."""
        try:
            self._listeners.remove(listener)
        except ValueError:
            pass

    def _notify_listeners(self, event: str, **payload: Any) -> None:
        if not self._listeners:
            return
        for listener in list(self._listeners):
            try:
                listener(event, payload)
            except Exception:
                logger.exception(
                    "registry_listener_failed",
                    registry=getattr(self, "_name", "registry"),
                    event=event,
                )
