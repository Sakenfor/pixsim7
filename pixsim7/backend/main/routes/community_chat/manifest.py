"""
Community Chat API Routes Plugin

Shared-room user chat (plan ``community-chat``, checkpoint
``community-room``): REST history/send + a thin WebSocket receive
channel. DM routes arrive in a later checkpoint on the same substrate.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.community_chat import router

manifest = PluginManifest(
    id="community_chat",
    name="Community Chat API",
    version="1.0.0",
    description="Shared-room community chat: REST send/history + WebSocket live channel",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["chat", "community"],
    dependencies=["auth"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
