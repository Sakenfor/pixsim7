"""
POV First-Person Plugin

Provides composition roles for first-person perspective games.
Adds pov_hands role for player hand overlays.

This is a content-only plugin (no API routes).
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.domain.composition import (
    CompositionPackage,
    CompositionRoleDefinition,
    register_composition_package,
)


# =============================================================================
# Composition Package Definition
# =============================================================================

POV_FIRST_PERSON_PACKAGE = CompositionPackage(
    id="pov.first_person",
    label="First-Person POV",
    description="Composition roles for first-person perspective games",
    plugin_id="pov-first-person",
    roles=[
        CompositionRoleDefinition(
            id="pov_hands",
            label="POV Hands",
            description="First-person player hands overlay",
            color="amber",
            default_layer=2,  # Foreground
            tags=["pov", "hands", "player", "foreground", "overlay"],
            slug_mappings=["pov:hands", "role:pov_hands", "hands"],
            namespace_mappings=["pov"],
        ),
        CompositionRoleDefinition(
            id="pov_held_item",
            label="POV Held Item",
            description="Item held in player's hands (weapon, tool, etc.)",
            color="yellow",
            default_layer=2,  # Same layer as hands
            tags=["pov", "item", "held", "foreground"],
            slug_mappings=["pov:item", "pov:held"],
            namespace_mappings=[],
        ),
    ],
    recommended_for=["first_person", "pov_adventure", "fps", "immersive_sim"],
    version="1.0.0",
)


# =============================================================================
# Plugin Manifest
# =============================================================================

manifest = PluginManifest(
    id="pov-first-person",
    name="First-Person POV Composition",
    version="1.0.0",
    description="Adds POV hands and held item composition roles for first-person games",
    author="PixSim Team",
    kind="content",  # Data-only, no API routes
    prefix="",  # No API prefix needed
    tags=["pov", "first-person", "composition"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,
    provides=["composition_packages"],
    permissions=[],
    frontend_manifest={
        "pluginId": "pov-first-person",
        "pluginName": "First-Person POV Composition",
        "version": "1.0.0",
        "compositionPackages": ["pov.first_person"],
    },
)


# =============================================================================
# Registration Hook
# =============================================================================

def on_load() -> None:
    """Called when plugin loads. Registers the composition package."""
    register_composition_package(POV_FIRST_PERSON_PACKAGE)
