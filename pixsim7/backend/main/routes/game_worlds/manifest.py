"""
Game Worlds API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.game_worlds import router

manifest = PluginManifest(
    id="game_worlds",
    name="Game Worlds API",
    version="1.0.0",
    description="Game world management",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/game/worlds",
    tags=["game-worlds"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
