"""
Server Info API Routes Plugin

Provides public server identity information for multi-server client support.
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.server import router

manifest = PluginManifest(
    id="server",
    name="Server Info API",
    version="1.0.0",
    description="Public server identity and metadata for multi-server support",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["server", "identity", "multi-server"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,

    # No permissions needed - this is public metadata
    permissions=[],
)
