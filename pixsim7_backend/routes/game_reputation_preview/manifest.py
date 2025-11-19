"""
Game Reputation Preview API Routes Plugin

Provides read-only preview endpoints for reputation band computation
based on relationship data, faction standings, and world schemas.
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.v1.game_reputation_preview import router

manifest = PluginManifest(
    id="game_reputation_preview",
    name="Game Reputation Preview API",
    version="1.0.0",
    description="Preview reputation bands using relationship data and world schemas",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/game/reputation",
    tags=["game-reputation", "preview"],
    dependencies=[],  # No auth required for preview endpoints
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
