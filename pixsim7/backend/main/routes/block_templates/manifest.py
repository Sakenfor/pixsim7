"""
Block Templates API Routes Plugin

Reusable prompt composition templates with slot-based random block selection.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.block_templates import router

manifest = PluginManifest(
    id="block_templates",
    name="Block Templates API",
    version="1.0.0",
    description="Reusable prompt composition templates with slot-based random block selection",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["block-templates"],
    dependencies=["auth", "action_blocks"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
