"""
Game Scenes API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.game_scenes import router

manifest = PluginManifest(
    id="game_scenes",
    name="Game Scenes API",
    version="1.0.0",
    description="Game scene management (nodes, edges, graph)",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/game/scenes",
    tags=["game-scenes"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
