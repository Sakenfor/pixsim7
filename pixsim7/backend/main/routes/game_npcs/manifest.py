"""
Game NPCs API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.game_npcs import router

manifest = PluginManifest(
    id="game_npcs",
    name="Game NPCs API",
    version="1.0.0",
    description="Game NPC management and schedule authoring",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/game/npcs",
    tags=["game-npcs"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
