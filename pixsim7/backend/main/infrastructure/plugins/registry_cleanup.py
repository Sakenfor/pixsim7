"""
Registry cleanup hooks for plugin lifecycle events.
"""

from __future__ import annotations

import logging

from pixsim7.backend.main.infrastructure.plugins.types import (
    plugin_hooks,
    PluginEvents,
)
from pixsim7.backend.main.lib.registry import RegistryBase
logger = logging.getLogger(__name__)
_hooks_registered = False


def setup_registry_cleanup_hooks() -> None:
    """Register cleanup hooks for plugin lifecycle events."""
    global _hooks_registered
    if _hooks_registered:
        return

    try:
        plugin_hooks.register(PluginEvents.PLUGIN_DISABLED, _on_plugin_disabled)
        _hooks_registered = True
    except Exception as exc:
        logger.warning(
            "registry_cleanup_hooks_failed",
            error=str(exc),
            error_type=exc.__class__.__name__,
        )


def _on_plugin_disabled(plugin_id: str) -> None:
    registry_results = RegistryBase.unregister_plugin_from_all(plugin_id)
    if registry_results.total_removed or registry_results.errors:
        logger.info(
            "plugin_registry_cleanup",
            plugin_id=plugin_id,
            registries=registry_results.to_dict(),
        )
