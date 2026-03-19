"""Agent Profiles API Routes Plugin"""
from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.agent_profiles import router

manifest = PluginManifest(
    id="agent_profiles",
    name="Agent Profiles API",
    version="1.0.0",
    description="CRUD + token minting for persistent AI agent identities",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["dev", "agent-profiles"],
    dependencies=[],
    requires_db=True,
    requires_redis=False,
    enabled=True,
    permissions=[],
)
