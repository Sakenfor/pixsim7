"""
Agent Tokens API Routes Plugin
"""
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.agent_tokens import router

manifest = PluginManifest(
    id="agent_tokens",
    name="Agent Tokens API",
    version="1.0.0",
    description="Mint short-lived JWTs for AI agent / service principals",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["dev", "agent-tokens"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,
    permissions=[],
)
