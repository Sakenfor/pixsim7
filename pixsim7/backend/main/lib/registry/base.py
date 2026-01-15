"""
Registry base classes and mixins.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional
import structlog

logger = structlog.get_logger(__name__)

RegistryListener = Callable[[str, Dict[str, Any]], None]


class RegistryBase:
    """Shared base for registry implementations."""

    def __init__(
        self,
        *,
        name: Optional[str] = None,
        log_operations: bool = True,
        **_: Any,
    ):
        self._name = name or self.__class__.__name__
        self._log_operations = log_operations

    @property
    def name(self) -> str:
        """Registry name for logging/errors."""
        return self._name

    @property
    def log_operations(self) -> bool:
        """Whether registry operations should log."""
        return self._log_operations

    def _seed_defaults(self) -> None:
        """Seed default items on init/reset."""
        pass

    def _on_reset(self) -> None:
        """Hook called before reset clears items."""
        pass

    def _log_debug(self, message: str, **kwargs: Any) -> None:
        if self._log_operations:
            logger.debug(message, registry=self._name, **kwargs)


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
