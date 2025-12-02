"""
Game Relationship Preview API Routes Plugin

DEPRECATED: This plugin is replaced by the generic stat_preview API.

Provides read-only preview endpoints for relationship tier and intimacy
level computation using world-specific schemas.

MIGRATION:
    Use /api/v1/stats/preview-entity-stats instead:
    - Replaces /preview-tier and /preview-intimacy
    - Works with any stat type, not just relationships
    - Uses StatEngine and WorldStatsConfig

This plugin will be removed in a future version after frontend migration.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.game_relationship_preview import router

manifest = PluginManifest(
    id="game_relationship_preview",
    name="Game Relationship Preview API (DEPRECATED)",
    version="1.0.0",
    description="[DEPRECATED] Use stat_preview API instead. Preview relationship tiers and intimacy levels using world schemas",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/game/relationships",
    tags=["game-relationships", "preview", "deprecated"],
    dependencies=[],  # No auth required for preview endpoints
    requires_db=True,
    requires_redis=False,
    enabled=False,  # DISABLED - Use stat_preview API instead
)
