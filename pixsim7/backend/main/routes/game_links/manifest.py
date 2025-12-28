"""
Game Links API Routes Plugin

Exposes ObjectLink template-to-runtime resolution for the game runtime.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.game_links import router

manifest = PluginManifest(
    id="game_links",
    name="Game Links API",
    version="1.0.0",
    description="Template-to-runtime entity resolution via ObjectLink",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/game/links",
    tags=["game-links"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
