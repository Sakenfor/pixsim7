"""
WebSocket API Routes Plugin

Real-time WebSocket endpoints for generation updates, events, and agent command bridge.
"""

from fastapi import APIRouter
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.websocket import router as _ws_router
from pixsim7.backend.main.api.v1.ws_agent_cmd import router as _agent_cmd_router
from pixsim7.backend.main.api.v1.ws_chat import router as _ws_chat_router

# Merge all WS routers
router = APIRouter()
router.include_router(_ws_router)
router.include_router(_agent_cmd_router)
router.include_router(_ws_chat_router)

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
