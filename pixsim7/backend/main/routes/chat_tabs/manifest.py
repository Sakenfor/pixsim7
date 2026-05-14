"""
Chat Tabs API Routes Plugin

Server-persisted AI Assistant tab list. See plan
``chat-tab-server-persistence``.
"""
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.chat_tabs import router

manifest = PluginManifest(
    id="chat_tabs",
    name="Chat Tabs API",
    version="1.0.0",
    description="Server-persisted AI Assistant chat tabs (label, draft, order, plan binding) referencing ChatSession",
    author="PixSim Team",
    kind="route",
    prefix="",
    tags=["chat-tabs"],
    dependencies=[],
    requires_db=True,
    requires_redis=False,
    enabled=True,
    permissions=[],
)
