"""
WebSocket API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.websocket import router

manifest = PluginManifest(
    id="websocket",
    name="WebSocket API",
    version="1.0.0",
    description="WebSocket endpoints for real-time updates (generations, events)",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["websocket", "realtime"],
    dependencies=["auth"],
    requires_db=False,
    requires_redis=False,
    enabled=True,
)
