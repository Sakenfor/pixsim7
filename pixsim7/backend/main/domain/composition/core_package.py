"""
Core Composition Package

Provides the base composition roles that are always available.
These match the roles defined in shared/composition-roles.yaml.

This package is auto-registered and cannot be deactivated.
"""

from .package_registry import (
    CompositionPackage,
    CompositionRoleDefinition,
    register_composition_package,
)


CORE_PACKAGE_ID = "core.base"


# Core role definitions (matching composition-roles.yaml)
CORE_ROLES = [
    CompositionRoleDefinition(
        id="main_character",
        label="Main Character",
        description="Primary subject/character in the scene",
        color="blue",
        default_layer=1,
        tags=["character", "subject", "primary"],
        slug_mappings=["char:hero", "pov:player", "role:char", "role:character"],
        namespace_mappings=["character", "person", "npc"],
    ),
    CompositionRoleDefinition(
        id="companion",
        label="Companion",
        description="Supporting characters (NPCs, pets, monsters)",
        color="purple",
        default_layer=1,
        tags=["character", "secondary", "npc"],
        slug_mappings=["char:npc", "char:monster"],
        namespace_mappings=["animal", "creature"],
    ),
    CompositionRoleDefinition(
        id="environment",
        label="Environment",
        description="Background, setting, location",
        color="green",
        default_layer=0,
        tags=["background", "setting", "location"],
        slug_mappings=["bg", "role:bg", "role:environment", "role:setting"],
        namespace_mappings=["location", "environment", "setting", "background", "scene", "place"],
    ),
    CompositionRoleDefinition(
        id="prop",
        label="Prop",
        description="Objects, vehicles, items",
        color="orange",
        default_layer=1,
        tags=["object", "item", "prop"],
        slug_mappings=[],
        namespace_mappings=["object", "prop", "vehicle"],
    ),
    CompositionRoleDefinition(
        id="style_reference",
        label="Style Reference",
        description="Style/aesthetic reference images",
        color="pink",
        default_layer=0,
        tags=["style", "reference", "aesthetic"],
        slug_mappings=["comic_frame"],
        namespace_mappings=["style"],
    ),
    CompositionRoleDefinition(
        id="effect",
        label="Effect",
        description="Lighting, camera, visual effects",
        color="cyan",
        default_layer=2,
        tags=["effect", "lighting", "camera"],
        slug_mappings=[],
        namespace_mappings=["lighting", "camera"],
    ),
]


CORE_COMPOSITION_PACKAGE = CompositionPackage(
    id=CORE_PACKAGE_ID,
    label="Core Composition",
    description="Base composition roles for image/video generation",
    plugin_id=None,  # Built-in
    roles=CORE_ROLES,
    recommended_for=[],  # Always available
    version="1.0.0",
)


_registered = False


def register_core_composition_package() -> None:
    """
    Register the core composition package.

    This is called automatically during app startup.
    Safe to call multiple times (idempotent).
    """
    global _registered
    if _registered:
        return

    register_composition_package(CORE_COMPOSITION_PACKAGE)
    _registered = True
