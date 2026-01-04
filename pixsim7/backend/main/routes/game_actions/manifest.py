"""
Game Actions API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.game_actions import router

manifest = PluginManifest(
    id="game_actions",
    name="Game Actions API",
    version="1.0.0",
    description="Game action type registry for dynamic UI generation",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/game/actions",
    tags=["game-actions"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,
)
