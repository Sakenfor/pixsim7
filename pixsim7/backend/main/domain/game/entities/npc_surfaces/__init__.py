"""
NPC Surfaces - Plugin-Extensible Expression Role System

Provides a registry and package system for NPC visual expression surfaces.
A "surface" represents a visual expression context for an NPC (portrait,
dialogue, closeup, reaction, mood, etc.).

This allows plugins to define custom surface types without schema changes
to the NpcExpression table. The NpcExpression.meta field is used to tag
expressions with surface types, and the registry provides discovery and
metadata for these surface types.

Usage:
    from pixsim7.backend.main.domain.npc_surfaces import (
        NpcSurfacePackage,
        register_npc_surface_package,
        get_npc_surface_package,
        list_npc_surface_packages,
        find_surface_types,
    )

    # Register a package
    pkg = NpcSurfacePackage(
        id="core.portrait",
        label="Core Portrait Surfaces",
        category="portrait",
        surface_types={
            "portrait": {"usage": "Standard NPC portrait for dialogue UI"},
            "dialogue": {"usage": "Talking/conversation animation"},
        }
    )
    register_npc_surface_package(pkg)

    # Query packages
    packages = list_npc_surface_packages()
    portrait_pkg = get_npc_surface_package("core.portrait")

    # Find all packages that define a specific surface type
    portrait_defs = find_surface_types("portrait")
"""

from .package_registry import (
    NpcSurfacePackage,
    register_npc_surface_package,
    get_npc_surface_package,
    list_npc_surface_packages,
    find_surface_types,
    clear_npc_surface_packages,
)
from .core_surfaces import (
    register_core_surface_packages,
    reset_core_surface_registration,
)

from .validation import (
    validate_expression_meta,
    build_expression_meta,
    get_surface_type,
)

# Import core_surfaces to trigger registration at import time
from . import core_surfaces  # noqa: F401

__all__ = [
    "NpcSurfacePackage",
    "register_npc_surface_package",
    "get_npc_surface_package",
    "list_npc_surface_packages",
    "find_surface_types",
    "clear_npc_surface_packages",
    "register_core_surface_packages",
    "reset_core_surface_registration",
    "validate_expression_meta",
    "build_expression_meta",
    "get_surface_type",
]
