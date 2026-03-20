"""
Game Objects API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.game_objects import router

manifest = PluginManifest(
    id="game_objects",
    name="Game Objects API",
    version="1.0.0",
    description="Generic runtime object authoring API backed by game items",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/game/objects",
    tags=["game-objects"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
