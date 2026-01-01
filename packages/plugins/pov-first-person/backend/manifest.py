"""
POV First-Person Plugin

Provides composition roles for first-person perspective games.
Adds pov_hands role for player hand overlays.

This is a content-only plugin (no API routes).
"""

from pathlib import Path

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.domain.composition import register_composition_package_from_yaml


PACKAGE_PATH = Path(__file__).with_name("composition-package.yaml")


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

def on_load(app) -> None:
    """Called when plugin loads. Registers the composition package."""
    register_composition_package_from_yaml(PACKAGE_PATH, plugin_id=manifest.id)
