"""
Service Info API Routes Plugin

Provides service metadata for discovery by launcher and other services.
"""

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.api.v1.dev_info import router

manifest = PluginManifest(
    id="dev_info",
    name="Service Info API",
    version="1.0.0",
    description="Service metadata and discovery endpoint",
    author="PixSim Team",
    kind="route",
    prefix="",  # Routes already include /dev/info
    tags=["dev", "discovery", "metadata"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,

    # No permissions needed - this is read-only service metadata
    permissions=[],
)
