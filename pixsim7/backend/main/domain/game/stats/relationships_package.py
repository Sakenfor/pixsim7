"""
Built-in Relationships Stat Package

Registers a core relationships package with the stat package registry
so tools and plugins can discover and reuse it as a reusable bundle.

This does not force any world/project to use relationships; worlds
can opt in by copying or referencing the provided StatDefinition in
their stats_config.
"""

from __future__ import annotations

from .migration import get_default_relationship_definition
from .package_registry import StatPackage, register_stat_package


RELATIONSHIPS_PACKAGE_ID = "core.relationships"


def register_core_relationships_package() -> None:
    """Register the built-in core relationships stat package."""
    definition = get_default_relationship_definition()
    pkg = StatPackage(
        id=RELATIONSHIPS_PACKAGE_ID,
        label="Core Relationships",
        description="Affinity, trust, chemistry, tension with tiers and intimacy levels.",
        category="social",
        definitions={"relationships": definition},
        source_plugin_id=None,
    )
    register_stat_package(pkg)


# NOTE: Package is registered via register_core_stat_packages() in __init__.py
# This allows plugin system to control when packages are loaded.

