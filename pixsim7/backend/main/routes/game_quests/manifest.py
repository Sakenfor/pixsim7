"""
Game Quests API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.game_quests import router

manifest = PluginManifest(
    id="game_quests",
    name="Game Quests API",
    version="1.0.0",
    description="Quest and objective tracking for game sessions",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/game/quests",
    tags=["game-quests"],
    dependencies=["auth", "game_sessions"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
