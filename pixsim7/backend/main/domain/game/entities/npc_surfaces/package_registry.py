"""
NPC Surface Package Registry

Provides a plugin-extensible registry for NPC surface packages. An NPC surface
package is a reusable bundle of surface type definitions (e.g. portrait,
closeup, dialogue) plus light metadata that tools and worlds can discover
and use.

Uses SimpleRegistry base class for standard registry operations.

This module is intentionally world-agnostic: it does not depend on GameWorld
or GameSession. Worlds/projects can choose which surface packages they use
via GameWorld.meta configuration or other configuration layers.

A "surface" represents a visual expression context for an NPC:
- portrait: Standard portrait for dialogue UI
- dialogue: Talking/conversation animation
- closeup: Close-up shot (e.g. for intimate scenes)
- reaction_clip: Short reaction animation
- mood_*: Mood-based expressions (happy, sad, angry, etc.)

Plugins can define custom surface types:
- game-romance: closeup_kiss, closeup_embrace, etc.
- game-stealth: alert_portrait, caught_in_the_act, etc.
- mood-system: mood_very_happy, mood_anxious, etc.
"""

from __future__ import annotations

from typing import Dict, List, Tuple, Optional, Any
from pydantic import BaseModel, Field
import logging

from pixsim7.backend.main.lib.registry import SimpleRegistry

logger = logging.getLogger(__name__)


class NpcSurfacePackage(BaseModel):
    """
    Metadata and surface type definitions for an NPC surface package.

    Examples:
        - id="core.portrait" with surface_types={"portrait": {...}, "dialogue": {...}}
        - id="plugin.game-romance.closeup" with surface_types={"closeup_kiss": {...}}
    """

    id: str = Field(description="Unique package ID (e.g. 'core.portrait')")
    label: str = Field(description="Human-readable name for UIs")
    description: Optional[str] = Field(default=None, description="Optional longer description")
    category: Optional[str] = Field(
        default=None,
        description="Optional category (e.g. 'portrait', 'closeup', 'dialogue')"
    )
    surface_types: Dict[str, Dict[str, Any]] = Field(
        default_factory=dict,
        description="Map of surface_type_id -> metadata about that surface type"
    )
    source_plugin_id: Optional[str] = Field(
        default=None,
        description="Plugin ID that registered this package, or None for built-in"
    )


class NpcSurfacePackageRegistry(SimpleRegistry[str, NpcSurfacePackage]):
    """
    Registry for NPC surface packages.

    Extends SimpleRegistry with surface-specific query methods.
    """

    def __init__(self) -> None:
        super().__init__(name="NpcSurfacePackageRegistry", log_operations=False)

    def _get_item_key(self, item: NpcSurfacePackage) -> str:
        return item.id

    def _on_reset(self) -> None:
        """Reset the core package registration flag."""
        from .core_surfaces import reset_core_surface_registration
        reset_core_surface_registration()

    def register_package(self, pkg: NpcSurfacePackage) -> None:
        """Register or overwrite an NPC surface package."""
        existing = self._items.get(pkg.id)
        if existing:
            logger.warning(
                "Overwriting existing NPC surface package",
                extra={
                    "package_id": pkg.id,
                    "old_plugin": existing.source_plugin_id,
                    "new_plugin": pkg.source_plugin_id
                },
            )
        self._items[pkg.id] = pkg
        logger.info(
            "Registered NPC surface package",
            extra={
                "package_id": pkg.id,
                "surface_types": list(pkg.surface_types.keys()),
                "source_plugin_id": pkg.source_plugin_id,
            },
        )

    def find_surface_types(
        self, surface_type_id: str
    ) -> List[Tuple[NpcSurfacePackage, Dict[str, Any]]]:
        """
        Find all surface type definitions with the given ID across all packages.

        Returns a list of (NpcSurfacePackage, surface_type_metadata) pairs.
        """
        results: List[Tuple[NpcSurfacePackage, Dict[str, Any]]] = []
        for pkg in self._items.values():
            if surface_type_id in pkg.surface_types:
                results.append((pkg, pkg.surface_types[surface_type_id]))
        return results


# Singleton instance
_registry = NpcSurfacePackageRegistry()


# Public API functions (backwards compatible)
def register_npc_surface_package(pkg: NpcSurfacePackage) -> None:
    """Register or overwrite an NPC surface package."""
    _registry.register_package(pkg)


def get_npc_surface_package(package_id: str) -> Optional[NpcSurfacePackage]:
    """Get an NPC surface package by ID, or None if not registered."""
    return _registry.get(package_id) if _registry.has(package_id) else None


def list_npc_surface_packages() -> Dict[str, NpcSurfacePackage]:
    """Return a snapshot of all registered NPC surface packages."""
    return {
        key: pkg.model_copy(deep=True)
        for key, pkg in _registry._items.items()
    }


def find_surface_types(
    surface_type_id: str,
) -> List[Tuple[NpcSurfacePackage, Dict[str, Any]]]:
    """Find all surface type definitions with the given ID across all packages."""
    return _registry.find_surface_types(surface_type_id)


def clear_npc_surface_packages() -> None:
    """Clear all registered packages. Mainly for testing."""
    _registry.reset()  # Calls _on_reset() to reset registration flag
