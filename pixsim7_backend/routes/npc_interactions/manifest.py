"""
NPC Interactions API Routes Plugin
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.v1.npc_interactions import router

manifest = PluginManifest(
    id="npc_interactions",
    name="NPC Interactions API",
    version="1.0.0",
    description="NPC interaction availability and execution",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/game/interactions",
    tags=["npc-interactions", "game"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
