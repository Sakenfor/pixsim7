"""
Characters API Routes Plugin

Character registry system for reusable characters with game NPC integration.
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.v1.characters import router

manifest = PluginManifest(
    id="characters",
    name="Character Registry API",
    version="1.0.0",
    description="Persistent character registry with template expansion and game integration",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["characters"],
    dependencies=["auth", "prompts", "action_blocks"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
