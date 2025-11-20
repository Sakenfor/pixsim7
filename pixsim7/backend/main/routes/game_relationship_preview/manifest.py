"""
Game Relationship Preview API Routes Plugin

Provides read-only preview endpoints for relationship tier and intimacy
level computation using world-specific schemas.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.game_relationship_preview import router

manifest = PluginManifest(
    id="game_relationship_preview",
    name="Game Relationship Preview API",
    version="1.0.0",
    description="Preview relationship tiers and intimacy levels using world schemas",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/game/relationships",
    tags=["game-relationships", "preview"],
    dependencies=[],  # No auth required for preview endpoints
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
