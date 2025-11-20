"""
Game NPC Mood Preview API Routes Plugin

Provides read-only preview endpoints for NPC mood computation
using valence-arousal model and world-specific schemas.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.game_npc_mood_preview import router

manifest = PluginManifest(
    id="game_npc_mood_preview",
    name="Game NPC Mood Preview API",
    version="1.0.0",
    description="Preview NPC mood states using valence-arousal model and emotional states",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/game/npc",
    tags=["game-npc", "mood", "preview"],
    dependencies=[],  # No auth required for preview endpoints
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
