"""
Game Sessions API Routes Plugin
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.v1.game_sessions import router

manifest = PluginManifest(
    id="game_sessions",
    name="Game Sessions API",
    version="1.0.0",
    description="Game session management and state",
    author="PixSim Team",
    prefix="/api/v1/game/sessions",
    tags=["game-sessions"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
