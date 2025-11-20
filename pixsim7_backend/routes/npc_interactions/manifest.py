"""
NPC Interactions API Routes Plugin

Provides REST API for listing available NPC interactions and executing them.
Uses PluginContext for permission-aware access to session/world data.
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.v1.npc_interactions import router

manifest = PluginManifest(
    id="npc_interactions",
    name="NPC Interactions API",
    version="2.0.0",  # Updated to use PluginContext
    description="NPC interaction availability and execution - core interaction framework",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/game/interactions",
    tags=["npc-interactions", "game"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,

    # Declare permissions for PluginContext capabilities
    permissions=[
        "session:read",       # Read session state for gating checks
        "session:write",      # Update relationships, flags, inventory
        "world:read",         # Read world metadata (interaction definitions)
        "npc:read",           # Read NPC metadata (interaction overrides)
        "generation:submit",  # Launch dialogue/scene generation
        "log:emit",          # Structured logging
    ],
)
