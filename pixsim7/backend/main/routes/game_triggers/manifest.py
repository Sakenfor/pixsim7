"""
Game Triggers API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.game_triggers import router

manifest = PluginManifest(
    id="game_triggers",
    name="Game Triggers API",
    version="1.0.0",
    description="Game trigger management (world/location/scene hotspots)",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/game/triggers",
    tags=["game-triggers"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
