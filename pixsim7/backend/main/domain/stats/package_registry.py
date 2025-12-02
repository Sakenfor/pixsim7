"""
Stat Package Registry

Provides a plugin-extensible registry for stat packages. A stat package
is a reusable bundle of StatDefinition objects (e.g. relationships,
combat, economy) plus light metadata that tools and worlds can
discover and install.

This module is intentionally world-agnostic: it does not depend on
GameWorld or GameSession. Worlds/projects can choose which packages
and definitions to use via GameWorld.meta.stats_config or other
configuration layers.
"""

from __future__ import annotations

from typing import Dict, List, Tuple, Optional
from pydantic import BaseModel, Field
import logging

from .schemas import StatDefinition

logger = logging.getLogger(__name__)


class StatPackage(BaseModel):
    """
    Metadata and definitions for a stat package.

    Examples:
        - id="core.relationships" with definitions["relationships"]
        - id="core.attributes" with definitions["attributes"]
        - id="plugin.game-romance.relationships" with plugin-provided variants
    """

    id: str = Field(description="Unique package ID (e.g. 'core.relationships')")
    label: str = Field(description="Human-readable name for UIs")
    description: Optional[str] = Field(default=None, description="Optional longer description")
    category: Optional[str] = Field(
        default=None,
        description="Optional category (e.g. 'social', 'combat', 'economy')"
    )
    definitions: Dict[str, StatDefinition] = Field(
        default_factory=dict,
        description="Map of stat_definition_id -> StatDefinition"
    )
    source_plugin_id: Optional[str] = Field(
        default=None,
        description="Plugin ID that registered this package, or None for built-in"
    )


_packages: Dict[str, StatPackage] = {}


def register_stat_package(pkg: StatPackage) -> None:
    """
    Register or overwrite a stat package.

    This can be called by core modules or backend plugins during startup.
    If a package with the same ID already exists, it will be replaced and
    a warning will be logged.
    """
    existing = _packages.get(pkg.id)
    if existing:
        logger.warning(
            "Overwriting existing stat package",
            extra={"package_id": pkg.id, "old_plugin": existing.source_plugin_id, "new_plugin": pkg.source_plugin_id},
        )
    _packages[pkg.id] = pkg
    logger.info(
        "Registered stat package",
        extra={
            "package_id": pkg.id,
            "definitions": list(pkg.definitions.keys()),
            "source_plugin_id": pkg.source_plugin_id,
        },
    )


def get_stat_package(package_id: str) -> Optional[StatPackage]:
    """Get a stat package by ID, or None if not registered."""
    return _packages.get(package_id)


def list_stat_packages() -> Dict[str, StatPackage]:
    """Return a snapshot of all registered stat packages."""
    return dict(_packages)


def find_stat_definitions(stat_definition_id: str) -> List[Tuple[StatPackage, StatDefinition]]:
    """
    Find all StatDefinition instances with the given ID across all packages.

    Returns a list of (StatPackage, StatDefinition) pairs. This can be used
    by tools to discover which packages provide a particular stat definition
    (e.g. multiple plugins providing 'relationships').
    """
    results: List[Tuple[StatPackage, StatDefinition]] = []
    for pkg in _packages.values():
        if stat_definition_id in pkg.definitions:
            results.append((pkg, pkg.definitions[stat_definition_id]))
    return results

