"""
Lineage API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.lineage import router

manifest = PluginManifest(
    id="lineage",
    name="Lineage API",
    version="1.0.0",
    description="Asset lineage and dependency tracking",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["lineage"],
    dependencies=["auth", "assets"],
    requires_db=True,
    requires_redis=False,
    enabled=True,
)
