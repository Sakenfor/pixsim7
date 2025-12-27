"""
NPC State Management API Routes Plugin

Provides endpoints for NPC memories, emotions, milestones,
world awareness, and personality evolution.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.npc_state import router

manifest = PluginManifest(
    id="npc_state",
    name="NPC State Management API",
    version="1.0.0",
    description="Manage NPC memories, emotions, milestones, world events, and personality evolution",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["npc", "state", "memories", "emotions"],
    dependencies=[],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
