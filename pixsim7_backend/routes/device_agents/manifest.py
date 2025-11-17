"""
Device Agents API Routes Plugin
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.v1.device_agents import router

manifest = PluginManifest(
    id="device_agents",
    name="Device Agents API",
    version="1.0.0",
    description="Android device agent endpoints",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["device-agents"],
    dependencies=[],  # Public endpoints for agents
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
