"""
Character Identity Graph API Routes Plugin

Admin-only API for querying and analyzing the character identity graph.
Provides unified view of characters, instances, NPCs, scenes, and assets.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.character_graph import router

manifest = PluginManifest(
    id="character_graph",
    name="Character Identity Graph API",
    version="1.0.0",
    description="Graph query and analytics API for character, NPC, scene, and asset relationships",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/character-graph",
    tags=["character-graph", "admin"],
    dependencies=["characters", "game_scenes", "assets", "generations"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
