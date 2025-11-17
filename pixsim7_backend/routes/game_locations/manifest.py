"""
Game Locations API Routes Plugin
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.v1.game_locations import router

manifest = PluginManifest(
    id="game_locations",
    name="Game Locations API",
    version="1.0.0",
    description="Game location management",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/game/locations",
    tags=["game-locations"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
