"""
Interactions API Routes Plugin

Provides REST API for listing available interactions and executing them.
Uses PluginContext for permission-aware access to session/world data.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.interactions import router

manifest = PluginManifest(
    id="interactions",
    name="Interactions API",
    version="2.0.0",  # Updated to use PluginContext
    description="Interaction availability and execution - core interaction framework",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1/game/interactions",
    tags=["interactions", "game"],
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
