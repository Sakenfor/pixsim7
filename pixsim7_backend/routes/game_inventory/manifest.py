"""
Game Inventory API Routes Plugin
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.v1.game_inventory import router

manifest = PluginManifest(
    id="game_inventory",
    name="Game Inventory API",
    version="1.0.0",
    description="Player inventory and item management",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["game-inventory"],
    dependencies=["auth", "game_sessions"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
