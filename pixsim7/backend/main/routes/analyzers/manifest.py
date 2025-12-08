"""
Analyzers API Routes Plugin
"""

from pixsim7.backend.main.infrastructure.plugins.types import PluginManifest
from pixsim7.backend.main.api.v1.analyzers import router

manifest = PluginManifest(
    id="analyzers",
    name="Analyzers API",
    version="1.0.0",
    description="Prompt analyzer discovery and configuration",
    author="PixSim Team",
    kind="route",
    prefix="/api/v1",
    tags=["analyzers"],
    dependencies=[],
    requires_db=False,
    requires_redis=False,
    enabled=True,
)
