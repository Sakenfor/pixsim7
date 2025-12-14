"""
Plugin Catalog API Routes
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.plugins import router

manifest = PluginManifest(
    id="plugins",
    name="Plugin Catalog API",
    version="1.0.0",
    description="UI plugin discovery, enabling/disabling, and settings management",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["plugins"],
    dependencies=[],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
