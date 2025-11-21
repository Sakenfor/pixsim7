"""
WebSocket API Routes Plugin

Real-time WebSocket endpoints for generation updates and events.
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.v1.websocket import router

manifest = PluginManifest(
    id="websocket",
    name="WebSocket API",
    version="1.0.0",
    description="WebSocket endpoints for real-time updates (generations, events)",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["websocket", "realtime"],
    dependencies=[],  # WebSocket doesn't strictly depend on auth (handles token separately)
    requires_db=False,
    requires_redis=False,
    enabled=True,
    required=True,  # Critical for real-time features
)
