"""
Game Behavior API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.game_behavior import router

manifest = PluginManifest(
    id="game_behavior",
    name="Game Behavior API",
    version="1.0.0",
    description="NPC behavior system management (activities, routines, preferences)",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/game/worlds",
    tags=["game-behavior"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
